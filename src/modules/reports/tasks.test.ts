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
  encryptPlaintext: vi.fn(async () => 0),
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
    encryptPlaintext: mocks.encryptPlaintext,
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

function report(
  id: number,
  createdDaysAgo: number,
  handledDaysAgo: number | null
) {
  return {
    id,
    status: handledDaysAgo === null ? "open" : "resolved",
    createdAt: new Date(NOW.getTime() - createdDaysAgo * DAY),
    handledAt:
      handledDaysAgo === null
        ? null
        : new Date(NOW.getTime() - handledDaysAgo * DAY),
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
  const closedBefore = new Date(NOW.getTime() - 7 * DAY);
  const createdBefore = new Date(NOW.getTime() - 30 * DAY);

  it("expires an open report made more than 30 days ago", () => {
    expect(isExpired(report(1, 31, null), closedBefore, createdBefore)).toBe(
      true
    );
  });

  it("keeps an open report made less than 30 days ago", () => {
    expect(isExpired(report(1, 29, null), closedBefore, createdBefore)).toBe(
      false
    );
  });

  it("expires a report closed before the retention period", () => {
    expect(isExpired(report(1, 10, 8), closedBefore, createdBefore)).toBe(true);
  });

  it("keeps a report closed within the retention period", () => {
    expect(isExpired(report(1, 10, 6), closedBefore, createdBefore)).toBe(
      false
    );
  });
});

describe("reports purge task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.retention = 7 * 24 * 60 * 60;
    mocks.reports.clear();
  });

  it("purges every guild that has reports, enabled or not", async () => {
    mocks.guildIds.mockResolvedValue(["enabled", "disabled"]);
    mocks.expired.mockResolvedValue([]);

    await runPurge();

    expect(mocks.expired).toHaveBeenCalledTimes(2);
    expect(mocks.expired.mock.calls.map(([guildId]) => guildId)).toEqual([
      "enabled",
      "disabled",
    ]);
  });

  it("caps the retention at 30 days", async () => {
    mocks.retention = 90 * 24 * 60 * 60;
    mocks.guildIds.mockResolvedValue(["g1"]);
    mocks.expired.mockResolvedValue([]);

    await runPurge();

    expect(mocks.expired).toHaveBeenCalledWith(
      "g1",
      new Date(NOW.getTime() - 30 * DAY),
      new Date(NOW.getTime() - 30 * DAY)
    );
  });

  it("uses 30 days when the guild never set a retention", async () => {
    mocks.retention = undefined;
    mocks.guildIds.mockResolvedValue(["g1"]);
    mocks.expired.mockResolvedValue([]);

    await runPurge();

    expect(mocks.expired).toHaveBeenCalledWith(
      "g1",
      new Date(NOW.getTime() - 30 * DAY),
      new Date(NOW.getTime() - 30 * DAY)
    );
  });

  it("uses a shorter retention set by the guild", async () => {
    mocks.guildIds.mockResolvedValue(["g1"]);
    mocks.expired.mockResolvedValue([]);

    await runPurge();

    expect(mocks.expired).toHaveBeenCalledWith(
      "g1",
      new Date(NOW.getTime() - 7 * DAY),
      new Date(NOW.getTime() - 30 * DAY)
    );
  });

  it("deletes only the reports still expired once locked", async () => {
    mocks.guildIds.mockResolvedValue(["g1"]);
    mocks.reports.set(1, report(1, 31, null));
    mocks.reports.set(2, report(2, 2, null));
    mocks.expired.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    await runPurge();

    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.delete).toHaveBeenCalledWith(1);
  });

  it("encrypts the reports stored in clear after purging", async () => {
    mocks.guildIds.mockResolvedValue([]);

    await runPurge();

    expect(mocks.encryptPlaintext).toHaveBeenCalledOnce();
  });
});
