import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import type { ServerStatsConfigSchema } from "./server-stats.config.js";

vi.mock("#core/runtime.js", () => ({ modules: [], client: {} }));

const mocks = vi.hoisted(() => ({
  getConfigForModuleIn: vi.fn(),
  getActivatedGuildIds: vi.fn(async () => ["guild-1"]),
  dailyStats: vi.fn(),
  purgeBefore: vi.fn(async () => {}),
}));
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn: mocks.getConfigForModuleIn },
}));
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds: mocks.getActivatedGuildIds },
}));
vi.mock("./services/store.js", () => ({
  default: { dailyStats: mocks.dailyStats, purgeBefore: mocks.purgeBefore },
}));

const { postReport, serverStatsTasks } = await import("./tasks.js");

const module = { id: "server-stats" } as Module<ServerStatsConfigSchema>;
const client = {
  guilds: {
    cache: { has: (id: string) => id !== "gone" },
    fetch: async () => ({ memberCount: 120 }),
  },
} as unknown as Client<true>;
const day = new Date("2026-10-13T00:00:00Z");

function fakeConfig(channel: unknown) {
  const values: Record<string, unknown> = {
    reportChannel: channel,
    showTopMembers: true,
  };
  return {
    get: (key: string) => values[key],
    t: (key: string) => key,
    locale: "en",
  };
}

const stats = {
  startedAt: day,
  joins: 0,
  leaves: 0,
  messages: 1,
  activeMembers: 1,
  activeChannels: 1,
  reactions: 0,
  topChannels: [],
  topMembers: [],
  topReactions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("postReport", () => {
  it("posts the report without pinging anyone", async () => {
    const send = vi.fn(async () => ({}));
    mocks.getConfigForModuleIn.mockResolvedValue(
      fakeConfig({ isSendable: () => true, send })
    );
    mocks.dailyStats.mockResolvedValue(stats);

    await postReport(client, module, "guild-1", day);

    expect(mocks.dailyStats).toHaveBeenCalledWith("guild-1", day);
    const [message] = send.mock.calls[0] as unknown as [
      {
        embeds: { data: { fields: { value: string }[] } }[];
        allowedMentions: unknown;
      },
    ];
    expect(message.allowedMentions).toEqual({ parse: [] });
    expect(message.embeds[0]!.data.fields[0]!.value).toBe("120");
  });

  it("posts nothing without a report channel", async () => {
    mocks.getConfigForModuleIn.mockResolvedValue(fakeConfig(undefined));
    await postReport(client, module, "guild-1", day);
    expect(mocks.dailyStats).not.toHaveBeenCalled();
  });

  it("posts nothing before counting started", async () => {
    const send = vi.fn();
    mocks.getConfigForModuleIn.mockResolvedValue(
      fakeConfig({ isSendable: () => true, send })
    );
    mocks.dailyStats.mockResolvedValue(null);
    await postReport(client, module, "guild-1", day);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("daily-report task", () => {
  it("runs at Paris midnight, reports the previous day and purges old counters", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T22:00:05Z") });
    mocks.getConfigForModuleIn.mockResolvedValue(
      fakeConfig({ isSendable: () => true, send: vi.fn(async () => ({})) })
    );
    mocks.dailyStats.mockResolvedValue(stats);
    const [task] = serverStatsTasks(module);

    expect(task).toMatchObject({
      schedule: "0 0 * * *",
      timezone: "Europe/Paris",
    });
    await task!.run(client);
    vi.useRealTimers();

    expect(mocks.dailyStats).toHaveBeenCalledWith(
      "guild-1",
      new Date("2026-10-13T00:00:00Z")
    );
    expect(mocks.purgeBefore).toHaveBeenCalledWith(
      new Date("2026-09-13T00:00:00Z")
    );
  });

  it("skips the servers the bot has left", async () => {
    mocks.getActivatedGuildIds.mockResolvedValueOnce(["gone"]);
    const [task] = serverStatsTasks(module);

    await task!.run(client);

    expect(mocks.getConfigForModuleIn).not.toHaveBeenCalled();
    expect(mocks.purgeBefore).toHaveBeenCalledOnce();
  });

  it("keeps going when a guild fails", async () => {
    mocks.getActivatedGuildIds.mockResolvedValueOnce(["guild-0", "guild-1"]);
    mocks.getConfigForModuleIn
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(fakeConfig(undefined));
    const [task] = serverStatsTasks(module);

    await task!.run(client);

    expect(mocks.getConfigForModuleIn).toHaveBeenCalledTimes(2);
    expect(mocks.purgeBefore).toHaveBeenCalledOnce();
  });
});
