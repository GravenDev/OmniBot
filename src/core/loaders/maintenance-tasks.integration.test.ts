import { Cron } from "croner";
import { describe, expect, it } from "vitest";
import { initI18n } from "#lib/i18n.js";
import { loadModules } from "./module-loader.js";

// A broken maintenance task is only logged at startup and the purge it
// carries silently stops: catch it here instead.
describe("maintenance tasks of the shipped modules", async () => {
  await initI18n();
  const modules = await loadModules("./modules");

  it("include the modules that declare some", () => {
    // A module that fails to import is skipped, not thrown: make sure the
    // ones with maintenance tasks are actually checked below.
    expect(modules.map((module) => module.id)).toEqual(
      expect.arrayContaining(["reports", "server-stats"])
    );
  });

  it.each(modules.map((module) => [module.id, module] as const))(
    "%s: have unique ids and valid schedules",
    (_id, module) => {
      const tasks = module.maintenanceTasks?.() ?? [];
      const ids = tasks.map((task) => task.id);
      expect(new Set(ids).size).toBe(ids.length);

      for (const task of tasks) {
        // Unnamed and paused: validates the pattern and timezone without
        // registering or running anything.
        const job = new Cron(task.schedule, {
          paused: true,
          timezone: task.timezone ?? "UTC",
        });
        job.stop();
      }
    }
  );
});
