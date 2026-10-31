import { previewT, type Previews } from "#lib/preview.js";
import fr from "#modules/four-hour-game/i18n/fr.json" with { type: "json" };
import type { PlayerProfile } from "#modules/four-hour-game/services/four-hour-game.service.js";
import { renderProfileCard, type ProfilePlayer } from "./profile-card.js";

const t = await previewT("four-hour-game", fr);

// Made-up player: a display name at Discord's 32-character limit, with a ZWJ
// emoji sequence, a flag and accents, where the title is the likeliest to
// overflow or draw crossed squares.
const player: ProfilePlayer = {
  name: "👑✨ Maximilien-Édouard 🧑‍💻🐉🇫🇷",
  avatar: null,
};

const profile: PlayerProfile = {
  score: 12847,
  rank: 3,
  total: 128,
  monthPoints: 214,
  bestHoldSeconds: 11 * 3600 + 47 * 60,
  currentStreak: 12,
  bestStreak: 31,
  lastPointAt: new Date("2026-10-30T22:30:00Z"),
  dailyPoints: 1500,
  dailyRank: { rank: 1, total: 9 },
};

// A player with points from before the history was kept: no streak, no date.
const legacy: PlayerProfile = {
  ...profile,
  score: 37,
  rank: 0,
  monthPoints: 0,
  bestHoldSeconds: null,
  currentStreak: 0,
  bestStreak: 0,
  lastPointAt: null,
  dailyPoints: 0,
  dailyRank: null,
};

export default {
  profile: () => renderProfileCard(profile, player, t, "fr"),
  "without-history": () => renderProfileCard(legacy, player, t, "fr"),
} satisfies Previews;
