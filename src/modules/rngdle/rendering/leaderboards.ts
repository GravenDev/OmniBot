import type { Image } from "@napi-rs/canvas";
import { loadMedals, PALETTE } from "#lib/imaging.js";
import {
  drawText,
  GAP,
  PANEL_PADDING,
  renderStatCard,
  type StatBox,
  type Trend,
} from "#lib/stat-card.js";
import {
  TIER_COLORS,
  type TierOrError,
} from "#modules/rngdle/services/scoring.js";
import {
  formatCompact,
  formatEp,
  formatIndex,
  formatSpaced,
} from "./format.js";
import {
  drawCellText,
  drawDelta,
  drawPlacement,
  drawRollNumber,
  drawTable,
  formatDelta,
  loadPlacementIcons,
  playerColumn,
  tableHeight,
  type RankedPlayer,
} from "./table.js";
import { ACCENT } from "./theme.js";

const DAILY_WIDTH = 900;
const OVERALL_WIDTH = 1200;
const RANKING_WIDTH = 590;
const NOTE_GAP = 10;
const NOTE_SIZE = 17;
const NOTE_HEIGHT = 34;

export interface DailyRow extends RankedPlayer {
  number: number;
  score: number;
  percent: number;
  tier: TierOrError;
  delta: number | null;
}

export interface DailyLeaderboardData {
  icon: Image | null;
  subtitle: string;
  rows: DailyRow[];
  average: {
    score: number;
    tier: TierOrError;
    rolls: number;
    previous: number | null;
  };
  players: { count: number; previous: number | null };
  worst: {
    name: string;
    avatar: Image | null;
    score: number;
    percent: number;
  } | null;
}

export interface DailyLeaderboardLabels {
  title: string;
  averageScore: string;
  players: string;
  worstRoll: string;
  previous: (value: string) => string;
  rollCount: (count: number) => string;
  worstBy: (name: string, percent: number) => string;
  player: string;
  number: string;
  score: string;
  delta: string;
  placement: string;
  newPlayer: string;
}

export interface RankingRow extends RankedPlayer {
  rolls: number;
  total: number;
  index: number;
}

export interface BestRollRow extends RankedPlayer {
  number: number;
  score: number;
  tier: TierOrError;
}

export interface OverallLeaderboardData {
  icon: Image | null;
  subtitle: string;
  players: number;
  rolls: number;
  average: { score: number; tier: TierOrError };
  ranking: RankingRow[];
  caller?: RankingRow | undefined;
  bestRolls: BestRollRow[];
}

export interface OverallLeaderboardLabels {
  title: string;
  players: string;
  rolls: string;
  averageScore: string;
  perRoll: string;
  ranking: string;
  rollCount: string;
  total: string;
  index: string;
  indexNote: string;
  bestRoll: string;
  number: string;
  score: string;
}

function trend(current: number, previous: number | null): Trend | undefined {
  if (previous === null || current === previous) {
    return undefined;
  }
  return {
    text: formatDelta(current - previous),
    direction: current > previous ? "up" : "down",
  };
}

