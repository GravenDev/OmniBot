// Made-up members and server; the avatars are generated initials.
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import {
  renderCelebrationImage,
  type CelebrationCard,
} from "#lib/celebration-card.js";
import { font, registerFont } from "#lib/imaging.js";
import type { Previews } from "#lib/preview.js";
import { firstFrame, previewT } from "#lib/preview.js";
import fr from "../i18n/fr.json" with { type: "json" };
import { membersCardText, serverCardText } from "../services/cards.js";

registerFont(
  new URL("../../../lib/assets/outfit.ttf", import.meta.url),
  "Outfit"
);

async function avatar(
  letter: string,
  from: string,
  to: string
): Promise<Image> {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = font(130);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, 128, 136);
  return loadImage(canvas.toBuffer("image/png"));
}

const t = await previewT("seniority", fr);
const today = { day: 1, month: 11 };
const icon = await avatar("G", "#5865f2", "#2b2d31");

const people = [
  { name: "Nora", years: 9, avatar: await avatar("N", "#8e2de2", "#4a00e0") },
  // 32 characters, Discord's limit, with emojis.
  {
    name: "Maximilien-Alexandre Duval 🌟✨🎉",
    years: 7,
    avatar: await avatar("M", "#43cea2", "#185a9d"),
  },
  { name: "Léa", years: 5, avatar: await avatar("L", "#f7971e", "#ffd200") },
  { name: "Yanis", years: 4, avatar: null },
  { name: "Camille", years: 3, avatar: null },
  { name: "Sasha", years: 2, avatar: null },
  { name: "Élie", years: 1, avatar: null },
  { name: "Morgan", years: 1, avatar: null },
];

// The card the bot posts, as Discord shows it still.
async function still(card: CelebrationCard) {
  return firstFrame((await renderCelebrationImage(card)).data);
}

function members(count: number) {
  const shown = people.slice(0, count);
  const { card } = membersCardText(t, "fr", shown, today);
  return still({ ...card, avatars: shown.map((p) => p.avatar) });
}

// A busy day on a large server, as on 2026-11-09: 23 members, three years.
function crowd(years = [5, 5, 5, ...Array(8).fill(4), ...Array(12).fill(3)]) {
  const shown = years.map((count, index) => ({
    ...(people[index] ?? { name: `Membre ${index}`, avatar: null }),
    years: count,
  }));
  const { card } = membersCardText(t, "fr", shown, today);
  return still({ ...card, avatars: shown.map((p) => p.avatar) });
}

function server(eldest: boolean, years = 10) {
  const { card } = serverCardText(t, "fr", {
    years,
    createdOn: "1er novembre 2016",
    members: 12480,
    eldest: eldest ? { name: "Nora", since: "3 mars 2017" } : null,
  });
  return still({ ...card, avatars: [eldest ? icon : null] });
}

export default {
  "seniority-one": () => members(1),
  "seniority-three": () => members(3),
  "seniority-eight": () => members(8),
  "seniority-crowd": () => crowd(),
  // A ten-year-old server: more years than the line holds.
  "seniority-decade": () =>
    crowd([
      10, 9, 9, 8, 7, 7, 6, 5, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1,
    ]),
  "server-anniversary": () => server(true),
  "server-anniversary-bots-only": () => server(false, 1),
} satisfies Previews;
