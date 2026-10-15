import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import type { RngdleConfigSchema } from "./rngdle.config.js";

const { send, syncAll, pendingReminders, mentionable } = vi.hoisted(() => ({
  send: vi.fn(),
  syncAll: vi.fn(),
  pendingReminders: vi.fn(),
  mentionable: vi.fn(),
}));

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
vi.mock("./services/sync.js", () => ({ default: { syncAll } }));
vi.mock("./services/store.js", () => ({ default: { pendingReminders } }));
vi.mock("#lib/logger.js", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
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

const { rngdleTasks } = await import("./tasks.js");

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

    await task.run({} as Client<true>);

    const [message] = send.mock.calls[0]! as [
      {
        content: string;
        components: { toJSON(): { components: { custom_id?: string }[] } }[];
      },
    ];
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
});

describe("reminders task", () => {
  it("mentions the pending subscribers, notifying only those who accept pings", async () => {
    pendingReminders.mockResolvedValue(["a", "b"]);
    mentionable.mockResolvedValue(["b"]);

    await task("reminders").run({} as Client<true>);

    expect(syncAll).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledExactlyOnceWith({
      content: "remind.message",
      allowedMentions: { users: ["b"] },
    });
  });

  it("posts nothing when everyone already rolled", async () => {
    await task("reminders").run({} as Client<true>);

    expect(send).not.toHaveBeenCalled();
  });

  it("still reminds from the stored rolls when the sync fails", async () => {
    syncAll.mockRejectedValue(new Error("database down"));
    pendingReminders.mockResolvedValue(["a"]);

    await task("reminders").run({} as Client<true>);

    expect(send).toHaveBeenCalledOnce();
  });
});
