import { createCanvas, type Image } from "@napi-rs/canvas";
import { drawCircularImage, fillTextAnchored, rgb } from "#lib/imaging.js";
import { formatSpaced } from "../services/format.js";
import {
  TIER_COLORS,
  type Tier,
  type TierOrError,
} from "../services/score-table.js";
import { fillRoundedBox, font, PALETTE, registerFonts } from "./common.js";

const WIDTH = 800;
const HEIGHT = 710;
const HEADER_HEIGHT = 150;

const SUFFIX_COLOR = "rgb(215, 215, 215)";

const BREAKDOWN_TIERS: Tier[] = [
  "MYTHIC",
  "ANOMALY",
  "EPIC",
  "RARE",
  "UNCOMMON",
  "COMMON",
  "TRASH",
];

export interface ServerStatsRoll {
  number: number;
  score: number;
  tier: TierOrError;
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

export async function renderServerStats(
  data: ServerStatsImageData,
  labels: ServerStatsLabels
): Promise<Buffer> {
  registerFonts();

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "left";

  ctx.fillStyle = rgb(PALETTE.background);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = rgb(PALETTE.header);
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT + 1);

  drawCircularImage(ctx, data.icon, 40, 25, 100);

  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color: string
  ): void => {
    ctx.font = font(size);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    fillTextAnchored(ctx, value, x, y, "ascender");
  };

  text(labels.title, 170, 45, 45, rgb(PALETTE.text));

  const drawBox = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    value: string,
    options: {
      subtext?: string;
      tier?: TierOrError;
      suffix?: string;
      avatar?: Image | null;
    } = {}
  ): void => {
    const tierColor = options.tier ? TIER_COLORS[options.tier] : undefined;
    fillRoundedBox(ctx, x, y, w + 1, h + 1, tierColor);

    text(title, x + 20, y + 15, 22, rgb(PALETTE.title));

    if (options.avatar !== undefined) {
      drawCircularImage(ctx, options.avatar, x + w - 32 - 15, y + 10, 32);
    }

    text(value, x + 20, y + 45, 28, rgb(tierColor ?? PALETTE.text));

    if (options.suffix) {
      ctx.font = font(28);
      const valueWidth = ctx.measureText(`${value} `).width;
      text(options.suffix, x + 20 + valueWidth, y + 45, 28, SUFFIX_COLOR);
    }

    if (options.subtext) {
      text(options.subtext, x + 20, y + 80, 18, rgb(PALETTE.subtext));
    }
  };

  drawBox(40, 180, 345, 110, labels.bestRoll, formatSpaced(data.best.number), {
    subtext: labels.by(data.best.playerName),
    tier: data.best.tier,
    suffix: `(${formatSpaced(data.best.score)} EP)`,
    avatar: data.best.avatar,
  });
  drawBox(
    415,
    180,
    345,
    110,
    labels.worstRoll,
    formatSpaced(data.worst.number),
    {
      subtext: labels.by(data.worst.playerName),
      tier: data.worst.tier,
      suffix: `(${formatSpaced(data.worst.score)} EP)`,
      avatar: data.worst.avatar,
    }
  );

  const boxWidth = 226;
  drawBox(
    40,
    310,
    boxWidth,
    110,
    labels.totalRolls,
    formatSpaced(data.totalRolls)
  );
  drawBox(
    286,
    310,
    boxWidth,
    110,
    labels.averageScore,
    `${formatSpaced(data.averageScore)} EP`,
    { tier: data.averageTier }
  );
  drawBox(
    532,
    310,
    boxWidth,
    110,
    labels.overallScore,
    `${formatSpaced(data.overallScore)} EP`
  );

  fillRoundedBox(ctx, 40, 440, 721, 241);
  text(labels.tierBreakdown, 60, 455, 22, rgb(PALETTE.title));

  const columnX = [80, 440] as const;
  const startY = 500;

  BREAKDOWN_TIERS.forEach((tier, i) => {
    const color = rgb(TIER_COLORS[tier]);
    const x = columnX[i < 4 ? 0 : 1];
    const y = startY + 45 * (i < 4 ? i : i - 4);

    text(`${tier}:`, x, y, 22, color);

    const count = formatSpaced(data.tierCounts[tier] ?? 0);
    ctx.font = font(22);
    const countWidth = ctx.measureText(count).width;
    text(count, x + 220 - countWidth, y, 22, rgb(PALETTE.text));

    const leaders = (data.tierLeaders[tier] ?? []).slice(0, 3);
    for (let idx = leaders.length - 1; idx >= 0; idx--) {
      const avatarX = x + 235 + idx * 14;
      const avatarY = y - 1;
      ctx.beginPath();
      ctx.arc(avatarX + 12, avatarY + 12, 14, 0, Math.PI * 2);
      ctx.fillStyle = rgb(PALETTE.box);
      ctx.fill();
      drawCircularImage(ctx, leaders[idx] ?? null, avatarX, avatarY, 24);
    }
  });

  return canvas.encode("png");
}
