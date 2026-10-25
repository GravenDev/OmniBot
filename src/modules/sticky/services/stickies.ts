import { ChannelType, type Guild, type PermissionsString } from "discord.js";
import type {
  ChannelRecordContext,
  ChannelRecordOutcome,
  ChannelRecordSource,
} from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { missingBotPermissions } from "#lib/permissions.js";
import poster from "./poster.js";
import store from "./store.js";

const logger = loggerMaker("sticky");

const REQUIRED_PERMISSIONS: PermissionsString[] = [
  "ViewChannel",
  "SendMessages",
];

async function stickyChannel(guild: Guild, channelId: string) {
  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  return channel?.type === ChannelType.GuildText ||
    channel?.type === ChannelType.GuildAnnouncement
    ? channel
    : undefined;
}

export async function stick(
  guild: Guild,
  channelId: string,
  value: string,
  { t, userId }: ChannelRecordContext
): Promise<ChannelRecordOutcome> {
  const channel = await stickyChannel(guild, channelId);
  if (!channel) {
    return { ok: false, message: t("set.unknownChannel") };
  }
  const content = value.trim();
  if (!content) {
    return { ok: false, message: t("set.empty") };
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
  const posted = await poster.set(channel, content);
  logger.info(
    `Sticky set | guildId = ${guild.id} | channelId = ${channel.id} | posted = ${posted} | by = ${userId}`
  );
  return {
    ok: true,
    message: t(posted ? "set.done" : "set.notPosted", {
      channel: `<#${channel.id}>`,
    }),
  };
}

export async function unstick(
  guild: Guild,
  channelId: string,
  { t, userId }: ChannelRecordContext
): Promise<ChannelRecordOutcome> {
  const channel = await stickyChannel(guild, channelId);
  const { removed, leftover } = channel
    ? await poster.unstick(channel)
    : {
        removed: (await store.remove(guild.id, channelId)) > 0,
        leftover: false,
      };
  if (removed) {
    logger.info(
      `Sticky removed | guildId = ${guild.id} | channelId = ${channelId} | by = ${userId}`
    );
  }
  const key = !removed
    ? "remove.none"
    : leftover
      ? "remove.leftover"
      : "remove.done";
  return { ok: removed, message: t(key, { channel: `<#${channelId}>` }) };
}

export const stickyRecords: ChannelRecordSource = {
  async list(guildId) {
    return (await store.list(guildId)).map(({ channelId, content }) => ({
      channelId,
      values: { content },
    }));
  },
  save(guild, { channelId, values }, context) {
    return stick(guild, channelId, values["content"] ?? "", context);
  },
  remove(guild, channelId, context) {
    return unstick(guild, channelId, context);
  },
};
