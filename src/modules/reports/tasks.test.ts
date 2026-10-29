import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import type { ReportsConfigSchema } from "./reports.config.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-25T04:00:00Z");

const mocks = vi.hoisted(() => ({
  retention: (7 * 24 * 60 * 60) as number | undefined,
  guildIds: vi.fn(),
  expired: vi.fn(),
  delete: vi.fn(async () => {}),
  reports: new Map<number, unknown>(),
}));
vi.mock("#core/services/config.service.js", () => ({
  default: {
    getFullConfigForGuild: async () => ({
      reports: { retention: mocks.retention },
    }),
    getLocaleForGuild: async () => "en",
    getConfigForModuleIn: async () => {
      throw new Error("the guild may be gone: never resolve its entities");
    },
  },
}));
vi.mock("#lib/i18n.js", () => ({ createT: () => (key: string) => key }));
vi.mock("./services/store.js", () => ({
  default: {
    guildIds: mocks.guildIds,
    expired: mocks.expired,
    delete: mocks.delete,
  },
}));
vi.mock("./services/report.service.js", () => ({
  default: {
    withReport: async (
      _guildId: string,
      id: number,
      task: (report: unknown) => Promise<unknown>
    ) => task(mocks.reports.get(id)),
  },
}));
vi.mock("./services/alert-view.js", () => ({ purgedMessage: () => ({}) }));

const { isExpired, reportsTasks } = await import("./tasks.js");

const module = { id: "reports" } as Module<ReportsConfigSchema>;
const client = {
  channels: { fetch: async () => null },
} as unknown as Client<true>;

const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

function report(
  id: number,
  reportedDaysAgo: number[],
  handledDaysAgo: number | null
) {
  return {
    id,
    status: handledDaysAgo === null ? "open" : "resolved",
    createdAt: daysAgo(Math.max(...reportedDaysAgo)),
    reporters: reportedDaysAgo.map((days) => ({ reportedAt: daysAgo(days) })),
    handledAt: handledDaysAgo === null ? null : daysAgo(handledDaysAgo),
    alertChannelId: null,
    alertMessageId: null,
  };
}

async function runPurge() {
  vi.useFakeTimers({ now: NOW });
  try {
    await reportsTasks(module)[0]!.run(client);
  } finally {
    vi.useRealTimers();
  }
}

describe("isExpired", () => {
  const closedBefore = daysAgo(7);
  const reportedBefore = daysAgo(30);

  it("expires an open report last reported more than 30 days ago", () => {
    expect(isExpired(report(1, [31], null), closedBefore, reportedBefore)).toBe(
      true
    );
  });

  it("keeps an open report last reported less than 30 days ago", () => {
    expect(isExpired(report(1, [29], null), closedBefore, reportedBefore)).toBe(
      false
    );
  });

  it("keeps an old report reopened by a recent report", () => {
    expect(
      isExpired(report(1, [60, 1], null), closedBefore, reportedBefore)
    ).toBe(false);
  });

  it("expires a report closed before the retention period", () => {
    expect(isExpired(report(1, [10], 8), closedBefore, reportedBefore)).toBe(
      true
    );
  });

  it("keeps a report closed within the retention period", () => {
    expect(isExpired(report(1, [10], 6), closedBefore, reportedBefore)).toBe(
      false
    );
  });
});

describe("reports purge task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.retention = 7 * 24 * 60 * 60;
    mocks.reports.clear();
    mocks.expired.mockResolvedValue([]);
  });

  it("purges every guild that has reports, enabled or not", async () => {
    mocks.guildIds.mockResolvedValue(["enabled", "disabled"]);

    await runPurge();

    expect(mocks.expired.mock.calls.map(([guildId]) => guildId)).toEqual([
      "enabled",
      "disabled",
    ]);
  });

  it("uses a shorter retention set by the guild", async () => {
    mocks.guildIds.mockResolvedValue(["g1"]);

    await runPurge();

    expect(mocks.expired).toHaveBeenCalledWith("g1", daysAgo(7), daysAgo(30));
  });

  it("caps a longer stored retention at 30 days", async () => {
    mocks.retention = 90 * 24 * 60 * 60;
    mocks.guildIds.mockResolvedValue(["g1"]);

    await runPurge();

    expect(mocks.expired).toHaveBeenCalledWith("g1", daysAgo(30), daysAgo(30));
  });

  it("uses 30 days when the guild never set a retention", async () => {
    mocks.retention = undefined;
    mocks.guildIds.mockResolvedValue(["g1"]);

    await runPurge();

    expect(mocks.expired).toHaveBeenCalledWith("g1", daysAgo(30), daysAgo(30));
  });

  it("deletes only the reports still expired once locked", async () => {
    mocks.guildIds.mockResolvedValue(["g1"]);
    mocks.reports.set(1, report(1, [31], null));
    mocks.reports.set(2, report(2, [2], null));
    mocks.reports.set(3, report(3, [10], 8));
    mocks.expired.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    await runPurge();

    expect(mocks.delete.mock.calls).toEqual([[1], [3]]);
  });

  it("keeps purging the other guilds when one fails", async () => {
    mocks.guildIds.mockResolvedValue(["broken", "g1"]);
    mocks.expired
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce([]);

    await runPurge();

    expect(mocks.expired).toHaveBeenCalledTimes(2);
  });
});
