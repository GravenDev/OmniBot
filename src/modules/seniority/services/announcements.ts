import type { TFunction } from "#lib/i18n.js";

const MESSAGE_LIMIT = 2000;

const mention = (userId: string) => `<@${userId}>`;

export interface MemberAnniversary {
  userId: string;
  years: number;
}

/** Lines under one heading, split into as many messages as Discord's limit needs. */
export function chunkLines(heading: string, lines: string[]): string[] {
  const messages: string[] = [];
  let current = heading;
  for (const line of lines) {
    if (current.length + 1 + line.length > MESSAGE_LIMIT) {
      messages.push(current);
      current = line;
    } else {
      current = `${current}\n${line}`;
    }
  }
  messages.push(current);
  return messages;
}

export interface AnnouncementMessage {
  content: string;
  /** The members the message names, and only them. */
  userIds: string[];
}

export function memberAnniversaryMessages(
  t: TFunction,
  anniversaries: MemberAnniversary[]
): AnnouncementMessage[] {
  if (anniversaries.length === 0) {
    return [];
  }
  const sorted = [...anniversaries].sort((a, b) => b.years - a.years);
  const contents = chunkLines(
    t("members.heading"),
    sorted.map(({ userId, years }) =>
      t("members.line", { user: mention(userId), count: years })
    )
  );
  // Each message allows the mentions of its own lines only: Discord refuses
  // a message allowing more than 100, whatever its content.
  return contents.map((content) => ({
    content,
    userIds: sorted
      .map(({ userId }) => userId)
      .filter((userId) => content.includes(mention(userId))),
  }));
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
