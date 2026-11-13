import {
  CannotSendMessagesToThisUserErrorCodes,
  MessageFlags,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Guild,
  type GuildTextBasedChannel,
} from "discord.js";
import { installModuleCommandsIn } from "#core/loaders/command-loader.js";
import { modules } from "#core/runtime.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { guildWelcomeMessage } from "#core/utils/core-messages.js";
import { apiErrorCode, isApiError } from "#lib/discord-errors.js";
import { createT, type TFunction } from "#lib/i18n.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";

const logger = loggerMaker("guild");

/**
 * No `guildDelete` purge exists on purpose: when the bot leaves a guild,
 * `GuildConfiguration` and `ModuleActivation` rows are kept so a rejoin
 * restores everything. See the privacy policy (retention section).
 */
function resolveJoinLocale(guild: Guild): string {
  const raw = guild.preferredLocale ?? "en";
  return raw.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function asSendableChannel(
  guild: Guild,
  channel: unknown
): GuildTextBasedChannel | null {
  if (!channel || typeof channel !== "object") return null;
  const candidate = channel as GuildTextBasedChannel;
  if (typeof candidate.isTextBased !== "function" || !candidate.isTextBased()) {
    return null;
  }
  if (typeof candidate.isSendable !== "function" || !candidate.isSendable()) {
    return null;
  }
  const me = guild.members.me;
  if (!me) return null;
  const canPost = me
    .permissionsIn(candidate)
    .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
  return canPost ? candidate : null;
}

export async function resolveWelcomeChannel(
  guild: Guild
): Promise<GuildTextBasedChannel | null> {
  if (!guild.systemChannelId) return null;
  const channel =
    guild.systemChannel ??
    (await guild.channels.fetch(guild.systemChannelId).catch(() => null));
  return asSendableChannel(guild, channel);
}

// Discord refusing the welcome message: no access to the system channel, no
// right to post there, or an owner who does not accept DMs (or shares no
// guild with the bot any more). Expected, so a warning; anything else is an
// error.
export function isWelcomeRefusal(error: unknown): boolean {
  return isApiError(
    error,
    RESTJSONErrorCodes.MissingAccess,
    RESTJSONErrorCodes.MissingPermissions,
    ...CannotSendMessagesToThisUserErrorCodes
  );
}

function logSendError(error: unknown, where: string, guildId: string): void {
  if (isWelcomeRefusal(error)) {
    logger.warn(
      `Welcome message not sent | where = ${where} | guild = ${guildId} | code = ${apiErrorCode(error)}`
    );
    return;
  }
  logger.error(
    { err: error },
    `Welcome message failed | where = ${where} | guild = ${guildId}`
  );
}

/** Reinstalls guild commands for every enabled module (Discord purges them on kick). */
async function reinstallModuleCommands(guild: Guild): Promise<void> {
  try {
    await moduleService.resetVersionsOfUnloadedModulesIn(guild.id);
  } catch (err) {
    logger.error(
      { err },
      `Failed to reset unloaded module versions | guild = ${guild.id}`
    );
  }

  let states: Awaited<ReturnType<typeof moduleService.getAllModulesStateIn>>;
  try {
    states = await moduleService.getAllModulesStateIn(guild.id);
  } catch (err) {
    logger.error(
      { err },
      `Failed to list module states on join | guild = ${guild.id}`
    );
    return;
  }

  for (const state of states) {
    if (!state.enabled) continue;
    const mod = modules.find((m) => m.id === state.module.id);
    if (!mod || mod.registry.commands.length === 0) continue;
    try {
      // Sequential on purpose: the installer already POSTs in parallel per
      // command, no need to fan out across modules too.
      await installModuleCommandsIn(guild.client, mod, guild);
      await moduleService.updateModuleActivation(mod.id, guild.id, mod.version);
    } catch (err) {
      logger.error(
        { err },
        `Failed to reinstall commands | module = ${mod.id} | guild = ${guild.id}`
      );
      try {
        await moduleService.updateModuleActivation(mod.id, guild.id, "");
      } catch (resetErr) {
        logger.error(
          { err: resetErr },
          `Failed to reset module version | module = ${mod.id} | guild = ${guild.id}`
        );
      }
    }
  }
}

async function sendWelcome(guild: Guild, t: TFunction): Promise<void> {
  const components = guildWelcomeMessage(t);
  const channel = await resolveWelcomeChannel(guild).catch(() => null);
  if (channel) {
    try {
      await channel.send({
        components,
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    } catch (error) {
      logSendError(error, "systemChannel", guild.id);
    }
  } else {
    logger.info(
      `Welcome channel unavailable, falling back to owner DM | guild = ${guild.id} | systemChannelId = ${guild.systemChannelId}`
    );
  }

  try {
    const owner = await guild.fetchOwner();
    await owner.send({
      content: t("guild.welcome.dmPrefix"),
      components,
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (error) {
    logSendError(error, "ownerDm", guild.id);
  }
}

export default declareEventListener({
  eventType: "guildCreate",
  execute: async (guild) => {
    const t = createT(resolveJoinLocale(guild), "core");
    logger.info(`Guild joined | guild = ${guild.id}`);

    // Explicit init on first join (no more late lazy creation): creates the
    // row when absent, reloads + recaches it on rejoin.
    try {
      await configService.clearCacheForGuild(guild.id);
      await configService.getFullConfigForGuild(guild.id);
    } catch (err) {
      logger.error(
        { err },
        `Failed to init config on join | guild = ${guild.id}`
      );
    }

    await reinstallModuleCommands(guild);
    await sendWelcome(guild, t);
  },
});
