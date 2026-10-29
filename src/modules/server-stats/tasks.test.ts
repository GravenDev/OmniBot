import type { Client } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import type { ServerStatsConfigSchema } from "./server-stats.config.js";

vi.mock("#core/runtime.js", () => ({ modules: [], client: {} }));

const mocks = vi.hoisted(() => ({
  getConfigForModuleIn: vi.fn(),
  getActivatedGuildIds: vi.fn(async () => ["guild-1"]),
  dailyStats: vi.fn(),
  history: vi.fn(async () => new Map()),
  purgeBefore: vi.fn(async () => {}),
  renderReport: vi.fn(async () => ({
    content: "Server stats",
    image: Buffer.from("png"),
  })),
}));
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn: mocks.getConfigForModuleIn },
}));
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds: mocks.getActivatedGuildIds },
}));
vi.mock("./services/store.js", () => ({
  default: {
    dailyStats: mocks.dailyStats,
    history: mocks.history,
    purgeBefore: mocks.purgeBefore,
  },
}));
vi.mock("./services/report.js", () => ({
  renderReport: mocks.renderReport,
}));

const { postReport, serverStatsMaintenanceTasks, serverStatsTasks } =
  await import("./tasks.js");

const module = { id: "server-stats" } as Module<ServerStatsConfigSchema>;
const guild = { id: "guild-1" };
const client = {
  guilds: {
    cache: { has: (id: string) => id !== "gone" },
    fetch: async () => guild,
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
  activeNewcomers: 0,
  hours: Array.from({ length: 24 }, () => 0),
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

afterEach(() => {
  vi.useRealTimers();
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
    expect(mocks.renderReport).toHaveBeenCalledWith(guild, stats, {
      day,
      insights: expect.any(Object),
      comparedDays: 0,
      showTopMembers: true,
      t: expect.any(Function),
      locale: "en",
    });
    const [message] = send.mock.calls[0] as unknown as [
      {
        content: string;
        files: { attachment: Buffer; name: string }[];
        allowedMentions: unknown;
      },
    ];
    expect(message.content).toBe("Server stats");
    expect(message.files[0]).toMatchObject({
      attachment: Buffer.from("png"),
      name: "server-stats.png",
    });
    expect(message.allowedMentions).toEqual({ parse: [] });
  });

  it("compares the day with the days counted before it, skipping those without data", async () => {
    mocks.getConfigForModuleIn.mockResolvedValue(
      fakeConfig({ isSendable: () => true, send: vi.fn(async () => ({})) })
    );
    mocks.dailyStats.mockResolvedValue({
      ...stats,
      messages: 30,
      startedAt: new Date("2026-10-10T15:00:00Z"),
    });
    mocks.history.mockResolvedValueOnce(
      new Map([
        [
          new Date("2026-10-12T00:00:00Z").getTime(),
          { joins: 0, messages: 10, activeMembers: 0, reactions: 0 },
        ],
      ])
    );

    await postReport(client, module, "guild-1", day);

    expect(mocks.history).toHaveBeenCalledWith(
      "guild-1",
      new Date("2026-10-11T00:00:00Z"),
      new Date("2026-10-12T00:00:00Z")
    );
    expect(mocks.renderReport).toHaveBeenCalledWith(
      guild,
      expect.anything(),
      expect.objectContaining({ comparedDays: 1 })
    );
    const [, , context] = mocks.renderReport.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { insights: { messages: { change: number } } },
    ];
    expect(context.insights.messages.change).toBeNull();
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
  it("runs at Paris midnight and reports the previous day", async () => {
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

    expect(mocks.dailyStats).toHaveBeenCalledWith(
      "guild-1",
      new Date("2026-10-13T00:00:00Z")
    );
    expect(mocks.purgeBefore).not.toHaveBeenCalled();
  });

  it("skips the servers the bot has left", async () => {
    mocks.getActivatedGuildIds.mockResolvedValueOnce(["gone"]);
    const [task] = serverStatsTasks(module);

    await task!.run(client);

    expect(mocks.getConfigForModuleIn).not.toHaveBeenCalled();
  });

  it("keeps going when a guild fails", async () => {
    mocks.getActivatedGuildIds.mockResolvedValueOnce(["guild-0", "guild-1"]);
    mocks.getConfigForModuleIn
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(fakeConfig(undefined));
    const [task] = serverStatsTasks(module);

    await task!.run(client);

    expect(mocks.getConfigForModuleIn).toHaveBeenCalledTimes(2);
  });
});

describe("purge maintenance task", () => {
  it("deletes the counters past the retention period at Paris midnight", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T22:00:05Z") });
    const [task] = serverStatsMaintenanceTasks();

    expect(task).toMatchObject({
      schedule: "0 0 * * *",
      timezone: "Europe/Paris",
    });
    await task!.run(client);

    expect(mocks.purgeBefore).toHaveBeenCalledWith(
      new Date("2026-09-13T00:00:00Z")
    );
    expect(mocks.getActivatedGuildIds).not.toHaveBeenCalled();
  });
});
