import { describe, expect, it } from "vitest";
import {
  renderDailyLeaderboard,
  renderOverallLeaderboard,
  type DailyLeaderboardData,
  type DailyRow,
  type OverallLeaderboardData,
  type RankingRow,
} from "./leaderboards.js";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngSize(png: Buffer) {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const LONG_NAME = "A very very long player name that must be shrunk to fit";
const SUMMARY_BOTTOM = 160 + 110 + 20;
const table = (rows: number) => 52 + rows * 58 + 12;

describe("renderDailyLeaderboard", () => {
  const labels = {
    locale: "fr",
    rank: "Rang",
    title: "Classement du jour",
    averageScore: "Score moyen",
    players: "Joueurs",
    worstRoll: "Pire tirage",
    previous: (value: string) => `la veille : ${value}`,
    rollCount: (count: number) => `sur ${count} tirages`,
    worstBy: (name: string, percent: number) => `par ${name} · ${percent}`,
    player: "Pseudo",
    number: "Tirage",
    score: "Score",
    delta: "vs veille",
    placement: "Placement",
    newPlayer: "nouveau",
  };
  const rows: DailyRow[] = (["MYTHIC", "EPIC", "COMMON", "ERROR"] as const).map(
    (tier, index) => ({
      rank: index + 1,
      name: index === 1 ? LONG_NAME : `Player ${index}`,
      avatar: null,
      number: 1234567 * index,
      score: 999_999 * index,
      percent: 99.9 - index * 30,
      tier,
      delta: [null, 0, 31_400_000, -5_600][index]!,
    })
  );
  const data = (
    overrides: Partial<DailyLeaderboardData> = {}
  ): DailyLeaderboardData => ({
    icon: null,
    subtitle: "RNGdle · mardi 14 octobre",
    rows,
    average: { score: 12_988, tier: "COMMON", rolls: 4, previous: 11_012 },
    players: { count: 4, previous: 6 },
    worst: { name: "Z3ld4", avatar: null, score: 2_400, percent: 4 },
    ...overrides,
  });

  it("renders the summary then one 58px row per roll, 900px wide", async () => {
    const png = await renderDailyLeaderboard(data(), labels);

    expect(pngSize(png)).toEqual({
      width: 900,
      height: SUMMARY_BOTTOM + table(4) + 30,
    });
  });

  it("renders without a previous day nor a worst roll", async () => {
    const png = await renderDailyLeaderboard(
      data({
        rows: rows.slice(0, 1),
        average: { score: 5, tier: "TRASH", rolls: 1, previous: null },
        players: { count: 1, previous: null },
        worst: null,
      }),
      labels
    );

    expect(pngSize(png)).toEqual({
      width: 900,
      height: SUMMARY_BOTTOM + table(1) + 30,
    });
  });
});

describe("renderOverallLeaderboard", () => {
  const labels = {
    locale: "fr",
    rank: "Rang",
    player: "Pseudo",
    title: "Classement général",
    players: "Joueurs",
    rolls: "Tirages",
    averageScore: "Score moyen",
    perRoll: "par tirage",
    ranking: "Classement",
    rollCount: "Tirages",
    total: "Total",
    index: "Indice",
    indexNote: "Indice = score total ÷ (tirages + 20)",
    bestRoll: "Meilleur tirage",
    number: "Tirage",
    score: "Score",
  };
  const ranking: RankingRow[] = [999, 1_500, 2_000_000, 1_234_567_890].map(
    (total, index) => ({
      rank: index + 1,
      name: index === 3 ? LONG_NAME : `Player ${index}`,
      avatar: null,
      rolls: index * 40 + 1,
      total,
      index: total / (index * 40 + 21),
    })
  );
  const caller: RankingRow = {
    rank: 14,
    name: "Me",
    avatar: null,
    rolls: 3,
    total: 42,
    index: 1.75,
  };
  const data = (
    shown: RankingRow[],
    extra?: RankingRow
  ): OverallLeaderboardData => ({
    icon: null,
    subtitle: "RNGdle · depuis toujours",
    players: 17,
    rolls: 1284,
    average: { score: 193_420, tier: "UNCOMMON" },
    ranking: shown,
    caller: extra,
    bestRolls: shown.map((row, index) => ({
      rank: row.rank,
      name: row.name,
      avatar: null,
      number: 9_998_120 - index,
      score: row.total,
      tier: "MYTHIC",
    })),
  });
  // The tables' titles inside their panels, the index note below.
  const footer = (rows: number, extra: boolean) =>
    38 + table(rows) + (extra ? 14 + 58 : 0) + 34;

  it.each([
    ["without caller", ranking, undefined, footer(4, false)],
    ["with a caller row", ranking, caller, footer(4, true)],
    ["for an empty page", [], undefined, footer(0, false)],
    ["for a podium caller alone", [], { ...caller, rank: 2 }, footer(0, true)],
  ])("renders %s", async (_, shown, extra, footerHeight) => {
    const png = await renderOverallLeaderboard(data(shown, extra), labels);

    expect(pngSize(png)).toEqual({
      width: 1200,
      height: SUMMARY_BOTTOM + footerHeight + 30,
    });
  });
});
