import { describe, expect, it, vi } from "vitest";

const sweepDepartures = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./services/overrides.js", () => ({ sweepDepartures }));
vi.mock("./services/daily.js", () => ({ runAllGuildDays: vi.fn() }));
const getActivatedGuildIds = vi.hoisted(() => vi.fn(async () => ["g"]));
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds },
}));

const { seniorityMaintenanceTasks } = await import("./tasks.js");

describe("seniority maintenance", () => {
  it("sweeps the departures every day, asking where the module is enabled", async () => {
    const [task] = seniorityMaintenanceTasks("seniority");
    expect(task!.id).toBe("sweep-departures");
    expect(task!.runOnStart).toBe(true);
    await task!.run({} as never);
    const [, isActivated] = sweepDepartures.mock.calls[0] as unknown as [
      unknown,
      (guildId: string) => Promise<boolean>,
    ];
    // Asked when the guild comes up, not from a list read at the start.
    expect(getActivatedGuildIds).not.toHaveBeenCalled();
    expect(await isActivated("g")).toBe(true);
    expect(await isActivated("other")).toBe(false);
    expect(getActivatedGuildIds).toHaveBeenCalledWith("seniority");
  });
});
