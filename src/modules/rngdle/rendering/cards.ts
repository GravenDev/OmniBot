import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { drawCircularImage, PALETTE, rgb } from "#lib/imaging.js";
import {
  CARD_CONTENT_WIDTH,
  CARD_MARGIN,
  drawPanel,
  drawPanelTitle,
  drawText,
  LABEL_SIZE,
  measureText,
  renderStatCard,
  type CardSection,
  type StatBox,
} from "#lib/stat-card.js";
import {
  TIER_COLORS,
  TIERS,
  type Tier,
  type TierOrError,
} from "#modules/rngdle/services/scoring.js";
import { formatSpaced } from "./format.js";

const BREAKDOWN_HEIGHT = 240;
const BREAKDOWN_ROWS_Y = 60;
const BREAKDOWN_COLUMNS = [80, 440];
const BREAKDOWN_PER_COLUMN = 4;
const BREAKDOWN_TIERS = [...TIERS].reverse();
const COUNT_RIGHT = 220;
const LEADERS_X = 235;
const LEADER_SIZE = 24;
const LEADER_STEP = 14;
const LEADER_BORDER = 2;
const MAX_LEADERS = 3;

interface Roll {
  number: number;
  score: number;
  tier: TierOrError;
}

export interface ProfileRoll extends Roll {
  dateText: string;
}

export interface ProfileImageData {
  username: string;
  avatar: Image | null;
  serverRank: number;
  totalPlayers: number;
  best: ProfileRoll;
  worst: ProfileRoll;
  totalRolls: number;
  averageScore: number;
  averageTier: TierOrError;
  maxBadges: number;
  totalScore: number;
  tierCounts: Record<Tier, number>;
}

export interface ProfileLabels {
  bestRoll: string;
  worstRoll: string;
  date: (date: string) => string;
  totalRolls: string;
  averageScore: string;
  maxBadges: string;
  maxBadgesValue: (count: number) => string;
  overallScore: string;
  tierBreakdown: string;
}

export interface ServerStatsRoll extends Roll {
  playerName: string;
  avatar: Image | null;
}

export interface ServerStatsImageData {
  icon: Image | null;
  best: ServerStatsRoll;
  worst: ServerStatsRoll;
  totalRolls: number;
  averageScore: number;
  averageTier: TierOrError;
  overallScore: number;
  tierCounts: Record<Tier, number>;
  tierLeaders: Record<Tier, (Image | null)[]>;
}

export interface ServerStatsLabels {
  title: string;
  bestRoll: string;
  worstRoll: string;
  by: (name: string) => string;
  totalRolls: string;
  averageScore: string;
  overallScore: string;
  tierBreakdown: string;
}

function drawLeaders(
  ctx: SKRSContext2D,
  leaders: (Image | null)[],
  x: number,
  y: number
): void {
  const radius = LEADER_SIZE / 2;
  for (let index = leaders.length - 1; index >= 0; index--) {
    const left = x + index * LEADER_STEP;
    ctx.beginPath();
    ctx.arc(left + radius, y + radius, radius + LEADER_BORDER, 0, Math.PI * 2);
    ctx.fillStyle = rgb(PALETTE.box);
    ctx.fill();
    drawCircularImage(ctx, leaders[index] ?? null, left, y, LEADER_SIZE);
  }
}

function tierBreakdown(
  title: string,
  counts: Record<Tier, number>,
  rowStep: number,
  leaders?: Record<Tier, (Image | null)[]>
): CardSection {
  return {
    height: BREAKDOWN_HEIGHT,
    draw(ctx, top) {
      drawPanel(ctx, CARD_MARGIN, top, CARD_CONTENT_WIDTH, BREAKDOWN_HEIGHT);
      drawPanelTitle(ctx, title, CARD_MARGIN, top);
      BREAKDOWN_TIERS.forEach((tier, index) => {
        const x = BREAKDOWN_COLUMNS[Math.floor(index / BREAKDOWN_PER_COLUMN)]!;
        const y =
          top + BREAKDOWN_ROWS_Y + rowStep * (index % BREAKDOWN_PER_COLUMN);
        drawText(ctx, `${tier}:`, x, y, LABEL_SIZE, TIER_COLORS[tier]);
        const count = formatSpaced(counts[tier] ?? 0);
        const countX = x + COUNT_RIGHT - measureText(ctx, count, LABEL_SIZE);
        drawText(ctx, count, countX, y, LABEL_SIZE, PALETTE.text);
        if (leaders) {
          const tierLeaders = (leaders[tier] ?? []).slice(0, MAX_LEADERS);
          drawLeaders(ctx, tierLeaders, x + LEADERS_X, y - 1);
        }
      });
    },
  };
}

function ep(value: number): string {
  return `${formatSpaced(value)} EP`;
}

function rollBox(title: string, roll: Roll, subtext: string): StatBox {
  return {
    title,
    value: formatSpaced(roll.number),
    color: TIER_COLORS[roll.tier],
    suffix: `(${ep(roll.score)})`,
    subtext,
  };
}

export function renderProfile(
  data: ProfileImageData,
  labels: ProfileLabels
): Promise<Buffer> {
  return renderStatCard({
    image: data.avatar,
    title: { text: data.username, y: 35, size: 50 },
    rank: { position: data.serverRank, total: data.totalPlayers },
    valueSize: 30,
    rows: [
      [
        rollBox(labels.bestRoll, data.best, labels.date(data.best.dateText)),
        rollBox(labels.worstRoll, data.worst, labels.date(data.worst.dateText)),
      ],
      [
        { title: labels.totalRolls, value: formatSpaced(data.totalRolls) },
        {
          title: labels.averageScore,
          value: ep(data.averageScore),
          color: TIER_COLORS[data.averageTier],
        },
      ],
      [
        {
          title: labels.maxBadges,
          value: labels.maxBadgesValue(data.maxBadges),
        },
        { title: labels.overallScore, value: ep(data.totalScore) },
      ],
    ],
    footer: tierBreakdown(labels.tierBreakdown, data.tierCounts, 40),
  });
}

export function renderServerStats(
  data: ServerStatsImageData,
  labels: ServerStatsLabels
): Promise<Buffer> {
  const roll = (title: string, value: ServerStatsRoll): StatBox => ({
    ...rollBox(title, value, labels.by(value.playerName)),
    avatar: value.avatar,
  });
  return renderStatCard({
    image: data.icon,
    title: { text: labels.title, y: 45, size: 45 },
    valueSize: 28,
    rows: [
      [roll(labels.bestRoll, data.best), roll(labels.worstRoll, data.worst)],
      [
        { title: labels.totalRolls, value: formatSpaced(data.totalRolls) },
        {
          title: labels.averageScore,
          value: ep(data.averageScore),
          color: TIER_COLORS[data.averageTier],
        },
        { title: labels.overallScore, value: ep(data.overallScore) },
      ],
    ],
    footer: tierBreakdown(
      labels.tierBreakdown,
      data.tierCounts,
      45,
      data.tierLeaders
    ),
  });
}
