import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import { silenceLogs } from "#lib/testing.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";

const channel = { id: "game", isTextBased: () => true, isDMBased: () => false };
const config = { get: (key: string) => (key === "delay" ? 14_400 : channel) };

const getConfigForModuleIn = vi.hoisted(() => vi.fn());
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn },
}));
const getActivatedGuildIds = vi.hoisted(() => vi.fn());
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds },
}));
const resyncLastMessage = vi.hoisted(() => vi.fn());
vi.mock("./four-hour-game.service.js", () => ({
  default: { resyncLastMessage },
}));
const announcePoint = vi.hoisted(() => vi.fn());
vi.mock("./point-announcement.js", () => ({ announcePoint }));

const { syncAllRounds, syncRound } = await import("./round-sync.js");

const module = {
  id: "four-hour-game",
} as unknown as Module<FourHourGameConfigSchema>;

const scored = (winnerId: string) => ({
  winnerId,
  score: 1,
  heldSeconds: 14_400,
  heldSince: new Date("2026-10-14T08:00:00Z"),
});

beforeEach(() => {
  vi.clearAllMocks();
  silenceLogs();
  getConfigForModuleIn.mockResolvedValue(config);
  announcePoint.mockResolvedValue(undefined);
});

describe("syncRound", () => {
  it("announces the caught-up points in order, as caught up", async () => {
    resyncLastMessage.mockResolvedValue([scored("alice"), scored("bob")]);

    await syncRound(module, "guild");

    expect(announcePoint.mock.calls.map((call) => call[1].winnerId)).toEqual([
      "alice",
      "bob",
    ]);
    for (const call of announcePoint.mock.calls) {
      expect(call[3]).toEqual({ caughtUp: true });
    }
  });

  it("still announces the next points when one announcement fails", async () => {
    resyncLastMessage.mockResolvedValue([scored("alice"), scored("bob")]);
    announcePoint.mockRejectedValueOnce(new Error("Missing Permissions"));

    await syncRound(module, "guild");

    expect(announcePoint).toHaveBeenCalledTimes(2);
  });
});

describe("syncAllRounds", () => {
  it("syncs the other guilds when one fails", async () => {
    getActivatedGuildIds.mockResolvedValue(["broken", "guild"]);
    resyncLastMessage
      .mockRejectedValueOnce(new Error("Unknown Channel"))
      .mockResolvedValueOnce([scored("alice")]);

    await syncAllRounds(module);

    expect(resyncLastMessage).toHaveBeenCalledTimes(2);
    expect(announcePoint).toHaveBeenCalledTimes(1);
  });
});
