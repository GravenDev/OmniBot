import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import type { CalendarDay } from "#lib/calendar.js";
import type { Previews } from "#lib/preview.js";
import { previewT } from "#lib/preview.js";
import fr from "../i18n/fr.json" with { type: "json" };
import { calendarLabels, leadingDays } from "../services/calendar.js";
import { renderBirthdayCalendar, type Celebrant } from "./birthday-calendar.js";

// Made-up members; their avatars are plain gradients drawn here (no network),
// or missing.
async function avatar(from: string, to: string): Promise<Image> {
  const ctx = createCanvas(64, 64).getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 64, 64);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return loadImage(ctx.canvas.toBuffer("image/png"));
}

const GRADIENTS: [string, string][] = [
  ["#ff7eb3", "#7b61ff"],
  ["#43cea2", "#185a9d"],
  ["#8e2de2", "#4a00e0"],
  ["#f7971e", "#ffd200"],
  ["#ee0979", "#ff6a00"],
];
const NAMES = [
  "Camille",
  "Yanis",
  "Léa",
  "Nora",
  "Sacha",
  "Inès",
  "Noam",
  "Alix",
  "Maël",
  "🌸 Lou",
];
const members: Celebrant[] = await Promise.all(
  NAMES.map(async (name, index) => ({
    name,
    // One in four has no avatar.
    avatar:
      index % 4 === 2
        ? null
        : await avatar(...GRADIENTS[index % GRADIENTS.length]!),
  }))
);
// At Discord's 32-character limit.
const longName: Celebrant = {
  name: "Maximilienne-Clémentine 🎉 Durand",
  avatar: null,
};

const t = await previewT("birthday", fr);

/** `byDay` maps a day of the month to its members. */
function render(month: CalendarDay, byDay: Record<number, Celebrant[]>) {
  const length = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  return Promise.resolve(
    renderBirthdayCalendar(
      {
        leading: leadingDays(month.year, month.month, "fr"),
        days: Array.from({ length }, (_, index) => byDay[index + 1] ?? []),
      },
      calendarLabels(t, "fr", month)
    )
  );
}

const at = (index: number) => members[index % members.length]!;

export default {
  // Six weeks: the 1st is a Sunday.
  busy: () =>
    render(
      { year: 2026, month: 11, day: 1 },
      Object.fromEntries(
        [1, 3, 4, 8, 11, 12, 15, 17, 19, 22, 23, 26, 28, 30].map(
          (day, index) => [
            day,
            Array.from({ length: (index % 3) + 1 }, (_, n) => at(index + n)),
          ]
        )
      )
    ),
  single: () => render({ year: 2026, month: 12, day: 1 }, { 14: [at(0)] }),
  "five-on-a-day": () =>
    render({ year: 2027, month: 3, day: 1 }, { 21: members.slice(0, 5) }),
  // February of a common year: four weeks; the 28th also has the 29th's.
  "long-names": () =>
    render(
      { year: 2027, month: 2, day: 1 },
      { 5: [longName], 28: [longName, at(1)] }
    ),
} satisfies Previews;
