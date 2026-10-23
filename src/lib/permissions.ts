import { PermissionFlagsBits, type Message } from "discord.js";

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
