import type { TFunction } from "#lib/i18n.js";

const MESSAGE_LIMIT = 2000;
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
 * their given order within a group: a header line ("**5 ans**"), then their
 * mentions on one line. Split into as many messages as Discord needs — 2000
 * characters, and 100 mentions since each message allows the mentions of its
 * own members only — and a message cut inside a group starts on its header
 * again, so that every mention reads under its years.
 */
export function memberAnniversaryMessages(
  t: TFunction,
  anniversaries: MemberAnniversary[]
): AnnouncementMessage[] {
  if (anniversaries.length === 0) {
    return [];
  }
  const sorted = [...anniversaries].sort((a, b) => b.years - a.years);
  const messages: AnnouncementMessage[] = [];
  let content = t("members.heading");
  let userIds: string[] = [];
  let years: number | null = null;
  for (const anniversary of sorted) {
    const tag = mention(anniversary.userId);
    const header = t("members.group", { count: anniversary.years });
    const sameGroup = anniversary.years === years;
    const added = sameGroup ? ` ${tag}` : `\n${header}\n${tag}`;
    if (
      userIds.length === MENTION_LIMIT ||
      content.length + added.length > MESSAGE_LIMIT
    ) {
      messages.push({ content, userIds });
      content = `${header}\n${tag}`;
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

export interface ServerAnniversary {
  years: number;
  members: number;
}

export function serverAnniversaryMessage(
  t: TFunction,
  anniversary: ServerAnniversary
): string {
  return [
    t("server.headline", { count: anniversary.years }),
    t("server.members", { count: anniversary.members }),
  ].join("\n");
}
