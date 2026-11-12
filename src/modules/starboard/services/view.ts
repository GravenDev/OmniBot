import { type Message, MessageFlags } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { reportedMessage } from "#lib/reported-message.js";
import type { Tally } from "./tally.js";

const ACCENT = 0xf5c518;

const CONTENT_LIMIT = 1500;

export function counterLine(
  tally: Tally,
  fallbackEmoji: string,
  t: TFunction
): string {
  const reactions =
    tally.reactions.length > 0
      ? tally.reactions
      : [{ emoji: fallbackEmoji, count: 0 }];
  const counts = reactions
    .map(({ emoji, count }) => `${emoji} **${count}**`)
    .join(" · ");
  return tally.reactions.length > 1
    ? `${counts} · ${t("total", { count: tally.total })}`
    : counts;
}

export function starboardMessage(
  message: Message<true>,
  reply: Message | null,
  tally: Tally,
  fallbackEmoji: string,
  t: TFunction,
  withMedia = true
) {
  return {
    components: [
      reportedMessage(message, t, {
        accent: ACCENT,
        footer: counterLine(tally, fallbackEmoji, t),
        reply,
        contentLimit: CONTENT_LIMIT,
        withMedia,
      }),
    ],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: NO_MENTIONS,
  };
}
