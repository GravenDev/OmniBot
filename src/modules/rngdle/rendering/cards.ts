import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { drawCircularImage, PALETTE, rgb } from "#lib/imaging.js";
import {
  drawPanel,
  drawPanelTitle,
  drawText,
  LABEL_SIZE,
  measureText,
  PANEL_PADDING,
  renderStatCard,
  type CardAside,
  type StatBox,
} from "#lib/stat-card.js";
import {
  TIER_COLORS,
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
const TIER_LABEL_WIDTH = 128;
const COUNT_WIDTH = 66;
const BAR_HEIGHT = 10;
const BAR_TRACK: [number, number, number] = [50, 50, 50];
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

function tierBreakdown(
  title: string,
  counts: Record<Tier, number>,
  leaders?: Record<Tier, (Image | null)[]>
): CardAside {
  return {
    width: leaders ? 420 : 350,
    draw(ctx, x, y, width, height) {
      drawPanel(ctx, x, y, width, height);
      drawPanelTitle(ctx, title, x, y);

      const max = Math.max(1, ...Object.values(counts));
      const step =
        (height - BREAKDOWN_TOP - BREAKDOWN_BOTTOM) / BREAKDOWN_TIERS.length;
      const labelX = x + PANEL_PADDING;
      const barX = labelX + TIER_LABEL_WIDTH;
      const countRight =
        x + width - PANEL_PADDING - (leaders ? LEADERS_WIDTH : 0);
      const barWidth = countRight - COUNT_WIDTH - barX;

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
        if (count > 0) {
          const filled = Math.max(BAR_HEIGHT, (count / max) * barWidth);
          ctx.beginPath();
          ctx.roundRect(barX, centerY - BAR_HEIGHT / 2, filled, BAR_HEIGHT, 5);
          ctx.fillStyle = rgb(TIER_COLORS[tier]);
          ctx.fill();
        }

        const text = formatSpaced(count);
        const countX = countRight - measureText(ctx, text, LABEL_SIZE);
        drawText(
          ctx,
          text,
          countX,
          centerY - LABEL_SIZE * 0.62,
          LABEL_SIZE,
          count > 0 ? PALETTE.text : PALETTE.subtext
        );
        if (leaders) {
          const tierLeaders = (leaders[tier] ?? []).slice(0, MAX_LEADERS);
          drawLeaders(ctx, tierLeaders, countRight + 12, centerY);
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
    aside: tierBreakdown(labels.tierBreakdown, data.tierCounts),
  });
}

export function renderServerStats(
  data: ServerStatsImageData,
  labels: ServerStatsLabels
): Promise<Buffer> {
  const rollBox = (title: string, roll: ServerStatsRoll): StatBox => ({
    ...scoreBox(title, roll.score, roll.tier),
    subtext: `${labels.by(roll.playerName)} · ${labels.roll(formatSpaced(roll.number))}`,
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
      data.tierCounts,
      data.tierLeaders
    ),
  });
}
