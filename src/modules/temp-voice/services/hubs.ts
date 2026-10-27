import { ChannelType, type Guild } from "discord.js";
import type {
  ChannelRecordContext,
  ChannelRecordOutcome,
  ChannelRecordSource,
} from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { missingBotPermissions } from "#lib/permissions.js";
import { cleanName, parseUserLimit } from "./naming.js";
import { REQUIRED_PERMISSIONS } from "./permissions.js";
import store from "./store.js";

const logger = loggerMaker("temp-voice");

export async function saveHub(
  guild: Guild,
  channelId: string,
  values: Record<string, string>,
  { t, userId }: ChannelRecordContext
): Promise<ChannelRecordOutcome> {
  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  if (channel?.type !== ChannelType.GuildVoice) {
    return { ok: false, message: t("hub.unknownChannel") };
  }
  if (await store.channel(channelId)) {
    return { ok: false, message: t("hub.isTemporary") };
  }
  const nameTemplate = cleanName(values["name"] ?? "");
  if (!nameTemplate) {
    return { ok: false, message: t("hub.invalidName") };
  }
  const userLimit = parseUserLimit(values["limit"] ?? "");
  if (userLimit === null) {
    return { ok: false, message: t("hub.invalidLimit") };
  }
  const missing = await missingBotPermissions(
    guild,
    channel.parent ?? channel,
    REQUIRED_PERMISSIONS
  );
  if (missing.length > 0) {
    return {
      ok: false,
      message: t("hub.missingPermissions", {
        channel: `<#${channel.id}>`,
        permissions: missing
          .map((permission) => t(`permission.${permission}`))
          .join(", "),
      }),
    };
  }
  await store.saveHub(guild.id, { channelId, nameTemplate, userLimit });
  logger.info(
    `Hub saved | guildId = ${guild.id} | channelId = ${channelId} | by = ${userId}`
  );
  return {
    ok: true,
    message: t("hub.saved", { channel: `<#${channelId}>` }),
  };
}

export const hubRecords: ChannelRecordSource = {
  async list(guildId) {
    return (await store.hubs(guildId)).map(
      ({ channelId, nameTemplate, userLimit }) => ({
        channelId,
        values: { name: nameTemplate, limit: String(userLimit) },
      })
    );
  },
  save(guild, { channelId, values }, context) {
    return saveHub(guild, channelId, values, context);
  },
  async remove(guild, channelId, { t, userId }) {
    const removed = await store.removeHub(guild.id, channelId);
    if (removed) {
      logger.info(
        `Hub removed | guildId = ${guild.id} | channelId = ${channelId} | by = ${userId}`
      );
    }
    return {
      ok: removed,
      message: t(removed ? "hub.removed" : "hub.none", {
        channel: `<#${channelId}>`,
      }),
    };
  },
};
