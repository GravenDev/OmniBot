import { Collection, MessageFlags, type Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import type { RngdleConfigSchema } from "./rngdle.config.js";

const { send, syncAll, pendingReminders, mentionable } = vi.hoisted(() => ({
  send: vi.fn(),
  syncAll: vi.fn(),
  pendingReminders: vi.fn(),
  mentionable: vi.fn(),
}));
const pruneCards = vi.hoisted(() => vi.fn());

vi.mock("#core/services/config.service.js", () => ({
  default: {
    getConfigForModuleIn: async () => ({
      t: (key: string) => key,
      locale: "en",
      get: () => ({ isSendable: () => true, send }),
    }),
  },
}));
vi.mock("#core/services/mention.service.js", () => ({
  default: { mentionable },
}));
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds: async () => ["guild"] },
}));
vi.mock("./services/sync.service.js", () => ({ default: { syncAll } }));
vi.mock("./services/share-cards.service.js", () => ({
  default: { pruneCards },
}));
vi.mock("./services/store.service.js", () => ({
  default: { pendingReminders },
}));
vi.mock("#lib/logger.js", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { loggerMaker: () => logger };
});
vi.mock("./services/views.js", () => ({
  dailyLeaderboard: async () => ({
    image: Buffer.from("png"),
    winnerIds: ["winner"],
  }),
  dailyRecap: async () => ({
    participants: 4,
    rarest: null,
    worst: null,
    streaks: [],
  }),
}));

const { rngdleMaintenanceTasks, rngdleTasks } = await import("./tasks.js");

/** A client on the given guilds. */
function clientIn(...guildIds: string[]): Client<true> {
  return {
    guilds: {
      cache: new Collection(
        guildIds.map((id) => [id, { id, available: true }])
      ),
    },
  } as unknown as Client<true>;
}

function task(id: string) {
  return rngdleTasks({
    id: "rngdle",
  } as unknown as Module<RngdleConfigSchema>).find(
    (declared) => declared.id === id
  )!;
}

beforeEach(() => {
  vi.clearAllMocks();
  syncAll.mockResolvedValue(undefined);
  pendingReminders.mockResolvedValue([]);
  mentionable.mockImplementation(
    async (_guildId: string, ids: string[]) => ids
  );
});

describe("daily leaderboard task", () => {
  it("posts the recap text with the profile, history and overall leaderboard buttons", async () => {
    const task = rngdleTasks({
      id: "rngdle",
    } as unknown as Module<RngdleConfigSchema>).find(
      (declared) => declared.id === "daily-leaderboard"
    )!;

    await task.run(clientIn("guild"));

    const [message] = send.mock.calls[0]! as [
      {
        content: string;
        components: { toJSON(): { components: { custom_id?: string }[] } }[];
        flags: number;
      },
    ];
    expect(message.flags).toBe(MessageFlags.SuppressNotifications);
    expect(message.content.split("\n")).toEqual([
      "daily.message",
      "daily.participants",
    ]);
    expect(
      message.components.flatMap((row) =>
        row.toJSON().components.map((button) => button.custom_id)
      )
    ).toEqual([
      "rngdle-nav:profile",
      "rngdle-nav:history",
      "rngdle-nav:overall",
    ]);
  });

  it("still posts the leaderboard from the stored rolls when the sync fails", async () => {
    syncAll.mockRejectedValue(new Error("database down"));

    await task("daily-leaderboard").run(clientIn("guild"));

    expect(send).toHaveBeenCalledOnce();
  });

  it("skips a guild the bot left", async () => {
    await task("daily-leaderboard").run(clientIn());

    expect(send).not.toHaveBeenCalled();
  });
});

describe("reminders task", () => {
  it("mentions the pending subscribers, notifying only those who accept pings", async () => {
    pendingReminders.mockResolvedValue(["a", "b"]);
    mentionable.mockResolvedValue(["b"]);

    const client = clientIn("guild");

    await task("reminders").run(client);

    expect(syncAll).toHaveBeenCalledExactlyOnceWith(client);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      content: "remind.message",
      allowedMentions: { users: ["b"] },
    });
  });

  it("posts nothing when everyone already rolled", async () => {
    await task("reminders").run(clientIn("guild"));

    expect(send).not.toHaveBeenCalled();
  });

  it("still reminds from the stored rolls when the sync fails", async () => {
    syncAll.mockRejectedValue(new Error("database down"));
    pendingReminders.mockResolvedValue(["a"]);

    await task("reminders").run(clientIn("guild"));

    expect(send).toHaveBeenCalledOnce();
  });

  it("skips a guild the bot left", async () => {
    pendingReminders.mockResolvedValue(["a"]);

    await task("reminders").run(clientIn());

    expect(pendingReminders).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("card marks pruning", () => {
  // The marks are deleted two days later per the privacy policy, even on an
  // instance where the module is skipped: a maintenance task, not an onLoad one.
  it("is a maintenance task, not a task of the loaded module", async () => {
    const [prune] = rngdleMaintenanceTasks();

    // A night missed while the bot was down is caught up at start.
    expect(prune).toMatchObject({
      id: "cards",
      schedule: "0 2 * * *",
      runOnStart: true,
    });
    expect(
      rngdleTasks({
        id: "rngdle",
      } as unknown as Module<RngdleConfigSchema>).map((declared) => declared.id)
    ).not.toContain("cards");
    await prune!.run({} as Client<true>);
    expect(pruneCards).toHaveBeenCalledOnce();
  });
});
