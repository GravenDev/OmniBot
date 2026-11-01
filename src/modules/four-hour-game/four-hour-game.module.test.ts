import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Registry } from "#lib/registry.js";

const events = vi.hoisted(() => [] as string[]);

vi.mock("#modules/four-hour-game/services/round-sync.js", () => ({
  syncAllRounds: vi.fn(() => ({
    reserved: Promise.resolve(),
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
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: { waitForStartup },
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

    expect(waitForStartup).toHaveBeenCalledWith(expect.any(Promise));
  });
});
