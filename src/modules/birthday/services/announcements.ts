import type { TFunction } from "#lib/i18n.js";
import { truncate } from "#lib/text.js";
import type { Milestone } from "./paradox.js";

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

/**
 * Birthday wish for the members celebrating today: one of the guild's
 * messages for a single member, the shared wish when several celebrate.
 */
export function birthdayMessage(
  t: TFunction,
  locale: string,
  templates: readonly string[],
  userIds: string[],
  random: () => number = Math.random
): string {
  if (userIds.length > 1) {
    return t("announce.twins", {
      users: formatList(userIds.map(mention), locale),
    });
  }
  const usable = templates.filter((template) => template.trim() !== "");
  const pool =
    usable.length > 0 ? usable : BUILT_IN_MESSAGES.map((key) => t(key));
  const template = pool[Math.floor(random() * pool.length)] ?? pool[0]!;
  // A guild message can be longer than Discord accepts once filled in.
  return truncate(
    template.replaceAll("{user}", mention(userIds[0]!)),
    MESSAGE_LIMIT
  );
}

export interface MilestoneContext {
  count: number;
  expectedFirstCollision: number;
  locale: string;
}

export function milestoneMessage(
  t: TFunction,
  milestone: Milestone,
  context: MilestoneContext
): string {
  switch (milestone) {
    case "half":
      return t("paradox.milestone.half", { count: context.count });
    case "certain":
      return t("paradox.milestone.certain", { count: context.count });
    case "first-collision":
      return t("paradox.milestone.firstCollision", {
        count: context.count,
        ordinal: true,
        expected: context.expectedFirstCollision.toLocaleString(
          context.locale,
          { maximumFractionDigits: 1 }
        ),
      });
  }
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
