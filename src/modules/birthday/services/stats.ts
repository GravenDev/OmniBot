import { formatDayOfYear, type DayOfYear } from "#lib/calendar.js";
import type { TFunction } from "#lib/i18n.js";
import { truncate } from "#lib/text.js";
import type { StatsCardLabels } from "../rendering/stats-card.js";
import { formatPercent } from "./announcements.js";
import type { BirthdayEntry } from "./birthday.service.js";
import {
  CERTAIN_GROUP_SIZE,
  collisionProbability,
  expectedFirstCollision,
  HALF_GROUP_SIZE,
  sharedDates,
} from "./paradox.js";

/** The curve runs to at least this many registrations. */
export const CURVE_MIN_SIZE = 70;
const CURVE_STEP = 10;
const ALT_LIMIT = 1024;

export interface StatsOptions {
  /** Registrations when the first shared date appeared, if it was recorded. */
  firstCollisionCount?: number | null;
  /** Who is counted when it is not the whole server (a role, a channel). */
  group?: string;
}

/** What `/birthday stats` shows, before any translation. */
export interface BirthdayStats {
  count: number;
  /** Theoretical probability that two of them share a date. */
  probability: number;
  sharedCount: number;
  /** Shared dates whose members all agreed to be announced, in order. */
  namedShared: DayOfYear[];
  /** Shared dates left unnamed: one of their members is not announced. */
  hiddenShared: number;
  firstCollisionCount: number | null;
  expectedFirstCollision: number;
  /** Registrations left before one chance in two, 0 once it is reached. */
  untilHalf: number;
  /**
   * Registrations per month, January first. Never per day: a day's count
   * could give away the date of a member who chose not to be announced.
   */
  months: number[];
  /** Largest group size drawn on the curve. */
  curveMax: number;
  group?: string;
}

/**
 * The stats of `entries`, all the server's or a group's: a pure function, so
 * that any subset of members can be shown the same way.
 */
export function birthdayStats(
  entries: readonly BirthdayEntry[],
  options: StatsOptions = {}
): BirthdayStats {
  const count = entries.length;
  const shared = sharedDates(entries);
  const namedShared = shared
    .filter((date) => date.entries.every((entry) => entry.announce))
    .map(({ day, month }) => ({ day, month }));
  const months = Array.from({ length: 12 }, () => 0);
  for (const entry of entries) {
    months[entry.month - 1]!++;
  }
  return {
    count,
    probability: collisionProbability(count),
    sharedCount: shared.length,
    namedShared,
    hiddenShared: shared.length - namedShared.length,
    firstCollisionCount: options.firstCollisionCount ?? null,
    expectedFirstCollision: expectedFirstCollision(),
    untilHalf: Math.max(0, HALF_GROUP_SIZE - count),
    months,
    curveMax: Math.max(
      CURVE_MIN_SIZE,
      Math.ceil(count / CURVE_STEP) * CURVE_STEP
    ),
    ...(options.group !== undefined && { group: options.group }),
  };
}

function formatExpected(stats: BirthdayStats, locale: string): string {
  return stats.expectedFirstCollision.toLocaleString(locale, {
    maximumFractionDigits: 1,
  });
}

/** The message's text: a summary of the card, and the dates it can name. */
export function statsText(
  t: TFunction,
  locale: string,
  stats: BirthdayStats
): string {
  const lines = [
    t("stats.title"),
    t("stats.probability", {
      count: stats.count,
      percent: formatPercent(stats.probability, locale),
    }),
  ];
  if (stats.sharedCount === 0) {
    lines.push(t("stats.noShared"));
  } else {
    lines.push(t("stats.shared", { count: stats.sharedCount }));
    if (stats.namedShared.length > 0) {
      lines.push(
        t("stats.sharedDates", {
          dates: new Intl.ListFormat(locale).format(
            stats.namedShared.map((date) => formatDayOfYear(date, locale))
          ),
        })
      );
    }
    if (stats.hiddenShared > 0) {
      lines.push(t("stats.sharedHidden", { count: stats.hiddenShared }));
    }
  }
  if (stats.firstCollisionCount !== null) {
    lines.push(
      t("stats.firstCollision", {
        count: stats.firstCollisionCount,
        ordinal: true,
        expected: formatExpected(stats, locale),
      })
    );
  } else if (stats.untilHalf > 0) {
    lines.push(t("stats.untilHalf", { count: stats.untilHalf }));
  }
  lines.push(t("stats.footnote"));
  return lines.join("\n");
}

