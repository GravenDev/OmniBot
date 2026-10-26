import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import type { ReportsConfigSchema } from "./reports.config.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-25T04:00:00Z");

const mocks = vi.hoisted(() => ({
  retention: (7 * 24 * 60 * 60) as number | undefined,
  guildIds: vi.fn(),
  closedBefore: vi.fn(),
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
    closedBefore: mocks.closedBefore,
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

const { reportsTasks } = await import("./tasks.js");

const module = {
  id: "reports",
  config: { retention: { defaultValue: 90 * 24 * 60 * 60 } },
} as unknown as Module<ReportsConfigSchema>;
const client = {
  channels: { fetch: async () => null },
} as unknown as Client<true>;

function report(id: number, handledDaysAgo: number | null) {
  return {
    id,
    status: handledDaysAgo === null ? "open" : "resolved",
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

describe("reports purge task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.retention = 7 * 24 * 60 * 60;
    mocks.reports.clear();
    mocks.closedBefore.mockResolvedValue([]);
  });

  it("purges every guild that has reports, enabled or not", async () => {
    mocks.guildIds.mockResolvedValue(["enabled", "disabled"]);

    await runPurge();

    expect(mocks.closedBefore.mock.calls.map(([guildId]) => guildId)).toEqual([
      "enabled",
      "disabled",
    ]);
  });

  it("uses the retention stored for the guild", async () => {
    mocks.guildIds.mockResolvedValue(["g1"]);

    await runPurge();

    expect(mocks.closedBefore).toHaveBeenCalledWith(
      "g1",
      new Date(NOW.getTime() - 7 * DAY)
    );
  });

  it("uses the default retention when the guild never set one", async () => {
    mocks.retention = undefined;
    mocks.guildIds.mockResolvedValue(["g1"]);

    await runPurge();

    expect(mocks.closedBefore).toHaveBeenCalledWith(
      "g1",
      new Date(NOW.getTime() - 90 * DAY)
    );
  });

  it("deletes only the reports still closed for long enough once locked", async () => {
    mocks.guildIds.mockResolvedValue(["g1"]);
    mocks.reports.set(1, report(1, 8));
    mocks.reports.set(2, report(2, null));
    mocks.reports.set(3, report(3, 2));
    mocks.closedBefore.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    await runPurge();

    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.delete).toHaveBeenCalledWith(1);
  });

  it("keeps purging the other guilds when one fails", async () => {
    mocks.guildIds.mockResolvedValue(["broken", "g1"]);
    mocks.closedBefore
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce([]);

    await runPurge();

    expect(mocks.closedBefore).toHaveBeenCalledTimes(2);
  });
});
