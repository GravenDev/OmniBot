import type { Message } from "discord.js";
import type { MessageSnapshot } from "./services/store.service.js";

/** What a report keeps of the reported message, should it change or go. */
export function snapshotOf(message: Message<true>): MessageSnapshot {
  return {
    guildId: message.guildId,
    channelId: message.channelId,
    messageId: message.id,
    authorId: message.author.id,
    content: message.content,
    attachments: [
      ...[...message.attachments.values()].map((attachment) => ({
        name: attachment.name,
        url: attachment.url,
      })),
      ...[...message.stickers.values()].map((sticker) => ({
        name: sticker.name,
        url: sticker.url,
      })),
    ],
    createdAt: message.createdAt,
  };
}
