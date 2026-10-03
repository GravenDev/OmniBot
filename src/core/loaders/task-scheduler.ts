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
  for (const task of module.registry.tasks) {
    const name = `${module.id}:${task.id}`;
    const job = new Cron(
      task.schedule,
      { name, timezone: "UTC", protect: true },
      () => runTask(client, name, task)
    );
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
