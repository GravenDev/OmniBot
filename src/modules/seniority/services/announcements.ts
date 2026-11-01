import type { TFunction } from "#lib/i18n.js";

const MESSAGE_LIMIT = 2000;
/** Users a message may allow to mention. */
const MENTION_LIMIT = 100;

const mention = (userId: string) => `<@${userId}>`;

export interface MemberAnniversary {
  userId: string;
  years: number;
}

/**
 * Lines under one heading, split into as many messages as Discord's limit
 * needs, and at most `maxLines` lines each; `separator` joins the lines (the
 * heading always ends its own line).
 */
export function chunkLines(
  heading: string,
  lines: string[],
  separator = "\n",
  maxLines = Infinity
): string[] {
  const messages: string[] = [];
  let current = heading;
  let joiner = "\n";
  let count = 0;
  for (const line of lines) {
    if (
      count === maxLines ||
      current.length + joiner.length + line.length > MESSAGE_LIMIT
    ) {
      messages.push(current);
      current = line;
      count = 1;
    } else {
      current = `${current}${joiner}${line}`;
      count++;
    }
    joiner = separator;
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
  return withMentions(
    chunkLines(
      t("members.heading"),
      sorted.map(({ userId, years }) =>
        t("members.line", { user: mention(userId), count: years })
      ),
      "\n",
      MENTION_LIMIT
    ),
    sorted.map(({ userId }) => userId)
  );
}

/** The heading and the mentions of the members celebrated, in their order, to go with the image. */
export function memberMentionMessages(
  t: TFunction,
  userIds: string[]
): AnnouncementMessage[] {
  if (userIds.length === 0) {
    return [];
  }
  return withMentions(
    chunkLines(t("members.heading"), userIds.map(mention), " ", MENTION_LIMIT),
    userIds
  );
}

// Each message allows the mentions of its own lines only: Discord refuses a
// message allowing more than 100, whatever its content.
function withMentions(
  contents: string[],
  userIds: string[]
): AnnouncementMessage[] {
  return contents.map((content) => ({
    content,
    userIds: userIds.filter((userId) => content.includes(mention(userId))),
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
