import {
  type APIApplication,
  ApplicationFlags,
  ApplicationFlagsBitField,
  GatewayIntentBits,
  type Partials,
  REST,
  Routes,
} from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";

const logger = loggerMaker("modules");

const FLAGS_TIMEOUT_MS = 5_000;

const GRANTING_FLAGS = new Map<GatewayIntentBits, ApplicationFlags[]>([
  [
    GatewayIntentBits.GuildMembers,
    [
      ApplicationFlags.GatewayGuildMembers,
      ApplicationFlags.GatewayGuildMembersLimited,
    ],
  ],
  [
    GatewayIntentBits.GuildPresences,
    [ApplicationFlags.GatewayPresence, ApplicationFlags.GatewayPresenceLimited],
  ],
  [
    GatewayIntentBits.MessageContent,
    [
      ApplicationFlags.GatewayMessageContent,
      ApplicationFlags.GatewayMessageContentLimited,
    ],
  ],
]);

export async function fetchApplicationFlags(
  token: string | undefined
): Promise<number | null> {
  if (!token) return null;
  try {
    const application = (await new REST({
      timeout: FLAGS_TIMEOUT_MS,
      retries: 0,
      rejectOnRateLimit: () => true,
    })
      .setToken(token)
      .get(Routes.currentApplication())) as APIApplication;
    return application.flags ?? 0;
  } catch (err) {
    logger.warn(
      { err },
      "Could not read application flags, privileged intents are not checked"
    );
    return null;
  }
}

export function findMissingIntents(
  module: Pick<Module, "intents">,
  flags: number
): GatewayIntentBits[] {
  const granted = new ApplicationFlagsBitField(flags);
  return (module.intents ?? []).filter((intent) => {
    const granting = GRANTING_FLAGS.get(intent);
    return granting !== undefined && !granted.any(granting);
  });
}

export function intentNames(intents: GatewayIntentBits[]): string {
  return intents.map((intent) => GatewayIntentBits[intent]).join(",");
}

export function keepModulesWithGrantedIntents(
  modules: Module[],
  flags: number | null
): Module[] {
  if (flags === null) return modules;

  return modules.filter((module) => {
    const missing = findMissingIntents(module, flags);
    if (missing.length === 0) return true;

    logger.warn(
      `Privileged intent not granted, skipping module | id = ${module.id} | intents = ${intentNames(missing)}`
    );
    return false;
  });
}

export function planGateway(
  core: Pick<Module, "intents" | "partials">,
  loadedModules: Module[],
  flags: number | null
): {
  coreMissing: GatewayIntentBits[];
  modules: Module[];
  intents: GatewayIntentBits[];
  partials: Partials[];
} {
  const coreMissing = flags === null ? [] : findMissingIntents(core, flags);
  const modules = keepModulesWithGrantedIntents(loadedModules, flags);
  const declaring = [core, ...modules];
  return {
    coreMissing,
    modules,
    intents: [...new Set(declaring.flatMap((module) => module.intents ?? []))],
    partials: [
      ...new Set(declaring.flatMap((module) => module.partials ?? [])),
    ],
  };
}
