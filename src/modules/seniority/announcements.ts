import { escapeMarkdown } from "discord.js";
import { formatInteger } from "#lib/format.js";
import type { TFunction } from "#lib/i18n.js";
import { CELEBRATION_TEXT_LIMIT } from "#lib/post-card.js";
import type { ServerFacts } from "./cards.js";

/** Users a message may allow to mention. */
const MENTION_LIMIT = 100;

const mention = (userId: string) => `<@${userId}>`;

export interface MemberAnniversary {
  userId: string;
  years: number;
}

export interface AnnouncementMessage {
  content: string;
  /** The members the message names, and only them. */
  userIds: string[];
}

/**
 * The members celebrated, grouped by years, longest-standing first and in
 * their given order within a group: one line a group, its years then its
 * mentions ("**5 ans** · @a @b"). Split into as many messages as Discord
 * needs — 100 mentions, and the text a celebration may take since each message allows the
 * mentions of its own members only — and a line cut across messages starts
 * on its years again, so that every mention reads with them. The heading is
 * not part of it: it goes above the card.
 */
export function memberAnniversaryMessages(
  t: TFunction,
  anniversaries: MemberAnniversary[],
  limit = CELEBRATION_TEXT_LIMIT
): AnnouncementMessage[] {
  if (anniversaries.length === 0) {
    return [];
  }
  const sorted = [...anniversaries].sort((a, b) => b.years - a.years);
  const messages: AnnouncementMessage[] = [];
  let content = "";
  let userIds: string[] = [];
  let years: number | null = null;
  for (const anniversary of sorted) {
    const tag = mention(anniversary.userId);
    const line = `${t("members.group", { count: anniversary.years })} · ${tag}`;
    const sameGroup = anniversary.years === years;
    const added = sameGroup ? ` ${tag}` : `${content ? "\n" : ""}${line}`;
    if (
      userIds.length === MENTION_LIMIT ||
      content.length + added.length > limit
    ) {
      messages.push({ content, userIds });
      content = line;
      userIds = [];
    } else {
      content += added;
    }
    userIds.push(anniversary.userId);
    years = anniversary.years;
  }
  messages.push({ content, userIds });
  return messages;
}

/**
 * The server's anniversary as text, when its card cannot be posted: the same
 * facts as the card, without mentioning anyone.
 */
export function serverAnniversaryMessage(
  t: TFunction,
  locale: string,
  { years, createdOn, members, eldest }: ServerFacts
): string {
  const memberCount = t("serverCard.members", {
    count: members,
    formatted: formatInteger(members, locale),
  });
  return [
    t("server.headline", { count: years }),
    `${t("serverCard.created", { date: createdOn })} · ${memberCount}`,
    ...(eldest
      ? [
          t("serverCard.eldest", {
            name: escapeMarkdown(eldest.name),
            date: eldest.since,
          }),
        ]
      : []),
  ].join("\n");
}
