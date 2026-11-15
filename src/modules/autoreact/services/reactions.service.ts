import {
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  type PermissionsString,
} from "discord.js";
import {
  fetchGuildEmojis,
  resolveEmoji,
  type ChannelRecord,
  type ChannelRecordContext,
  type ChannelRecordOutcome,
  type ChannelRecordSource,
} from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { missingBotPermissionNames } from "#lib/permissions.js";
import { declareService, type Service } from "#lib/service.js";
import store from "./store.service.js";

const logger = loggerMaker("autoreact");

const CUSTOM_EMOJI_ID = /:(\d{17,20})>$/;

const REQUIRED_PERMISSIONS: PermissionsString[] = [
  "ViewChannel",
  "ReadMessageHistory",
  "AddReactions",
];

/** The auto-reactions edited in /config, one emoji per channel. */
export class ReactionRecords implements Service, ChannelRecordSource {
  async parseEmoji(guild: Guild, value: string): Promise<string | null> {
    const guildEmojis = await fetchGuildEmojis(guild);
    const emoji = resolveEmoji(value.trim(), guildEmojis);
    const customId = emoji?.match(CUSTOM_EMOJI_ID)?.[1];
    if (
      customId &&
      !guildEmojis.some((guildEmoji) => guildEmoji.id === customId) &&
      !guild.client.emojis.resolve(customId)
    ) {
      return null;
    }
    return emoji;
  }

  async list(guildId: string): Promise<ChannelRecord[]> {
    return (await store.list(guildId)).map(({ channelId, emoji }) => ({
      channelId,
      values: { emoji },
    }));
  }

  async save(
    guild: Guild,
    { channelId, values }: ChannelRecord,
    context: ChannelRecordContext
  ): Promise<ChannelRecordOutcome> {
    const channel = guild.channels.cache.get(channelId);
    if (
      channel?.type !== ChannelType.GuildText &&
      channel?.type !== ChannelType.GuildAnnouncement
    ) {
      return { ok: false, message: context.t("set.unknownChannel") };
    }
    return this.setReaction(guild, channel, values["emoji"] ?? "", context);
  }

  async remove(
    guild: Guild,
    channelId: string,
    { t, userId }: ChannelRecordContext
  ): Promise<ChannelRecordOutcome> {
    const removed = await store.remove(guild.id, channelId);
    if (removed) {
      logger.info(
        `Auto-reaction removed | guildId = ${guild.id} | channelId = ${channelId} | by = ${userId}`
      );
    }
    return {
      ok: removed > 0,
      message: t(removed ? "remove.done" : "remove.none", {
        channel: `<#${channelId}>`,
      }),
    };
  }

  private async setReaction(
    guild: Guild,
    channel: GuildBasedChannel,
    value: string,
    { t, userId }: ChannelRecordContext
  ): Promise<ChannelRecordOutcome> {
    const emoji = await this.parseEmoji(guild, value);
    if (!emoji) {
      return { ok: false, message: t("set.invalidEmoji", { emoji: value }) };
    }

    const missing = await missingBotPermissionNames(
      guild,
      channel,
      REQUIRED_PERMISSIONS,
      t
    );
    if (missing) {
      return {
        ok: false,
        message: t("set.missingPermissions", {
          channel: `<#${channel.id}>`,
          permissions: missing,
        }),
      };
    }

    await store.set(guild.id, channel.id, emoji);
    logger.info(
      `Auto-reaction set | guildId = ${guild.id} | channelId = ${channel.id} | emoji = ${emoji} | by = ${userId}`
    );
    return {
      ok: true,
      message: t("set.done", { channel: `<#${channel.id}>`, emoji }),
    };
  }
}

export default declareService(new ReactionRecords());