/** Every text the card draws, and its alternative text. */
export function statsCardLabels(
  t: TFunction,
  locale: string,
  stats: BirthdayStats
): StatsCardLabels {
  const percent = (value: number) => formatPercent(value, locale);
  const registered = t("statsCard.registered", { count: stats.count });
  const expected = formatExpected(stats, locale);
  const monthName = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  });
  const longMonth = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  });
  const date = (month: number) => new Date(Date.UTC(2000, month, 1));

  const firstCollision =
    stats.firstCollisionCount !== null
      ? t("statsCard.firstCollision.value", {
          count: stats.firstCollisionCount,
          ordinal: true,
        })
      : t(
          stats.sharedCount > 0
            ? "statsCard.firstCollision.unknown"
            : "statsCard.firstCollision.none"
        );
  const untilHalf =
    stats.untilHalf > 0
      ? t("statsCard.untilHalf.value", { count: stats.untilHalf })
      : t("statsCard.untilHalf.passed");

  const labels: Omit<StatsCardLabels, "alt"> = {
    title: t("statsCard.title"),
    subtitle:
      stats.group !== undefined
        ? t("statsCard.groupSubtitle", { group: stats.group, registered })
        : registered,
    probability: {
      title: t("statsCard.probability.title"),
      value: percent(stats.probability),
      subtext: t("statsCard.probability.subtext"),
    },
    shared: {
      title: t("statsCard.shared.title"),
      value: stats.sharedCount.toLocaleString(locale),
      subtext:
        stats.hiddenShared > 0
          ? t("statsCard.shared.hidden", { count: stats.hiddenShared })
          : t(
              stats.sharedCount > 0
                ? "statsCard.shared.subtext"
                : "statsCard.shared.none"
            ),
    },
    firstCollision: {
      title: t("statsCard.firstCollision.title"),
      value: firstCollision,
      subtext: t("statsCard.firstCollision.subtext", { expected }),
    },
    untilHalf: {
      title: t("statsCard.untilHalf.title"),
      value: untilHalf,
      subtext: t("statsCard.untilHalf.subtext", { count: HALF_GROUP_SIZE }),
    },
    curve: {
      title: t("statsCard.curve.title"),
      half: percent(collisionProbability(HALF_GROUP_SIZE)),
      certain: percent(collisionProbability(CERTAIN_GROUP_SIZE)),
      here: t("statsCard.curve.here"),
    },
    months: {
      title: t("statsCard.months.title"),
      names: Array.from({ length: 12 }, (_, month) =>
        monthName.format(date(month))
      ),
    },
  };

  const item = (label: string, value: string) =>
    t("statsCard.alt.item", { label, value });
  const alt = [
    item(labels.title, labels.subtitle),
    item(labels.probability.title, labels.probability.value),
    item(labels.shared.title, labels.shared.value),
    item(
      labels.firstCollision.title,
      `${firstCollision} (${labels.firstCollision.subtext})`
    ),
    item(labels.untilHalf.title, untilHalf),
    item(
      labels.months.title,
      stats.months
        .map((count, month) =>
          t("statsCard.alt.month", {
            month: longMonth.format(date(month)),
            count,
          })
        )
        .join(", ")
    ),
  ];
  return { ...labels, alt: truncate(alt.join(" "), ALT_LIMIT) };
}
