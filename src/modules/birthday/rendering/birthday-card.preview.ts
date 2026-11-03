import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { renderCelebrationCard } from "#lib/celebration-card.js";
import type { Previews } from "#lib/preview.js";
import { previewT } from "#lib/preview.js";
import fr from "../i18n/fr.json" with { type: "json" };
import { birthdayCard } from "../services/announcements.js";

interface Celebrant {
  name: string;
  avatar: Image | null;
}

// Made-up members; their avatars are plain gradients drawn here (no network).
async function avatar(from: string, to: string): Promise<Image> {
  const ctx = createCanvas(256, 256).getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return loadImage(ctx.canvas.toBuffer("image/png"));
}

const members: Celebrant[] = [
  { name: "Camille", avatar: await avatar("#ff7eb3", "#7b61ff") },
  { name: "Yanis", avatar: await avatar("#43cea2", "#185a9d") },
  { name: "Léa", avatar: null },
  { name: "Nora", avatar: await avatar("#8e2de2", "#4a00e0") },
  { name: "Sacha", avatar: await avatar("#f7971e", "#ffd200") },
];
// At Discord's 32-character limit.
const longName: Celebrant = {
  name: "Maximilienne-Clémentine 🎉 Durand",
  avatar: null,
};

const t = await previewT("birthday", fr);
const today = { year: 2026, month: 11, day: 1 };

function render(celebrants: Celebrant[], template: string | null = null) {
  const card = birthdayCard(
    t,
    "fr",
    celebrants.map((celebrant) => celebrant.name),
    template,
    today
  );
  return Promise.resolve(
    renderCelebrationCard({
      ...card.card,
      avatars: celebrants.map((celebrant) => celebrant.avatar),
    })
  );
}

export default {
  single: () => render(members.slice(0, 1)),
  "custom-message": () =>
    render(
      members.slice(0, 1),
      "Toute l'équipe te souhaite une super journée, {user} !"
    ),
  // 160 characters: cut after two lines.
  "long-custom-message": () =>
    render(
      [longName],
      "Bon anniversaire {user} ! Toute la communauté te souhaite une excellente journée, pleine de surprises, de gâteaux et de bonne humeur, et une très belle année à venir."
    ),
  double: () => render(members.slice(0, 2)),
  triple: () => render(members.slice(0, 3)),
  many: () => render(members),
} satisfies Previews;
