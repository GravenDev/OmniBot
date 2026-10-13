import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "#modules/four-hour-game/i18n/en.json" with { type: "json" };
import fr from "#modules/four-hour-game/i18n/fr.json" with { type: "json" };
import type { PlayerProfile } from "#modules/four-hour-game/services/four-hour-game.service.js";
import { buildProfileCard, renderProfileCard } from "./profile-card.js";

const NAMESPACE = "four-hour-game";
const frT = createT("fr", NAMESPACE);
const enT = createT("en", NAMESPACE);

const profile: PlayerProfile = {
  score: 1234,
  rank: 4,
  total: 17,
  monthPoints: 12,
  bestHoldSeconds: 4 * 3600 + 12 * 60,
  currentStreak: 2,
  bestStreak: 5,
  lastPointAt: new Date("2026-10-03T22:30:00Z"),
};

const legacy: PlayerProfile = {
  ...profile,
  monthPoints: 0,
  bestHoldSeconds: null,
  currentStreak: 0,
  bestStreak: 0,
  lastPointAt: null,
};

const player = { name: "Alice", avatar: null };

beforeAll(async () => {
  await initTestI18n(NAMESPACE, { en, fr });
});

const cells = (card: ReturnType<typeof buildProfileCard>) =>
  card.rows.flat().map(({ title, value, subtext }) => ({
    title,
    value,
    subtext,
  }));

describe("buildProfileCard", () => {
  it("lays out the player's statistics in French", () => {
    const card = buildProfileCard(profile, player, frT, "fr");

    expect(card).toMatchObject({
      title: "Alice",
      subtitle: "Jeu des 4h",
      rank: { position: 4, total: 17 },
    });
    expect(cells(card)).toEqual([
      { title: "Points", value: "1 234", subtext: undefined },
      { title: "Ce mois-ci", value: "12", subtext: undefined },
      { title: "Meilleur temps tenu", value: "4 h 12 min", subtext: undefined },
      { title: "Série en cours", value: "2", subtext: "record : 5" },
      { title: "Dernier point", value: "3 oct. 2026", subtext: undefined },
    ]);
  });

  it("formats numbers and dates for English", () => {
    const card = buildProfileCard(profile, player, enT, "en");

    expect(cells(card).map((cell) => cell.value)).toEqual([
      "1,234",
      "12",
      "4h 12m",
      "2",
      "Oct 3, 2026",
    ]);
    expect(card.rows[1]?.[0]?.subtext).toBe("best: 5");
  });

  it("shows a dash for values the history cannot tell", () => {
    const card = buildProfileCard(legacy, player, frT, "fr");

    expect(cells(card)).toEqual([
      { title: "Points", value: "1 234", subtext: undefined },
      { title: "Ce mois-ci", value: "—", subtext: undefined },
      { title: "Meilleur temps tenu", value: "—", subtext: undefined },
      { title: "Série en cours", value: "—", subtext: undefined },
      { title: "Dernier point", value: "—", subtext: undefined },
    ]);
  });

  it("omits the rank when the player is not ranked", () => {
    const card = buildProfileCard({ ...profile, rank: 0 }, player, frT, "fr");

    expect(card.rank).toBeUndefined();
  });
});

describe("renderProfileCard", () => {
  it("renders a 1000px wide PNG", async () => {
    const png = await renderProfileCard(profile, player, frT, "fr");

    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1000);
  });
});
