import { EmbedBuilder } from "discord.js";
import { formatDayOfYear, type DayOfYear } from "#lib/calendar.js";
import type { TFunction } from "#lib/i18n.js";
import { truncate } from "#lib/text.js";
import type { BirthdayCardLabels } from "../rendering/birthday-card.js";
import { ACCENT } from "../rendering/theme.js";
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
    return t("announce.twins", {
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

/** Text posted with the card: the mentions, which an image cannot carry. */
export function cardContent(
  t: TFunction,
  locale: string,
  userIds: string[]
): string {
  return t("announce.card", {
    users: formatList(userIds.map(mention), locale),
  });
}

const ALT_LIMIT = 1024;

export interface BirthdayCard {
  labels: BirthdayCardLabels;
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
  // Outfit has no superscript letters: "1er", not "1ᵉʳ".
  const day = formatDayOfYear(today, locale);
  const date = locale.startsWith("fr") ? day.replace(/^1 /, "1er ") : day;
  const alt = [
    t("card.alt", { names: formatList(names, locale), date }),
    message ? t("card.altMessage", { message }) : "",
  ].join(" ");
  return {
    labels: {
      kicker: t("card.kicker", { count }),
      title:
        count <= 3 ? t(`card.title.${count}`) : t("card.title.many", { count }),
      date,
      ...(message && {
        message: {
          text: message,
          open: t("card.quoteOpen"),
          close: t("card.quoteClose"),
        },
      }),
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
    maximumFractionDigits: probability > 0.99 && probability < 1 ? 1 : 0,
    roundingMode: "trunc",
  });
}
