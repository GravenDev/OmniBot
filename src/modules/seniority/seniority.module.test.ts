import type { Client, Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";

const clearGuild = vi.hoisted(() => vi.fn(async (_guildId: string) => {}));
vi.mock("./services/overrides.js", () => ({ clearGuild, remove: vi.fn() }));
vi.mock("./tasks.js", () => ({
  seniorityTasks: () => [],
  seniorityMaintenanceTasks: () => [],
}));

const { default: seniorityModule } = await import("./seniority.module.js");

describe("seniorityModule.onUninstall", () => {
  // The installer awaits the hook before removing the commands: a failure
  // must reach it, so the module stays enabled with its seniorities.
  it("fails when the recomputed seniorities cannot be cleared", async () => {
    clearGuild.mockRejectedValueOnce(new Error("database is down"));

    await expect(
      seniorityModule.onUninstall?.(
        {} as Client,
        { id: "guild-1" } as Guild,
        seniorityModule.registry
      )
    ).rejects.toThrow("database is down");
  });
});
