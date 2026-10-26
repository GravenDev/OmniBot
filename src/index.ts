import { fileURLToPath } from "node:url";
import path from "path";
import { Client, Events } from "discord.js";
import coreModule from "./core/core.module.js";
import { syncCommands } from "./core/loaders/command-loader.js";
import {
  fetchApplicationFlags,
  intentNames,
  planGateway,
} from "./core/loaders/intent-guard.js";
import {
  loadGlobalEvents,
  loadModuleEvents,
} from "./core/loaders/listener-loader.js";
import {
  findDuplicateDeclarations,
  loadModuleI18n,
  loadModules,
} from "./core/loaders/module-loader.js";
import {
  startMaintenanceTasks,
  startModuleTasks,
  stopAllTasks,
} from "./core/loaders/task-scheduler.js";
import { setRuntime } from "./core/runtime.js";
import prisma, { Prisma } from "./lib/database.js";
import { initI18n } from "./lib/i18n.js";
import logger from "./lib/logger.js";
import sql = Prisma.sql;

try {
  await prisma.$queryRaw<number>(sql`SELECT 1`);
} catch {
  logger.error(
    "Failed to connect to the database. Please check your configuration or start the database."
  );
  process.exit(1);
}

const token = process.env["DISCORD_TOKEN"];

await initI18n();

const corePath = path.resolve(fileURLToPath(import.meta.url), "..", "core");
await loadModuleI18n("core", corePath);

const [loadedModules, applicationFlags] = await Promise.all([
  loadModules("./modules"),
  fetchApplicationFlags(token),
]);

const { coreMissing, modules, unavailable, intents, partials } = planGateway(
  coreModule,
  loadedModules,
  applicationFlags
);
if (coreMissing.length > 0) {
  logger.fatal(
    `Privileged intent required by the core is not granted, exiting | intents = ${intentNames(coreMissing)}`
  );
  process.exit(1);
}

const client = new Client({
  intents: intents,
  partials: partials,
});
setRuntime(modules, client, unavailable);

client.once(Events.ClientReady, async (readyClient) => {
  const failed = new Set<string>();
  for (const module of modules) {
    try {
      await module.onLoad?.(readyClient, module.registry);
    } catch (error) {
      // One failing module must not prevent the others (and the core)
      // from loading.
      logger.error(
        { err: error },
        `Module onLoad failed, skipping | id = ${module.id}`
      );
      failed.add(module.id);
      continue;
    }
    loadModuleEvents(readyClient, module);
    startModuleTasks(readyClient, module);
  }

  for (const module of [
    ...modules,
    ...unavailable.map((entry) => entry.module),
  ]) {
    startMaintenanceTasks(readyClient, module);
  }

  // Dropped from the shared list so that nothing it registered before
  // throwing (commands, interaction handlers) is dispatched or synced.
  for (let i = modules.length - 1; i >= 0; i--) {
    if (failed.has(modules[i]!.id)) modules.splice(i, 1);
  }

  try {
    await coreModule.onLoad?.(readyClient, coreModule.registry);
    loadGlobalEvents(readyClient);
  } catch (err) {
    logger.fatal({ err }, "Core failed to load, exiting");
    process.exit(1);
  }

  for (const duplicate of findDuplicateDeclarations([...modules, coreModule])) {
    logger.error(`Duplicate declaration, first match wins | ${duplicate}`);
  }

  try {
    await syncCommands(readyClient, modules);
  } catch (err) {
    logger.error({ err }, "Command sync failed");
  }
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception, exiting");
  process.exit(1);
});

await client.login(token);

let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info("Shutting down...");
  stopAllTasks();
  try {
    await client.destroy();
    await prisma.$disconnect();
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
    process.exit(1);
  }
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
