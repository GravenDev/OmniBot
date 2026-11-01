import { previewT, type Previews } from "#lib/preview.js";
import fr from "#modules/four-hour-game/i18n/fr.json" with { type: "json" };
import {
  renderLeaderboard,
  type LeaderboardLabels,
  type LeaderboardRow,
} from "./leaderboard-image.js";

const t = await previewT("four-hour-game", fr);

const labels: LeaderboardLabels = {
  locale: "fr",
  title: t("leaderboard.title"),
  subtitle: t("leaderboard.subtitle"),
  rank: t("leaderboard.header.rank"),
  player: t("leaderboard.header.player"),
  score: t("leaderboard.header.score"),
};

// Made-up players, from 1st to 20th; the member who asks is 17th.
const NAMES = [
  "Lolo",
  "👑✨ Maximilien-Édouard 🧑‍💻🐉🇫🇷",
  "Toasty Cat",
  "Nyx",
  "Bérénice",
  "kévin_du_92",
  "Mega",
  "Pierrot",
  "Zoé 🌙",
  "Arthur",
  "Mélusine",
  "dev404",
  "Sacha",
  "Hugo",
  "Inès",
  "Raphaël",
  "Moi",
  "Léna",
  "Yanis",
  "Clara",
];

const rows: LeaderboardRow[] = NAMES.map((name, index) => ({
  rank: index + 1,
  name,
  avatar: null,
  score: Math.round(4200 / (index + 1)),
}));

const caller = rows[16];

export default {
  "page-1": () =>
    renderLeaderboard(
      { icon: null, rows: rows.slice(0, 10), callerRank: 17, caller },
      labels
    ),
  "page-2": () =>
    renderLeaderboard(
      { icon: null, rows: rows.slice(10, 20), callerRank: 17 },
      labels
    ),
} satisfies Previews;
