import {
  type Client,
  DiscordAPIError,
  IntentsBitField,
  RESTJSONErrorCodes,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("#lib/database.js", () => ({ default: { birthday: { findMany } } }));
const service = vi.hoisted(() => ({
  remove: vi.fn(async () => true),
  clearGuild: vi.fn(async () => undefined),
}));
vi.mock("./birthday.service.js", () => ({ default: service }));
const info = vi.hoisted(() => vi.fn());
vi.mock("#lib/logger.js", () => ({
  loggerMaker: () => ({ info, warn: vi.fn(), error: vi.fn() }),
}));

const { default: departures } = await import("./departures.service.js");

// Whether the module is enabled, guild by guild, as the task asks it.
const activeIn = (guildIds: string[]) => async (guildId: string) =>
  guildIds.includes(guildId);

const fetchMember = vi.fn();
const apiError = (code: number) =>
  new DiscordAPIError({ code, message: "" }, code, 404, "GET", "/", {});

// Without the members intent, the case this sweep exists for: Discord is
// asked member by member.
function client(guilds = ["g"], available = true): Client<true> {
  return {
    guilds: {
      cache: new Map(
        guilds.map((id) => [
          id,
          {
            id,
            available,
            members: { fetch: fetchMember },
            client: { options: { intents: new IntentsBitField() } },
          },
        ])
      ),
    },
  } as unknown as Client<true>;
}

/** Discord says who is here; `broken` makes it fail for that member. */
function present(...userIds: string[]) {
  fetchMember.mockImplementation(async ({ user }: { user: string }) => {
    if (user === "broken") {
      throw apiError(RESTJSONErrorCodes.MissingAccess);
    }
    if (userIds.includes(user)) {
      return { id: user };
    }
    throw apiError(RESTJSONErrorCodes.UnknownMember);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sweep", () => {
  it("deletes the birthdays of members gone, keeps those still here", async () => {
    findMany.mockResolvedValue([
      { guildId: "g", userId: "gone" },
      { guildId: "g", userId: "here" },
    ]);
    present("here");

    await departures.sweep(client(), activeIn(["g"]));

    expect(service.remove).toHaveBeenCalledExactlyOnceWith("g", "gone");
    expect(service.clearGuild).not.toHaveBeenCalled();
  });

  // Checking a large guild member by member takes minutes: a member found
  // gone early who comes back and registers again meanwhile keeps the new
  // birthday, rather than losing it to a deletion at the end.
  it("deletes each birthday right after checking its member", async () => {
    findMany.mockResolvedValue([
      { guildId: "g", userId: "gone" },
      { guildId: "g", userId: "here" },
    ]);
    present("here");

    await departures.sweep(client(), activeIn(["g"]));

    expect(service.remove.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMember.mock.invocationCallOrder[1]!
    );
  });

  // A guild the bot comes back to can hold hundreds of departed members.
  it("logs the deletions once per guild, with their count", async () => {
    findMany.mockResolvedValue([
      { guildId: "g", userId: "gone" },
      { guildId: "g", userId: "left" },
      { guildId: "g", userId: "here" },
    ]);
    present("here");

    await departures.sweep(client(), activeIn(["g"]));

    expect(info).toHaveBeenCalledExactlyOnceWith(
      "Departed members' birthdays removed | guildId = g | count = 2"
    );
  });

  it("deletes nothing when every member is still here", async () => {
    findMany.mockResolvedValue([{ guildId: "g", userId: "here" }]);
    present("here");

    await departures.sweep(client(), activeIn(["g"]));

    expect(service.remove).not.toHaveBeenCalled();
  });

  it("keeps a birthday when Discord fails for its member, and goes on", async () => {
    findMany.mockResolvedValue([
      { guildId: "g", userId: "broken" },
      { guildId: "g", userId: "gone" },
    ]);
    present();

    await departures.sweep(client(), activeIn(["g"]));

    expect(service.remove).toHaveBeenCalledExactlyOnceWith("g", "gone");
  });

  it("deletes the birthdays of a guild where the module is disabled", async () => {
    findMany.mockResolvedValue([{ guildId: "off", userId: "u" }]);

    await departures.sweep(client(["off"]), activeIn([]));

    expect(service.clearGuild).toHaveBeenCalledExactlyOnceWith("off");
    expect(fetchMember).not.toHaveBeenCalled();
  });

  it("keeps the birthdays of a guild the bot left, as its configuration", async () => {
    findMany.mockResolvedValue([{ guildId: "left", userId: "u" }]);

    await departures.sweep(client([]), activeIn(["left"]));

    expect(fetchMember).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
    expect(service.clearGuild).not.toHaveBeenCalled();
  });

  it("waits for an unavailable guild", async () => {
    findMany.mockResolvedValue([{ guildId: "g", userId: "u" }]);

    await departures.sweep(client(["g"], false), activeIn(["g"]));

    expect(fetchMember).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
  });

  it("goes on with the other guilds when one fails", async () => {
    findMany.mockResolvedValue([
      { guildId: "broken", userId: "u" },
      { guildId: "g", userId: "gone" },
    ]);
    present();
    const isActivated = async (guildId: string) => {
      if (guildId === "broken") {
        throw new Error("database down");
      }
      return true;
    };

    await departures.sweep(client(["broken", "g"]), isActivated);

    expect(service.remove).toHaveBeenCalledExactlyOnceWith("g", "gone");
  });
});
