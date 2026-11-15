import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import type { FourHourGameConfigSchema } from "./four-hour-game.config.js";

const closeAllDays = vi.hoisted(() => vi.fn());
vi.mock("./services/daily.service.js", () => ({ closeAllDays }));

const { fourHourGameTasks } = await import("./tasks.js");

const module = {
  id: "four-hour-game",
} as unknown as Module<FourHourGameConfigSchema>;

describe("fourHourGameTasks", () => {
  it("closes the days in the guilds of the scheduler's client", async () => {
    const client = {} as Client<true>;
    const [task] = fourHourGameTasks(module);

    await task!.run(client);

    expect(closeAllDays).toHaveBeenCalledWith(client, module);
  });

  it("closes the days at Paris midnight", () => {
    expect(fourHourGameTasks(module)).toEqual([
      expect.objectContaining({
        schedule: "0 0 * * *",
        timezone: "Europe/Paris",
      }),
    ]);
  });
});
