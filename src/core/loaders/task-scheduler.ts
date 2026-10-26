import { Cron } from "croner";
import type { Client } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import type { ScheduledTask } from "#lib/task.js";

const logger = loggerMaker("tasks");

const jobs: Cron[] = [];

async function runTask(
  client: Client<true>,
  name: string,
  task: ScheduledTask
): Promise<void> {
  const startedAt = Date.now();
  logger.info(`Task started | task = ${name}`);
  try {
    await task.run(client);
    logger.info(
      `Task finished | task = ${name} | durationMs = ${Date.now() - startedAt}`
    );
  } catch (err) {
    logger.error({ err }, `Task failed | task = ${name}`);
  }
}

export function startModuleTasks(client: Client<true>, module: Module): void {
  scheduleTasks(client, module.id, module.registry.tasks);
}

export function startMaintenanceTasks(
  client: Client<true>,
  module: Module
): void {
  let tasks: ScheduledTask[];
  try {
    tasks = module.maintenanceTasks?.() ?? [];
  } catch (err) {
    // Runs during startup, before the core is loaded: one module failing
    // must not stop the others or the core.
    logger.error(
      { err },
      `Maintenance tasks failed to build | module = ${module.id}`
    );
    return;
  }
  // Own namespace, so that a maintenance task can never take the name of a
  // task the module registers from onLoad.
  scheduleTasks(client, `${module.id}:maintenance`, tasks);
}

function scheduleTasks(
  client: Client<true>,
  prefix: string,
  tasks: readonly ScheduledTask[]
): void {
  for (const task of tasks) {
    const name = `${prefix}:${task.id}`;
    let job: Cron;
    try {
      // Throws on an invalid schedule or timezone, or a name already taken.
      job = new Cron(
        task.schedule,
        { name, timezone: task.timezone ?? "UTC", protect: true },
        () => runTask(client, name, task)
      );
    } catch (err) {
      logger.error({ err }, `Task not scheduled | task = ${name}`);
      continue;
    }
    jobs.push(job);
    logger.info(
      `Task scheduled | task = ${name} | schedule = ${task.schedule} | next = ${job.nextRun()?.toISOString()}`
    );

    if (task.runOnStart) {
      void job.trigger();
    }
  }
}

export function stopAllTasks(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs.length = 0;
}
