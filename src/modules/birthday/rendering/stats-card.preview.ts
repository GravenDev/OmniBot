import type { Previews } from "#lib/preview.js";
import { previewT } from "#lib/preview.js";
import fr from "../i18n/fr.json" with { type: "json" };
import type { BirthdayEntry } from "../services/birthday.service.js";
import {
  birthdayStats,
  statsCardLabels,
  type StatsOptions,
} from "../services/stats.js";
import { renderStatsCard } from "./stats-card.js";

// Made-up registrations: the dates are generated here, no member is real.
function entries(count: number, shared: boolean): BirthdayEntry[] {
  return Array.from({ length: count }, (_, index) => {
    // Spread over the year without two on the same day.
    const day = (index * 37) % 365;
    const date = new Date(Date.UTC(2001, 0, 1 + day));
    return {
      userId: `member-${index}`,
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      announce: index % 4 !== 0,
    };
  }).map((entry, index, all) =>
    // The last one takes the date of the first: one shared date.
    shared && index === all.length - 1
      ? { ...entry, day: all[0]!.day, month: all[0]!.month }
      : entry
  );
}

const t = await previewT("birthday", fr);

function render(list: BirthdayEntry[], options: StatsOptions = {}) {
  const stats = birthdayStats(list, options);
  return renderStatsCard(stats, statsCardLabels(t, "fr", stats), null);
}

export default {
  empty: () => render([]),
  one: () => render(entries(1, false)),
  twelve: () => render(entries(12, false)),
  "twelve-shared": () => render(entries(12, true), { firstCollisionCount: 12 }),
  "twenty-three": () => render(entries(23, false)),
  "forty-shared": () => render(entries(40, true), { firstCollisionCount: 21 }),
  "eighty-shared": () => render(entries(80, true), { firstCollisionCount: 31 }),
  // The option of another branch: the stats of a role.
  group: () =>
    render(entries(23, true), { group: "Rôle « Équipe d'animation »" }),
} satisfies Previews;
