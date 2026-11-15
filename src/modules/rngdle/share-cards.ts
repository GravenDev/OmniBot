import { formatInteger, formatPercentage } from "#lib/format.js";
import type { TFunction } from "#lib/i18n.js";
import { PALETTE } from "#lib/imaging.js";
import type { Player } from "#lib/players.js";
import { TREND_COLORS } from "#lib/stat-card.js";
import type { RollBadges } from "./parsing/roll-badges.js";
import type { Placement, SharedRoll } from "./parsing/share.js";
import type {
  CardBadge,
  CardHighlight,
  RollCardData,
  RollCardLabels,
} from "./rendering/roll-card.js";
import { ACCENT } from "./rendering/theme.js";
import {
  formatPercent,
  TIERS,
  type ScoreTable,
  type Tier,
} from "./scoring/score-table.js";
import type { StoredRoll } from "./services/store.service.js";

const AVERAGE_MIN_ROLLS = 5;
const RANK_ICONS = ["🥇", "🥈", "🥉"];

// Where the data of a card comes from: a roll rngdle.com recorded for a
// linked member, a result the calculator confirmed, or the pasted text alone.
export type CardSource = "linked" | "calculator" | "pasted";

export interface CardRoll {
  userId: string;
  number: number;
  score: number;
  badgeCount: number;
  rolledAt: Date;
}

function tierOf(rarity: string): Tier | null {
  return TIERS.find((tier) => tier === rarity.toUpperCase()) ?? null;
}

/**
 * The badges of a card: the calculator's when it answered, else those the
 * pasted text lists, else only their number.
 */
export function cardBadges(
  roll: CardRoll,
  remote: RollBadges | null,
  shared: SharedRoll | null
): { badges: CardBadge[]; badgeCount: number } {
  if (remote) {
    return {
      badges: remote.badges.map((badge) => ({
        emoji: badge.emoji,
        label: badge.label,
        tier: tierOf(badge.rarity),
        ep: badge.ep,
        probability: Number.isFinite(badge.probability)
          ? badge.probability
          : null,
      })),
      badgeCount: remote.badges.length,
    };
  }
  if (shared) {
    return {
      badges: shared.badges.map((badge) => ({
        ...badge,
        ep: null,
        probability: null,
      })),
      badgeCount: shared.badges.length + shared.hiddenBadges,
    };
  }
  return { badges: [], badgeCount: roll.badgeCount };
}

function averageOf(rolls: StoredRoll[]): number {
  return rolls.reduce((sum, roll) => sum + roll.score, 0) / rolls.length;
}

export function computeHighlights(
  t: TFunction,
  roll: CardRoll,
  previous: StoredRoll[],
  today: StoredRoll[],
  locale: string
): CardHighlight[] {
  const highlights: CardHighlight[] = [];
  if (
    previous.length > 0 &&
    previous.every((earlier) => roll.score > earlier.score)
  ) {
    highlights.push({
      icon: "🏆",
      text: t("card.personalBest"),
      color: ACCENT,
    });
  }

  const others = today.filter((other) => other.userId !== roll.userId);
  if (others.length > 0) {
    const rank = 1 + others.filter((other) => other.score > roll.score).length;
    highlights.push({
      icon: RANK_ICONS[rank - 1] ?? "🎯",
      text: t("card.rank", { rank, count: others.length + 1 }),
      color: rank === 1 ? ACCENT : PALETTE.title,
    });
  }

  if (previous.length >= AVERAGE_MIN_ROLLS) {
    const delta = Math.round(roll.score - averageOf(previous));
    highlights.push({
      icon: delta >= 0 ? "📈" : "📉",
      text: t("card.vsAverage", {
        delta: `${delta >= 0 ? "+" : "−"}${formatInteger(Math.abs(delta), locale)}`,
      }),
      color: delta >= 0 ? TREND_COLORS.up : TREND_COLORS.down,
    });
  }
  return highlights;
}

function placementText(
  t: TFunction,
  placement: Placement,
  locale: string
): string {
  return t(placement.top ? "card.top" : "card.bottom", {
    percent: formatPercentage(placement.percent, locale, 2),
  });
}

export interface RollCardInput {
  roll: CardRoll;
  shared: SharedRoll | null;
  source: CardSource;
  table: ScoreTable;
  player: Player | undefined;
  badges: CardBadge[];
  badgeCount: number;
  highlights: CardHighlight[];
}

/** What the card of a pasted result shows. */
export function rollCardData(
  t: TFunction,
  locale: string,
  input: RollCardInput
): RollCardData {
  const { roll, shared, source, table, player } = input;
  const percent = table.percentOf(roll.score);
  return {
    name: player?.name ?? "?",
    avatar: player?.avatar ?? null,
    subtitle: [
      t("leaderboard.subtitle", {
        date: new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(roll.rolledAt),
      }),
      // Only a linked member's recorded roll comes from rngdle.com itself.
      ...(source === "linked" ? [] : [t("card.notLinked")]),
    ].join(" · "),
    number: roll.number,
    score: roll.score,
    tier: table.tierOf(roll.score),
    // A verified card ranks the recorded score, never the pasted text.
    placement:
      source === "pasted" && shared?.placement
        ? placementText(t, shared.placement, locale)
        : t(percent > 50 ? "card.top" : "card.bottom", {
            percent: formatPercent(percent, locale),
          }),
    badges: input.badges,
    badgeCount: input.badgeCount,
    highlights: input.highlights,
  };
}

export function rollCardLabels(
  t: TFunction,
  locale: string,
  badgeCount: number
): RollCardLabels {
  return {
    locale,
    number: t("card.number"),
    score: t("card.score"),
    badges: t("card.badges"),
    badgeCount: t("card.badgeCount", { count: badgeCount }),
    included: t("card.included"),
    more: (count) => t("card.more", { count }),
    probability: (value) =>
      t("card.probability", {
        percent: value.toLocaleString(locale, {
          maximumSignificantDigits: value < 1 ? 2 : 3,
        }),
      }),
  };
}
