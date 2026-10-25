import {
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  type PermissionsString,
} from "discord.js";
import {
  fetchGuildEmojis,
  resolveEmoji,
  type ChannelRecordContext,
  type ChannelRecordOutcome,
  type ChannelRecordSource,
} from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { missingBotPermissions } from "#lib/permissions.js";
import store from "#modules/autoreact/services/store.js";

const logger = loggerMaker("autoreact");

const CUSTOM_EMOJI_ID = /:(\d{17,20})>$/;

const REQUIRED_PERMISSIONS: PermissionsString[] = [
  "ViewChannel",
  "ReadMessageHistory",
  "AddReactions",
];

export async function parseEmoji(
  guild: Guild,
  value: string
): Promise<string | null> {
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

export async function setReaction(
  guild: Guild,
  channel: GuildBasedChannel,
  value: string,
  { t, userId }: ChannelRecordContext
): Promise<ChannelRecordOutcome> {
  const emoji = await parseEmoji(guild, value);
  if (!emoji) {
    return { ok: false, message: t("set.invalidEmoji", { emoji: value }) };
  }

  const missing = await missingBotPermissions(
    guild,
    channel,
    REQUIRED_PERMISSIONS
  );
  if (missing.length > 0) {
    return {
      ok: false,
      message: t("set.missingPermissions", {
        channel: `<#${channel.id}>`,
        permissions: missing
          .map((permission) => t(`permission.${permission}`))
          .join(", "),
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

export async function removeReaction(
  guildId: string,
  channelId: string,
  { t, userId }: ChannelRecordContext
): Promise<ChannelRecordOutcome> {
  const removed = await store.remove(guildId, channelId);
  if (removed) {
    logger.info(
      `Auto-reaction removed | guildId = ${guildId} | channelId = ${channelId} | by = ${userId}`
    );
  }
  return {
    ok: removed > 0,
    message: t(removed ? "remove.done" : "remove.none", {
      channel: `<#${channelId}>`,
    }),
  };
}

export const reactionRecords: ChannelRecordSource = {
  async list(guildId) {
    return (await store.list(guildId)).map(({ channelId, emoji }) => ({
      channelId,
      values: { emoji },
    }));
  },
  async save(guild, { channelId, values }, context) {
    const channel = guild.channels.cache.get(channelId);
    if (
      channel?.type !== ChannelType.GuildText &&
      channel?.type !== ChannelType.GuildAnnouncement
    ) {
      return { ok: false, message: context.t("set.unknownChannel") };
    }
    return setReaction(guild, channel, values["emoji"] ?? "", context);
  },
  remove(guild, channelId, context) {
    return removeReaction(guild.id, channelId, context);
  },
};
