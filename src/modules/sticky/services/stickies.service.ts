import { ChannelType, type Guild, type PermissionsString } from "discord.js";
import type {
  ChannelRecord,
  ChannelRecordContext,
  ChannelRecordOutcome,
  ChannelRecordSource,
} from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { missingBotPermissionNames } from "#lib/permissions.js";
import { declareService, type Service } from "#lib/service.js";
import poster from "./poster.service.js";
import store from "./store.service.js";

const logger = loggerMaker("sticky");

const REQUIRED_PERMISSIONS: PermissionsString[] = [
  "ViewChannel",
  "SendMessages",
];

/** The sticky messages edited in /config, one message per channel. */
export class StickyRecords implements Service, ChannelRecordSource {
  async list(guildId: string): Promise<ChannelRecord[]> {
    return (await store.list(guildId)).map(({ channelId, content }) => ({
      channelId,
      values: { content },
    }));
  }

  save(
    guild: Guild,
    { channelId, values }: ChannelRecord,
    context: ChannelRecordContext
  ): Promise<ChannelRecordOutcome> {
    return this.stick(guild, channelId, values["content"] ?? "", context);
  }

  remove(
    guild: Guild,
    channelId: string,
    context: ChannelRecordContext
  ): Promise<ChannelRecordOutcome> {
    return this.unstick(guild, channelId, context);
  }

  private async stick(
    guild: Guild,
    channelId: string,
    value: string,
    { t, userId }: ChannelRecordContext
  ): Promise<ChannelRecordOutcome> {
    const channel = await this.stickyChannel(guild, channelId);
    if (!channel) {
      return { ok: false, message: t("set.unknownChannel") };
    }
    const content = value.trim();
    if (!content) {
      return { ok: false, message: t("set.empty") };
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

  private async unstick(
    guild: Guild,
    channelId: string,
    { t, userId }: ChannelRecordContext
  ): Promise<ChannelRecordOutcome> {
    const channel = await this.stickyChannel(guild, channelId);
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

  private async stickyChannel(guild: Guild, channelId: string) {
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    return channel?.type === ChannelType.GuildText ||
      channel?.type === ChannelType.GuildAnnouncement
      ? channel
      : undefined;
  }
}

export default declareService(new StickyRecords());
