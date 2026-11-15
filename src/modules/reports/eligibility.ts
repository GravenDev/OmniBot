import {
  PermissionFlagsBits,
  type Channel,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";

export type Ineligibility = "bot" | "self" | "alertChannel";

/** Why `reporterId` may not report `message`, or null when they may. */
export function ineligibility(
  message: Pick<Message<true>, "author" | "system" | "channelId" | "channel">,
  reporterId: string,
  alertChannelId: string | undefined
): Ineligibility | null {
  if (message.author.bot || message.system) {
    return "bot";
  }
  if (message.author.id === reporterId) {
    return "self";
  }
  const parentId = message.channel.isThread() ? message.channel.parentId : null;
  if (
    alertChannelId &&
    (message.channelId === alertChannelId || parentId === alertChannelId)
  ) {
    return "alertChannel";
  }
  return null;
}

/** Whether the bot can post alerts in `channel`. */
export function canPost(
  channel: Channel | null | undefined
): channel is GuildTextBasedChannel {
  if (!channel?.isSendable() || channel.isDMBased()) {
    return false;
  }
  const me = channel.guild.members.me;
  return (
    !me ||
    (channel
      .permissionsFor(me)
      ?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]) ??
      false)
  );
}
