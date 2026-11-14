import type { Client, Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Registry } from "#lib/registry.js";

const events = vi.hoisted(() => [] as string[]);

// Settled as soon as every guild's queue is taken; `done` comes later.
const reserved = vi.hoisted(() => Promise.resolve());
vi.mock("#modules/four-hour-game/services/round-sync.js", () => ({
  syncAllRounds: vi.fn(() => ({
    reserved,
    done: new Promise<void>((resolve) => setTimeout(resolve, 5)).then(() => {
      events.push("sync");
    }),
  })),
}));

const closeAllDays = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => {
    events.push("close");
  })
);
vi.mock("#modules/four-hour-game/tasks.js", () => ({
  closeAllDays,
  fourHourGameTasks: () => [],
}));

const waitForStartup = vi.hoisted(() => vi.fn());
const resetRound = vi.hoisted(() => vi.fn(async (_guildId: string) => {}));
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: { waitForStartup, resetRound },
}));

const { default: fourHourGameModule } =
  await import("./four-hour-game.module.js");

describe("fourHourGameModule.onLoad", () => {
  it("closes the days once the rounds are synced", async () => {
    const client = {} as Client;
    const registry = { register: vi.fn() } as unknown as Registry;

    await fourHourGameModule.onLoad?.(client, registry);
    await vi.waitFor(() => expect(closeAllDays).toHaveBeenCalled());

    expect(events).toEqual(["sync", "close"]);
    expect(closeAllDays).toHaveBeenCalledWith(client, fourHourGameModule);
  });

  it("holds live messages until every guild's queue is taken", async () => {
    const registry = { register: vi.fn() } as unknown as Registry;

    await fourHourGameModule.onLoad?.({} as Client, registry);

    // Not `done`: a guild would otherwise wait for the slowest replay.
    expect(waitForStartup.mock.calls.at(-1)![0]).toBe(reserved);
  });
});

describe("fourHourGameModule.onInstall", () => {
  // The installer awaits the hook before registering the commands: a failure
  // must reach it, so the module is not enabled on a round left as it was.
  it("fails when the round cannot be reset", async () => {
    resetRound.mockRejectedValueOnce(new Error("database is down"));

    await expect(
      fourHourGameModule.onInstall?.(
        {} as Client,
        { id: "guild-1" } as Guild,
        fourHourGameModule.registry
      )
    ).rejects.toThrow("database is down");
  });
});
