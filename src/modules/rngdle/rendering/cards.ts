import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { drawCircularImage, PALETTE, rgb } from "#lib/imaging.js";
import {
  drawPanel,
  drawPanelTitle,
  drawText,
  measureText,
  PANEL_PADDING,
  renderStatCard,
  type CardAside,
  type StatBox,
} from "#lib/stat-card.js";
import {
  TIER_COLORS,
  TIER_ODDS,
  TIERS,
  type Tier,
  type TierOrError,
} from "#modules/rngdle/services/scoring.js";
import { formatSpaced } from "./format.js";

const OUTLINED_TIERS = new Set<TierOrError>([
  "MYTHIC",
  "ANOMALY",
  "EPIC",
  "RARE",
  "TRASH",
]);
const BREAKDOWN_TIERS = [...TIERS].reverse();
const BREAKDOWN_TOP = 52;
const BREAKDOWN_BOTTOM = 18;
const TIER_LABEL_SIZE = 17;
const TIER_LABEL_WIDTH = 118;
const COUNT_SIZE = 17;
const COUNT_WIDTH = 50;
const EXPECTED_SIZE = 14;
const EXPECTED_WIDTH = 56;
const BAR_HEIGHT = 10;
const BAR_TRACK: [number, number, number] = [50, 50, 50];
const SHORTFALL_ALPHA = 0.45;
const MAX_DEVIATION = 2;
const PRIOR_DRAWS = 2;
const MARKER_WIDTH = 2;
const MARKER_OVERHANG = 4;
const LEGEND_SIZE = 14;
const LEGEND_Y = 20;
const LEGEND_GAP = 6;
const LEADER_SIZE = 22;
const LEADER_STEP = 14;
const LEADER_BORDER = 2;
const MAX_LEADERS = 3;
const LEADERS_WIDTH = LEADER_SIZE + (MAX_LEADERS - 1) * LEADER_STEP + 8;

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
  roll: (number: string) => string;
  totalRolls: string;
  averageScore: string;
  maxBadges: string;
  maxBadgesValue: (count: number) => string;
  overallScore: string;
  tierBreakdown: string;
  expected: string;
  expectedCount: (value: number) => string;
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
  roll: (number: string) => string;
  totalRolls: string;
  averageScore: string;
  overallScore: string;
  tierBreakdown: string;
  expected: string;
  expectedCount: (value: number) => string;
}

function ep(value: number): string {
  return `${formatSpaced(value)} EP`;
}

function scoreBox(title: string, score: number, tier: TierOrError): StatBox {
  return {
    title,
    value: ep(score),
    color: TIER_COLORS[tier],
    outline: OUTLINED_TIERS.has(tier),
  };
}

function drawLeaders(
  ctx: SKRSContext2D,
  leaders: (Image | null)[],
  x: number,
  centerY: number
): void {
  const radius = LEADER_SIZE / 2;
  const top = centerY - radius;
  for (let index = leaders.length - 1; index >= 0; index--) {
    const left = x + index * LEADER_STEP;
    ctx.beginPath();
    ctx.arc(left + radius, centerY, radius + LEADER_BORDER, 0, Math.PI * 2);
    ctx.fillStyle = rgb(PALETTE.box);
    ctx.fill();
    drawCircularImage(ctx, leaders[index] ?? null, left, top, LEADER_SIZE);
  }
}

function deviation(count: number, expected: number): number {
  const ratio = (count + PRIOR_DRAWS) / (expected + PRIOR_DRAWS);
  return Math.max(-1, Math.min(1, Math.log2(ratio) / MAX_DEVIATION));
}

function drawMarker(ctx: SKRSContext2D, x: number, centerY: number): void {
  const height = BAR_HEIGHT + MARKER_OVERHANG * 2;
  ctx.fillStyle = rgb(PALETTE.text);
  ctx.fillRect(
    x - MARKER_WIDTH / 2,
    centerY - height / 2,
    MARKER_WIDTH,
    height
  );
}

