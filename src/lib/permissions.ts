import {
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type Message,
  type PermissionsString,
} from "discord.js";
import type { TFunction } from "./i18n.js";

// Whether the bot can reply to a message with a file: see the channel, post
// in it (or in the thread), attach the file and read the message it replies
// to. Permissions that cannot be resolved count as missing.
export function canReplyWithFile(message: Message<true>): boolean {
  const permissions = message.channel.permissionsFor(message.client.user);
  return (
    permissions?.has([
      PermissionFlagsBits.ViewChannel,
      message.channel.isThread()
        ? PermissionFlagsBits.SendMessagesInThreads
        : PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
    ]) ?? false
  );
}

export async function missingBotPermissions(
  guild: Guild,
  channel: GuildBasedChannel,
  required: PermissionsString[]
): Promise<PermissionsString[]> {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  return channel.permissionsFor(me)?.missing(required) ?? required;
}

// The permissions the bot lacks in `channel` among `required`, named with the
// module's `permission.<name>` keys and joined for a sentence; null when none
// is missing.
export async function missingBotPermissionNames(
  guild: Guild,
  channel: GuildBasedChannel,
  required: PermissionsString[],
  t: TFunction
): Promise<string | null> {
  const missing = await missingBotPermissions(guild, channel, required);
  return missing.length > 0
    ? missing.map((permission) => t(`permission.${permission}`)).join(", ")
    : null;
}
