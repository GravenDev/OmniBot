import { Client, Events } from "discord.js";
import coreModule from "./core/core.module.js";
import {
  checkCommandsForVersionChange,
  loadDevGuildCommands,
  loadGlobalCommands,
} from "./core/loaders/command-loader.js";
import {
  loadGlobalEvents,
  loadModuleEvents,
} from "./core/loaders/listener-loader.js";
import { loadModules } from "./core/loaders/module-loader.js";
import moduleService from "./core/services/module.service.js";
import prisma, { Prisma } from "./lib/database.js";
import { isDevMode } from "./lib/env.js";
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

export const modules = await loadModules("./modules");
const intents = modules.flatMap((module) => module.intents).filter((a) => !!a);

export const client = new Client({
  intents: intents,
});

client.once(Events.ClientReady, async (readyClient) => {
  for (const module of modules) {
    module.onLoad(readyClient, module.registry);
    loadModuleEvents(readyClient, module);
  }

  coreModule.onLoad(readyClient, coreModule.registry);

  if (isDevMode()) {
    // One bulk registration on the dev guild: core + enabled modules (instant).
    await loadDevGuildCommands(readyClient, modules);
    // Dev skips the version-gated command path, so reconcile the stored
    // activation version here to keep /modules from reporting a stale version.
    for (const module of modules) {
      await moduleService.reconcileActivatedVersions(module);
    }
  } else {
    for (const module of modules) {
      await checkCommandsForVersionChange(readyClient, module);
    }
    await loadGlobalCommands(readyClient);
  }

  loadGlobalEvents(readyClient);
});

await client.login(token);

const shutdown = async () => {
  logger.info("Shutting down...");
  await client.destroy();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
