import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import { silenceLogs } from "#lib/testing.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";

const channel = { id: "game", isTextBased: () => true, isDMBased: () => false };
let delay = 14_400;
const config = { get: (key: string) => (key === "delay" ? delay : channel) };

const getConfigForModuleIn = vi.hoisted(() => vi.fn());
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn },
}));
const getActivatedGuildIds = vi.hoisted(() => vi.fn());
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds },
}));
// The service runs `load`, replays (resyncLastMessage stands for it), then
// hands the points to `announce`, all in the guild's queue.
const resyncLastMessage = vi.hoisted(() => vi.fn());
const syncRoundInService = vi.hoisted(() =>
  vi.fn(async (_guildId: string, load: () => Promise<unknown>) => {
    const round = (await load()) as {
      announce: (points: unknown[]) => Promise<void>;
    } | null;
    if (round) {
      await round.announce(await resyncLastMessage(round));
    }
  })
);
vi.mock("./four-hour-game.service.js", () => ({
  default: { syncRound: syncRoundInService },
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
  delay = 14_400;
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

  it("replays nothing without a delay, like the live game", async () => {
    delay = 0;

    await syncRound(module, "guild");

    expect(resyncLastMessage).not.toHaveBeenCalled();
  });
});

describe("syncAllRounds", () => {
  it("syncs the other guilds when one fails", async () => {
    getActivatedGuildIds.mockResolvedValue(["broken", "guild"]);
    resyncLastMessage
      .mockRejectedValueOnce(new Error("Unknown Channel"))
      .mockResolvedValueOnce([scored("alice")]);

    await syncAllRounds(module).done;

    expect(resyncLastMessage).toHaveBeenCalledTimes(2);
    expect(announcePoint).toHaveBeenCalledTimes(1);
  });

  it("takes every guild's queue at once, without waiting for the replays", async () => {
    getActivatedGuildIds.mockResolvedValue(["slow", "guild"]);
    resyncLastMessage.mockReturnValue(new Promise(() => {}));

    await syncAllRounds(module).reserved;

    expect(syncRoundInService.mock.calls.map((call) => call[0])).toEqual([
      "slow",
      "guild",
    ]);
  });
});
