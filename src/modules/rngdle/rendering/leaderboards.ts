import { loadAsset, registerFont, type Rgb } from "#lib/imaging.js";
import {
  renderLeaderboardTable,
  type LeaderboardEntry,
} from "#lib/leaderboard-table.js";
import {
  formatPercent,
  TIER_COLORS,
  type TierOrError,
} from "#modules/rngdle/services/scoring.js";
import { formatCompact, formatShort, formatSpaced } from "./format.js";

const ASSETS = new URL("../assets/", import.meta.url);
const MONO_FONT = "SpaceMonoBold";
const DAILY_WIDTH = 1010;
const OVERALL_SCORE_COLOR: Rgb = [251, 251, 251];

const loadIcon = (name: string) => loadAsset(new URL(`${name}.png`, ASSETS));

export interface DailyLeaderboardRow extends LeaderboardEntry {
  number: number;
  score: number;
  percent: number;
  tier: TierOrError;
}

export interface DailyLeaderboardLabels {
  rank: string;
  player: string;
  number: string;
  score: string;
  placement: string;
}

export interface OverallRow extends LeaderboardEntry {
  totalScore: number;
}

export interface OverallLabels {
  rank: string;
  player: string;
  overallScore: string;
}

export async function renderDailyLeaderboard(
  rows: DailyLeaderboardRow[],
  labels: DailyLeaderboardLabels
): Promise<Buffer> {
  registerFont(new URL("spacemono_bold.ttf", ASSETS), MONO_FONT);
  const [arrowUp, trash] = await Promise.all([
    loadIcon("arrow_up"),
    loadIcon("trash"),
  ]);
  return renderLeaderboardTable({
    headers: labels,
    rows,
    width: DAILY_WIDTH,
    columns: [
      {
        header: labels.number,
        x: 640,
        maxWidth: 140,
        align: "right",
        cell: (row) => ({
          text: formatSpaced(row.number).padStart(7),
          color: TIER_COLORS[row.tier],
          family: MONO_FONT,
        }),
      },
      {
        header: labels.score,
        x: 780,
        maxWidth: 130,
        align: "right",
        cell: (row) => ({ text: formatCompact(row.score) }),
      },
      {
        header: labels.placement,
        x: 990,
        maxWidth: 180,
        align: "right",
        cell: (row) => ({
          text: formatPercent(row.percent),
          color: TIER_COLORS[row.tier],
          icon: row.percent > 50 ? arrowUp : trash,
        }),
      },
    ],
  });
}

export function renderOverallLeaderboard(
  rows: OverallRow[],
  labels: OverallLabels,
  locale: string,
  caller?: OverallRow
): Promise<Buffer> {
  return renderLeaderboardTable({
    headers: labels,
    rows,
    caller,
    columns: [
      {
        header: labels.overallScore,
        x: 770,
        maxWidth: 250,
        align: "right",
        cell: (row) => ({
          text: `${formatShort(row.totalScore, locale)} EP`,
          color: OVERALL_SCORE_COLOR,
        }),
      },
    ],
  });
}
