import { Cron } from "croner";
import { describe, expect, it } from "vitest";
import { initI18n } from "#lib/i18n.js";
import { loadModules } from "./module-loader.js";

// A broken maintenance task is only logged at startup and the purge it
// carries silently stops: catch it here instead.
describe("maintenance tasks of the shipped modules", async () => {
  await initI18n();
  const modules = await loadModules("./modules");

  // The scheduled purges behind retention periods of the privacy policy
  // (docs/site/*/legal/privacy.md), kept by hand: registered from onLoad
  // instead, they would stop on an instance where the module is skipped. A
  // module that fails to import is skipped too, not thrown: its row fails.
  // Deletions done by a listener or on uninstall are not checked here.
  it.each([
    ["birthday", "sweep-departures"],
    ["reports", "purge"],
    ["rngdle", "cards"],
    ["seniority", "sweep-departures"],
    ["server-stats", "purge"],
    ["temp-voice", "purge-preferences"],
  ])("%s: purges its data with the %s maintenance task", (moduleId, taskId) => {
    const module = modules.find((candidate) => candidate.id === moduleId);
    const ids = (module?.maintenanceTasks?.() ?? []).map((task) => task.id);
    expect(ids).toContain(taskId);
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