function tierBreakdown(
  title: string,
  expectedLabel: string,
  formatExpected: (value: number) => string,
  counts: Record<Tier, number>,
  leaders?: Record<Tier, (Image | null)[]>
): CardAside {
  return {
    width: leaders ? 460 : 390,
    draw(ctx, x, y, width, height) {
      drawPanel(ctx, x, y, width, height);
      drawPanelTitle(ctx, title, x, y);

      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      const step =
        (height - BREAKDOWN_TOP - BREAKDOWN_BOTTOM) / BREAKDOWN_TIERS.length;
      const labelX = x + PANEL_PADDING;
      const barX = labelX + TIER_LABEL_WIDTH;
      const expectedRight =
        x + width - PANEL_PADDING - (leaders ? LEADERS_WIDTH : 0);
      const valueRight = expectedRight - EXPECTED_WIDTH;
      const barWidth = valueRight - COUNT_WIDTH - barX;
      const half = barWidth / 2;
      const centerX = barX + half;

      if (total > 0) {
        const legendX =
          expectedRight - measureText(ctx, expectedLabel, LEGEND_SIZE);
        drawText(
          ctx,
          expectedLabel,
          legendX,
          y + LEGEND_Y,
          LEGEND_SIZE,
          PALETTE.subtext
        );
        ctx.fillStyle = rgb(PALETTE.subtext);
        ctx.fillRect(
          legendX - LEGEND_GAP - MARKER_WIDTH,
          y + LEGEND_Y,
          MARKER_WIDTH,
          LEGEND_SIZE
        );
      }

      BREAKDOWN_TIERS.forEach((tier, index) => {
        const count = counts[tier] ?? 0;
        const centerY = y + BREAKDOWN_TOP + step * (index + 0.5);
        const color = count > 0 ? TIER_COLORS[tier] : PALETTE.subtext;
        const labelTop = centerY - TIER_LABEL_SIZE * 0.62;
        drawText(ctx, tier, labelX, labelTop, TIER_LABEL_SIZE, color);

        ctx.beginPath();
        ctx.roundRect(barX, centerY - BAR_HEIGHT / 2, barWidth, BAR_HEIGHT, 5);
        ctx.fillStyle = rgb(BAR_TRACK);
        ctx.fill();

        const expected = total * TIER_ODDS[tier];
        if (total > 0) {
          const offset = deviation(count, expected) * half;
          if (offset !== 0) {
            ctx.globalAlpha = offset > 0 ? 1 : SHORTFALL_ALPHA;
            ctx.fillStyle = rgb(TIER_COLORS[tier]);
            ctx.fillRect(
              Math.min(centerX, centerX + offset),
              centerY - BAR_HEIGHT / 2,
              Math.abs(offset),
              BAR_HEIGHT
            );
            ctx.globalAlpha = 1;
          }

          const expectedText = formatExpected(expected);
          drawText(
            ctx,
            expectedText,
            expectedRight - measureText(ctx, expectedText, EXPECTED_SIZE),
            centerY - EXPECTED_SIZE * 0.62,
            EXPECTED_SIZE,
            PALETTE.subtext
          );
        }
        drawMarker(ctx, centerX, centerY);

        const text = formatSpaced(count);
        drawText(
          ctx,
          text,
          valueRight - measureText(ctx, text, COUNT_SIZE),
          centerY - COUNT_SIZE * 0.62,
          COUNT_SIZE,
          total > 0 && count > expected ? TIER_COLORS[tier] : PALETTE.subtext
        );

        if (leaders) {
          const tierLeaders = (leaders[tier] ?? []).slice(0, MAX_LEADERS);
          drawLeaders(ctx, tierLeaders, expectedRight + 12, centerY);
        }
      });
    },
  };
}

export function renderProfile(
  data: ProfileImageData,
  labels: ProfileLabels
): Promise<Buffer> {
  const rollBox = (title: string, roll: ProfileRoll): StatBox => ({
    ...scoreBox(title, roll.score, roll.tier),
    subtext: `${labels.roll(formatSpaced(roll.number))} · ${roll.dateText}`,
  });
  return renderStatCard({
    image: data.avatar,
    title: data.username,
    rank: { position: data.serverRank, total: data.totalPlayers },
    rows: [
      [
        rollBox(labels.bestRoll, data.best),
        rollBox(labels.worstRoll, data.worst),
      ],
      [
        scoreBox(labels.averageScore, data.averageScore, data.averageTier),
        { title: labels.overallScore, value: ep(data.totalScore) },
      ],
      [
        { title: labels.totalRolls, value: formatSpaced(data.totalRolls) },
        {
          title: labels.maxBadges,
          value: labels.maxBadgesValue(data.maxBadges),
        },
      ],
    ],
    aside: tierBreakdown(
      labels.tierBreakdown,
      labels.expected,
      labels.expectedCount,
      data.tierCounts
    ),
  });
}

export function renderServerStats(
  data: ServerStatsImageData,
  labels: ServerStatsLabels
): Promise<Buffer> {
  const rollBox = (title: string, roll: ServerStatsRoll): StatBox => ({
    ...scoreBox(title, roll.score, roll.tier),
    subtext: `${labels.roll(formatSpaced(roll.number))} · ${labels.by(roll.playerName)}`,
    avatar: roll.avatar,
  });
  return renderStatCard({
    image: data.icon,
    title: labels.title,
    rows: [
      [
        rollBox(labels.bestRoll, data.best),
        rollBox(labels.worstRoll, data.worst),
      ],
      [
        scoreBox(labels.averageScore, data.averageScore, data.averageTier),
        { title: labels.overallScore, value: ep(data.overallScore) },
      ],
      [{ title: labels.totalRolls, value: formatSpaced(data.totalRolls) }],
    ],
    aside: tierBreakdown(
      labels.tierBreakdown,
      labels.expected,
      labels.expectedCount,
      data.tierCounts,
      data.tierLeaders
    ),
  });
}
