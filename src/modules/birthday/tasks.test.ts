import { describe, expect, it, vi } from "vitest";

const sweepDepartures = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./services/departures.service.js", () => ({ sweepDepartures }));
vi.mock("./services/daily.service.js", () => ({ runAllGuildDays: vi.fn() }));
const getActivatedGuildIds = vi.hoisted(() => vi.fn(async () => ["g"]));
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds },
}));

const { birthdayMaintenanceTasks } = await import("./tasks.js");

describe("birthday maintenance", () => {
  // Departed members' birthdays are deleted per the privacy policy, even on
  // an instance where the module is skipped: a maintenance task.
  it("sweeps the departures every day, asking where the module is enabled", async () => {
    const [task] = birthdayMaintenanceTasks("birthday");
    expect(task!.id).toBe("sweep-departures");
    expect(task!.runOnStart).toBe(true);
    await task!.run({} as never);
    const [, isActivated] = sweepDepartures.mock.calls[0] as unknown as [
      unknown,
      (guildId: string) => Promise<boolean>,
    ];
    expect(getActivatedGuildIds).not.toHaveBeenCalled();
    expect(await isActivated("g")).toBe(true);
    expect(await isActivated("other")).toBe(false);
    expect(getActivatedGuildIds).toHaveBeenCalledWith("birthday");
  });
});
