import { ChannelType, type Guild } from "discord.js";
import type {
  ChannelRecord,
  ChannelRecordContext,
  ChannelRecordOutcome,
  ChannelRecordSource,
} from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { missingBotPermissionNames } from "#lib/permissions.js";
import { declareService, type Service } from "#lib/service.js";
import { cleanName, parseUserLimit } from "#modules/temp-voice/naming.js";
import { REQUIRED_PERMISSIONS } from "#modules/temp-voice/permissions.js";
import store from "./store.service.js";

const logger = loggerMaker("temp-voice");

/** The hubs edited in /config, a name template and a user limit per channel. */
export class HubRecords implements Service, ChannelRecordSource {
  async list(guildId: string): Promise<ChannelRecord[]> {
    return (await store.hubs(guildId)).map(
      ({ channelId, nameTemplate, userLimit }) => ({
        channelId,
        values: { name: nameTemplate, limit: String(userLimit) },
      })
    );
  }

  async save(
    guild: Guild,
    { channelId, values }: ChannelRecord,
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
    const missing = await missingBotPermissionNames(
      guild,
      channel.parent ?? channel,
      REQUIRED_PERMISSIONS,
      t
    );
    if (missing) {
      return {
        ok: false,
        message: t("hub.missingPermissions", {
          channel: `<#${channel.id}>`,
          permissions: missing,
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

  async remove(
    guild: Guild,
    channelId: string,
    { t, userId }: ChannelRecordContext
  ): Promise<ChannelRecordOutcome> {
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
  }
}

export default declareService(new HubRecords());
