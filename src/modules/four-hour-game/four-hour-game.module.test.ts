import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Registry } from "#lib/registry.js";

const events = vi.hoisted(() => [] as string[]);
const unsynced = vi.hoisted(() => new Set(["broken"]));

vi.mock("#modules/four-hour-game/services/round-sync.js", () => ({
  syncAllRounds: vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    events.push("sync");
    return unsynced;
  }),
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

vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: {},
}));

const { default: fourHourGameModule } =
  await import("./four-hour-game.module.js");

describe("fourHourGameModule.onLoad", () => {
  it("closes the days once the rounds are synced, skipping the unsynced guilds", async () => {
    const client = {} as Client;
    const registry = { register: vi.fn() } as unknown as Registry;

    await fourHourGameModule.onLoad?.(client, registry);
    await vi.waitFor(() => expect(closeAllDays).toHaveBeenCalled());

    expect(events).toEqual(["sync", "close"]);
    expect(closeAllDays).toHaveBeenCalledWith(
      client,
      fourHourGameModule,
      unsynced
    );
  });
});
