import { EmbedBuilder } from "discord.js";
import { formatDayOfYear, type DayOfYear } from "#lib/calendar.js";
import {
  SHOWN_PORTRAITS,
  type CelebrationCard,
} from "#lib/celebration-card.js";
import type { TFunction } from "#lib/i18n.js";
import { CELEBRATION_TEXT_LIMIT } from "#lib/post-card.js";
import { truncate } from "#lib/text.js";
import { ACCENT, CONFETTI } from "../rendering/theme.js";
import {
  CERTAIN_GROUP_SIZE,
  collisionProbability,
  HALF_GROUP_SIZE,
  type Milestone,
} from "./paradox.js";

export const MESSAGE_LIMIT = 2000;

export const BUILT_IN_MESSAGES = [
  "announce.builtIn.1",
  "announce.builtIn.2",
  "announce.builtIn.3",
] as const;

const mention = (userId: string) => `<@${userId}>`;

function formatList(items: string[], locale: string): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
}

/** Names of the guild's members, roles and channels, by ID. */
export interface MentionNames {
  user: (id: string) => string | undefined;
  role: (id: string) => string | undefined;
  channel: (id: string) => string | undefined;
}

const LINE_PREFIX = /^\s*(?:#{1,3}|-#|>{1,3})\s+/gm;
const PAIRED_MARKS = /\*\*|__|~~|\|\||`/g;
const EMPHASIS = /([*_])(\S(?:.*?\S)?)\1/g;

/**
 * The guild's message as plain text, for the card: an image would show Discord
 * markup as typed (`<@123>`, `**`). Mentions become names, custom emojis their
 * `:name:`, timestamps a date; unknown mentions are dropped.
 */
export function plainMessage(
  text: string,
  names: MentionNames,
  locale: string
): string {
  const named = (prefix: string, name: string | undefined) =>
    name === undefined ? "" : prefix + name;
  return text
    .replace(/<@!?(\d+)>/g, (_, id: string) => named("@", names.user(id)))
    .replace(/<@&(\d+)>/g, (_, id: string) => named("@", names.role(id)))
    .replace(/<#(\d+)>/g, (_, id: string) => named("#", names.channel(id)))
    .replace(/<\/([\w -]+):\d+>/g, "/$1")
    .replace(/<a?:(\w+):\d+>/g, ":$1:")
    .replace(/<t:(-?\d+)(?::[tTdDfFR])?>/g, (_, seconds: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
        new Date(Number(seconds) * 1000)
      )
    )
    .replace(/\[([^\]]+)\]\(<?[^)\s]+>?\)/g, "$1")
    .replace(LINE_PREFIX, "")
    .replace(PAIRED_MARKS, "")
    .replace(EMPHASIS, "$2")
    .replace(/\\([*_~|`>#\\[\]()-])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** One of the guild's messages at random, `null` when it has none. */
export function pickGuildMessage(
  templates: readonly string[],
  random: () => number = Math.random
): string | null {
  const usable = templates.filter((template) => template.trim() !== "");
  return usable[Math.floor(random() * usable.length)] ?? null;
}

/**
 * Birthday wish for the members celebrating today, as text: the guild's
 * message (`null`: a built-in one) for a single member, the shared wish when
 * several celebrate. Posted when the card cannot be drawn.
 */
export function birthdayMessage(
  t: TFunction,
  locale: string,
  template: string | null,
  userIds: string[],
  random: () => number = Math.random
): string {
  if (userIds.length > 1) {
    return t("announce.together", {
      users: formatList(userIds.map(mention), locale),
    });
  }
  const chosen =
    template ??
    t(BUILT_IN_MESSAGES[Math.floor(random() * BUILT_IN_MESSAGES.length)]!);
  // A guild message can be longer than Discord accepts once filled in.
  return truncate(
    chosen.replaceAll("{user}", mention(userIds[0]!)),
    MESSAGE_LIMIT
  );
}

/** Users a message may allow to mention: Discord refuses a message allowing more. */
const MENTION_LIMIT = 100;

export interface WishMessage {
  content: string;
  /** The members the message names, and only them. */
  userIds: string[];
}

/**
 * The members in order, over as few messages as Discord accepts: each one is
 * the sentence `wish` writes for its own members, within the length and
 * mention limits.
 */
function splitWish(
  userIds: string[],
  wish: (userIds: string[]) => string,
  limit = MESSAGE_LIMIT
): WishMessage[] {
  const messages: WishMessage[] = [];
  let current: string[] = [];
  for (const userId of userIds) {
    const next = [...current, userId];
    if (
      current.length > 0 &&
      (next.length > MENTION_LIMIT || wish(next).length > limit)
    ) {
      messages.push({ content: wish(current), userIds: current });
      current = [userId];
    } else {
      current = next;
    }
  }
  if (current.length > 0) {
    messages.push({ content: wish(current), userIds: current });
  }
  return messages;
}

/** Text under the card: the mentions, which an image cannot carry. */
export function cardMessages(
  locale: string,
  userIds: string[],
  limit = CELEBRATION_TEXT_LIMIT
): WishMessage[] {
  return splitWish(
    userIds,
    (some) => formatList(some.map(mention), locale),
    limit
  );
}

/**
 * The text wish, when the card is not posted. Too many members to wish them
 * together in one message: « Happy birthday @a, @b! », split over as many
 * messages as Discord needs.
 */
export function wishMessages(
  t: TFunction,
  locale: string,
  template: string | null,
  userIds: string[],
  random: () => number = Math.random
): WishMessage[] {
  const content = birthdayMessage(t, locale, template, userIds, random);
  if (userIds.length <= MENTION_LIMIT && content.length <= MESSAGE_LIMIT) {
    return [{ content, userIds }];
  }
  // Too many to wish together: one sentence a message, as many as needed.
  return splitWish(userIds, (some) =>
    t("announce.card", { users: formatList(some.map(mention), locale) })
  );
}

const ALT_LIMIT = 1024;

export interface BirthdayCard {
  /** What the card says, its portraits aside. */
  card: Omit<CelebrationCard, "avatars">;
  /** Alternative text of the image, with the guild's message. */
  alt: string;
}

/**
 * What the card says. Its frame (kicker, title, names, date) never changes, so
 * that it always reads as the module's; the guild's message, for a single
 * member, is quoted below as the server's own words.
 */
export function birthdayCard(
  t: TFunction,
  locale: string,
  names: string[],
  template: string | null,
  today: DayOfYear
): BirthdayCard {
  const count = names.length;
  const message =
    count === 1 && template ? template.replaceAll("{user}", names[0]!) : null;
  const date = formatDayOfYear(today, locale);
  const others = count - SHOWN_PORTRAITS;
  const alt = [
    t("card.alt", { names: formatList(names, locale), date }),
    message ? t("card.altMessage", { message }) : "",
  ].join(" ");
  return {
    card: {
      accent: ACCENT,
      confetti: CONFETTI,
      kicker: t("card.kicker", { count }),
      title:
        count <= 3 ? t(`card.title.${count}`) : t("card.title.many", { count }),
      names: names
        .slice(0, SHOWN_PORTRAITS)
        .concat(others > 0 ? [`+${others}`] : [])
        .join(" · "),
      ...(message && {
        quote: {
          text: message,
          open: t("card.quoteOpen"),
          close: t("card.quoteClose"),
        },
      }),
      footer: `🎂  ${date}`,
    },
    alt: truncate(alt.trim(), ALT_LIMIT),
  };
}

export interface MilestoneContext {
  count: number;
  expectedFirstCollision: number;
  locale: string;
}

/**
 * A milestone of the birthday paradox, as an embed: aggregate figures only,
 * never who registered nor which date is shared.
 */
export function milestoneEmbed(
  t: TFunction,
  milestone: Milestone,
  { count, expectedFirstCollision, locale }: MilestoneContext
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor([...ACCENT])
    .setAuthor({ name: t("paradox.author") });
  if (milestone === "first-collision") {
    embed.setTitle(t("paradox.milestone.firstCollision.title")).setDescription(
      t("paradox.milestone.firstCollision.description", {
        count,
        ordinal: true,
        expected: expectedFirstCollision.toLocaleString(locale, {
          maximumFractionDigits: 1,
        }),
      })
    );
  } else {
    embed
      .setTitle(t("paradox.milestone.count", { count }))
      .setDescription(t(`paradox.milestone.${milestone}`));
  }
  embed.addFields({
    name: t("paradox.field.probability"),
    value: formatPercent(collisionProbability(count), locale),
    inline: true,
  });
  const next = [HALF_GROUP_SIZE, CERTAIN_GROUP_SIZE].find(
    (size) => size > count
  );
  if (next !== undefined) {
    embed.addFields({
      name: t("paradox.field.next"),
      value: t("paradox.field.nextValue", {
        count: next,
        percent: formatPercent(collisionProbability(next), locale),
      }),
      inline: true,
    });
  }
  return embed;
}

/**
 * Truncated, never rounded up: 98.8 % must not read as the 99 % milestone,
 * nor 99.98 % as a certainty.
 */
export function formatPercent(probability: number, locale: string): string {
  return probability.toLocaleString(locale, {
    style: "percent",
    maximumFractionDigits: 1,
    roundingMode: "trunc",
  });
}