export async function renderDailyLeaderboard(
  data: DailyLeaderboardData,
  labels: DailyLeaderboardLabels
): Promise<Buffer> {
  const [medals, icons] = await Promise.all([
    loadMedals(),
    loadPlacementIcons(),
  ]);
  const { average, players, worst } = data;
  const boxes: StatBox[] = [
    {
      title: labels.averageScore,
      value: formatEp(average.score),
      color: TIER_COLORS[average.tier],
      highlight: false,
      trend: trend(average.score, average.previous),
      subtext:
        average.previous === null
          ? labels.rollCount(average.rolls)
          : labels.previous(formatSpaced(average.previous)),
    },
    {
      title: labels.players,
      value: formatSpaced(players.count),
      trend: trend(players.count, players.previous),
      ...(players.previous !== null && {
        subtext: labels.previous(formatSpaced(players.previous)),
      }),
    },
  ];
  if (worst) {
    boxes.push({
      title: labels.worstRoll,
      value: `${formatCompact(worst.score)} EP`,
      color: TIER_COLORS.TRASH,
      subtext: labels.worstBy(worst.name, worst.percent),
      avatar: worst.avatar,
    });
  }

  return renderStatCard({
    accent: ACCENT,
    width: DAILY_WIDTH,
    image: data.icon,
    title: labels.title,
    subtitle: data.subtitle,
    rows: [boxes],
    footer: {
      height: tableHeight(data.rows.length),
      draw(ctx, x, y, width) {
        const right = width - PANEL_PADDING;
        drawTable<DailyRow>(ctx, x, y, width, {
          rows: data.rows,
          columns: [
            playerColumn(labels.player, 180, medals),
            {
              header: labels.number,
              x: 320,
              draw: (c, row, cx, cy) =>
                drawRollNumber(c, row.number, row.tier, cx, cy),
            },
            {
              header: labels.score,
              x: 550,
              align: "right",
              draw: (c, row, cx, cy) =>
                drawCellText(c, formatCompact(row.score), cx, cy, {
                  align: "right",
                }),
            },
            {
              header: labels.delta,
              x: 670,
              align: "right",
              draw: (c, row, cx, cy) =>
                drawDelta(c, row.delta, cx, cy, labels.newPlayer),
            },
            {
              header: labels.placement,
              x: right,
              align: "right",
              draw: (c, row, cx, cy) =>
                drawPlacement(c, row.percent, row.tier, cx, cy, icons),
            },
          ],
        });
      },
    },
  });
}

export async function renderOverallLeaderboard(
  data: OverallLeaderboardData,
  labels: OverallLeaderboardLabels
): Promise<Buffer> {
  const medals = await loadMedals();
  const rankingHeight = tableHeight(
    data.ranking.length,
    data.caller !== undefined
  );

  return renderStatCard({
    accent: ACCENT,
    width: OVERALL_WIDTH,
    image: data.icon,
    title: labels.title,
    subtitle: data.subtitle,
    rows: [
      [
        { title: labels.players, value: formatSpaced(data.players) },
        { title: labels.rolls, value: formatSpaced(data.rolls) },
        {
          title: labels.averageScore,
          value: formatEp(data.average.score),
          color: TIER_COLORS[data.average.tier],
          subtext: labels.perRoll,
        },
      ],
    ],
    footer: {
      height: rankingHeight + NOTE_HEIGHT,
      draw(ctx, x, y, width) {
        const bestWidth = width - RANKING_WIDTH - GAP;
        drawTable<RankingRow>(ctx, x, y, RANKING_WIDTH, {
          rows: data.ranking,
          extra: data.caller,
          extraAccent: ACCENT,
          columns: [
            playerColumn(labels.ranking, 160, medals),
            {
              header: labels.rollCount,
              x: 320,
              align: "right",
              draw: (c, row, cx, cy) =>
                drawCellText(c, formatSpaced(row.rolls), cx, cy, {
                  align: "right",
                  color: PALETTE.subtext,
                }),
            },
            {
              header: labels.total,
              x: 440,
              align: "right",
              draw: (c, row, cx, cy) =>
                drawCellText(c, formatCompact(row.total), cx, cy, {
                  align: "right",
                  color: PALETTE.subtext,
                }),
            },
            {
              header: labels.index,
              x: RANKING_WIDTH - PANEL_PADDING,
              align: "right",
              draw: (c, row, cx, cy) =>
                drawCellText(c, formatIndex(row.index), cx, cy, {
                  align: "right",
                  color: ACCENT,
                }),
            },
          ],
        });
        drawTable<BestRollRow>(ctx, x + RANKING_WIDTH + GAP, y, bestWidth, {
          rows: data.bestRolls,
          columns: [
            playerColumn(labels.bestRoll, 140, medals),
            {
              header: labels.number,
              x: 270,
              draw: (c, row, cx, cy) =>
                drawRollNumber(c, row.number, row.tier, cx, cy),
            },
            {
              header: labels.score,
              x: bestWidth - PANEL_PADDING,
              align: "right",
              draw: (c, row, cx, cy) =>
                drawCellText(c, formatCompact(row.score), cx, cy, {
                  align: "right",
                  color: TIER_COLORS[row.tier],
                }),
            },
          ],
        });
        ctx.textAlign = "left";
        drawText(
          ctx,
          labels.indexNote,
          x + 4,
          y + rankingHeight + NOTE_GAP,
          NOTE_SIZE,
          PALETTE.subtext
        );
      },
    },
  });
}
