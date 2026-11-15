import {
  type Client,
  Collection,
  DiscordAPIError,
  RESTJSONErrorCodes,
  type Guild,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const allMembers = vi.hoisted(() => vi.fn());
vi.mock("./guild-members.js", () => ({ allMembers }));

const { memberPresence, sweepStoredMembers } =
  await import("./member-presence.js");

const logger = { warn: vi.fn(), error: vi.fn() } as never;

const fetch = vi.fn();

function guild(memberCount: number) {
  return { id: "g", memberCount, members: { fetch } } as unknown as Guild;
}

const apiError = (code: number) =>
  new DiscordAPIError({ code, message: "" }, code, 404, "GET", "/", {});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("memberPresence", () => {
  it("answers from the whole member list when it is complete", async () => {
    allMembers.mockResolvedValue(new Collection([["here", {}]]));
    const isPresent = await memberPresence(guild(1), logger);

    expect(await isPresent("here")).toBe(true);
    expect(await isPresent("gone")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the list is unavailable",
      () => allMembers.mockRejectedValue(new Error()),
    ],
    [
      "the list misses members",
      () => allMembers.mockResolvedValue(new Collection()),
    ],
  ])("asks Discord member by member when %s", async (_case, setUp) => {
    setUp();
    fetch.mockImplementation(async ({ user }: { user: string }) => {
      if (user === "here") {
        return { id: user };
      }
      throw apiError(RESTJSONErrorCodes.UnknownMember);
    });
    const isPresent = await memberPresence(guild(1), logger);

    expect(await isPresent("here")).toBe(true);
    expect(await isPresent("gone")).toBe(false);
    expect(fetch).toHaveBeenCalledWith({ user: "gone", force: true });
  });

  it("passes on a Discord error that does not say the member is gone", async () => {
    allMembers.mockRejectedValue(new Error());
    fetch.mockRejectedValue(apiError(RESTJSONErrorCodes.MissingAccess));
    const isPresent = await memberPresence(guild(1), logger);

    await expect(isPresent("u")).rejects.toThrow();
  });
});

describe("sweepStoredMembers", () => {
  const rows = [
    { guildId: "here", userId: "a" },
    { guildId: "off", userId: "b" },
    { guildId: "left", userId: "c" },
    { guildId: "down", userId: "d" },
    { guildId: "here", userId: "e" },
  ];
  const here = { ...guild(1), id: "here", available: true };
  const guilds = new Map([
    ["here", here],
    ["off", { id: "off", available: true }],
    ["down", { id: "down", available: false }],
  ]);
  const client = { guilds: { cache: guilds } } as unknown as Client<true>;

  beforeEach(() => {
    // "a" is still on the server, "e" is gone.
    allMembers.mockResolvedValue(new Collection([["a", {}]]));
  });

  it("hands each member of a guild the bot is on to the module, saying whether they are here", async () => {
    const clearGuild = vi.fn(async () => undefined);
    const sweepMember = vi.fn(async () => undefined);

    await sweepStoredMembers(client, rows, {
      isActivated: async (guildId) => guildId !== "off",
      clearGuild,
      sweepMember,
      logger,
    });

    expect(sweepMember.mock.calls).toEqual([
      [here, rows[0], true],
      [here, rows[4], false],
    ]);
    // Disabled: cleared. Left or unavailable: kept for later.
    expect(clearGuild).toHaveBeenCalledExactlyOnceWith("off");
  });

  it("goes on with the other members when one fails", async () => {
    const sweepMember = vi.fn(async () => undefined);
    sweepMember.mockRejectedValueOnce(new Error("database blip"));

    await sweepStoredMembers(client, rows, {
      isActivated: async () => true,
      clearGuild: vi.fn(),
      sweepMember,
      logger,
    });

    expect(sweepMember).toHaveBeenLastCalledWith(here, rows[4], false);
  });

  it("goes on with the other guilds when one fails", async () => {
    const sweepMember = vi.fn(async () => undefined);
    const failing = [{ guildId: "off", userId: "b" }, ...rows];

    await sweepStoredMembers(client, failing, {
      isActivated: async (guildId) => {
        if (guildId === "off") {
          throw new Error("database down");
        }
        return true;
      },
      clearGuild: vi.fn(),
      sweepMember,
      logger,
    });

    expect(sweepMember).toHaveBeenCalledWith(here, rows[4], false);
  });
});
