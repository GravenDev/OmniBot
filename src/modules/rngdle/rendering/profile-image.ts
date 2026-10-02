import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import {
  drawCircularImage,
  fillTextAnchored,
  rgb,
  type Rgb,
} from "#lib/imaging.js";
import { formatSpaced } from "../services/format.js";
import {
  TIER_COLORS,
  type Tier,
  type TierOrError,
} from "../services/score-table.js";
import {
  PALETTE,
  fillRoundedBox,
  font,
  loadMedals,
  registerFonts,
} from "./common.js";

const WIDTH = 800;
const HEIGHT = 840;
const HEADER_HEIGHT = 150;

const RANK_COLOR: Rgb = [150, 150, 150];
const SUFFIX_COLOR: Rgb = [215, 215, 215];

const BREAKDOWN_TIERS: Tier[] = [
  "MYTHIC",
  "ANOMALY",
  "EPIC",
  "RARE",
  "UNCOMMON",
  "COMMON",
  "TRASH",
];

export interface ProfileRoll {
  number: number;
  score: number;
  tier: TierOrError;
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

interface BoxOptions {
  subtext?: string;
  outline?: Rgb;
  valueColor?: Rgb;
  scoreSuffix?: string;
}

function text(
  ctx: SKRSContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: Rgb
): void {
  ctx.font = font(size);
  ctx.fontKerning = "none";
  ctx.fillStyle = rgb(color);
  ctx.textAlign = "left";
  fillTextAnchored(ctx, value, x, y, "ascender");
}

function textWidth(ctx: SKRSContext2D, value: string, size: number): number {
  ctx.font = font(size);
  ctx.fontKerning = "none";
  return ctx.measureText(value).width;
}

function drawBox(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  title: string,
  value: string,
  { subtext, outline, valueColor = PALETTE.text, scoreSuffix }: BoxOptions = {}
): void {
  fillRoundedBox(ctx, x, y, 346, 111, outline);
  text(ctx, title, x + 20, y + 15, 22, PALETTE.title);
  text(ctx, value, x + 20, y + 45, 30, valueColor);
  if (scoreSuffix) {
    const valueWidth = textWidth(ctx, `${value} `, 30);
    text(ctx, scoreSuffix, x + 20 + valueWidth, y + 45, 30, SUFFIX_COLOR);
  }
  if (subtext) {
    text(ctx, subtext, x + 20, y + 80, 18, PALETTE.subtext);
  }
}

function drawRank(
  ctx: SKRSContext2D,
  rank: number,
  totalPlayers: number,
  medals: Image[]
): void {
  const totalText = ` / ${totalPlayers}`;
  const totalWidth = textWidth(ctx, totalText, 30);
  const medal = medals[rank - 1];
  if (medal) {
    const width = rank === 1 ? 90 : 93;
    ctx.drawImage(medal, Math.trunc(760 - totalWidth - width), 15, width, 90);
  } else {
    const rankText = `#${rank}`;
    const rankWidth = textWidth(ctx, rankText, 80);
    text(ctx, rankText, 760 - totalWidth - rankWidth, 25, 80, RANK_COLOR);
  }
  text(ctx, totalText, 760 - totalWidth, 70, 30, PALETTE.subtext);
}

function rollOptions(roll: ProfileRoll, labels: ProfileLabels): BoxOptions {
  const color = TIER_COLORS[roll.tier];
  return {
    subtext: labels.date(roll.dateText),
    outline: color,
    valueColor: color,
    scoreSuffix: `(${formatSpaced(roll.score)} EP)`,
  };
}

export async function renderProfile(
  data: ProfileImageData,
  labels: ProfileLabels
): Promise<Buffer> {
  registerFonts();
  const medals = await loadMedals();

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = rgb(PALETTE.background);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = rgb(PALETTE.header);
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT + 1);

  drawCircularImage(ctx, data.avatar, 40, 25, 100);

  text(ctx, data.username, 170, 35, 50, PALETTE.text);

  if (data.serverRank > 0) {
    drawRank(ctx, data.serverRank, data.totalPlayers, medals);
  }

  drawBox(
    ctx,
    40,
    180,
    labels.bestRoll,
    formatSpaced(data.best.number),
    rollOptions(data.best, labels)
  );
  drawBox(
    ctx,
    415,
    180,
    labels.worstRoll,
    formatSpaced(data.worst.number),
    rollOptions(data.worst, labels)
  );

  const averageColor = TIER_COLORS[data.averageTier];
  drawBox(ctx, 40, 310, labels.totalRolls, String(data.totalRolls));
  drawBox(
    ctx,
    415,
    310,
    labels.averageScore,
    `${formatSpaced(data.averageScore)} EP`,
    { outline: averageColor, valueColor: averageColor }
  );
  drawBox(
    ctx,
    40,
    440,
    labels.maxBadges,
    labels.maxBadgesValue(data.maxBadges)
  );
  drawBox(
    ctx,
    415,
    440,
    labels.overallScore,
    `${formatSpaced(data.totalScore)} EP`
  );

  ctx.beginPath();
  ctx.roundRect(40, 570, 721, 241, 12);
  ctx.fillStyle = rgb(PALETTE.box);
  ctx.fill();
  text(ctx, labels.tierBreakdown, 60, 585, 22, PALETTE.title);

  const columns = [80, 440];
  BREAKDOWN_TIERS.forEach((tier, index) => {
    const x = columns[index < 4 ? 0 : 1] as number;
    const y = 630 + 40 * (index < 4 ? index : index - 4);
    text(ctx, `${tier}:`, x, y, 22, TIER_COLORS[tier]);
    const count = formatSpaced(data.tierCounts[tier] ?? 0);
    text(ctx, count, x + 220 - textWidth(ctx, count, 22), y, 22, PALETTE.text);
  });

  return canvas.encode("png");
}
