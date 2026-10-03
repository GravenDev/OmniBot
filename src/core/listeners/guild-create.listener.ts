import {
  MessageFlags,
  PermissionFlagsBits,
  type Guild,
  type GuildTextBasedChannel,
} from "discord.js";
import { installModuleCommandsIn } from "#core/loaders/command-loader.js";
import { modules } from "#core/runtime.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { guildWelcomeMessage } from "#core/utils/core-messages.js";
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

function logSendError(error: unknown, where: string, guildId: string): void {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code: number }).code;
    if (code === 50001 || code === 50004 || code === 50007 || code === 50013) {
      logger.warn(
        `Welcome message not sent | where = ${where} | guild = ${guildId} | code = ${code}`
      );
      return;
    }
  }
  logger.error(
    { err: error },
    `Welcome message failed | where = ${where} | guild = ${guildId}`
  );
}

/** Reinstalls guild commands for every enabled module (Discord purges them on kick). */
async function reinstallModuleCommands(guild: Guild): Promise<void> {
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
