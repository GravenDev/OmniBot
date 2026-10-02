import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import {
  drawCircularImage,
  drawFittedText,
  fillTextAnchored,
  rgb,
} from "#lib/imaging.js";
import { formatCompact, formatSpaced } from "../services/format.js";
import {
  formatPercent,
  TIER_COLORS,
  type TierOrError,
} from "../services/score-table.js";
import {
  FONT,
  font,
  loadIcon,
  loadMedals,
  MONO_FONT,
  PALETTE,
  registerFonts,
} from "./common.js";

const MIN_WIDTH = 800;
const HEADER_HEIGHT = 100;
const ROW_HEIGHT = 90;
const FONT_SIZE = 30;
const AVATAR_SIZE = 60;
const MEDAL_SIZE = 50;
const ICON_SIZE = 40;

const RANK_X = 15;
const RANK_TEXT_X = 30;
const AVATAR_X = 100;
const PLAYER_X = 190;
const PLAYER_MAX_WIDTH = 320;
const COLUMN_X = [500, 650, 810] as const;
const COLUMN_WIDTHS = [140, 130, 180] as const;
const RIGHT_MARGIN = 20;
const WIDTH = Math.max(
  MIN_WIDTH,
  COLUMN_X[2] + COLUMN_WIDTHS[2] + RIGHT_MARGIN
);

export interface DailyLeaderboardRow {
  rank: number;
  name: string;
  avatar: Image | null;
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

function fittedWidth(
  ctx: SKRSContext2D,
  text: string,
  family: string,
  maxWidth: number
): number {
  let size = FONT_SIZE;
  ctx.font = font(size, family);
  while (size > 1 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = font(size, family);
  }
  return ctx.measureText(text).width;
}

export async function renderDailyLeaderboard(
  rows: DailyLeaderboardRow[],
  labels: DailyLeaderboardLabels
): Promise<Buffer> {
  registerFonts();
  const [medals, arrowUp, trash] = await Promise.all([
    loadMedals(),
    loadIcon("arrow_up"),
    loadIcon("trash"),
  ]);

  const canvas = createCanvas(WIDTH, HEADER_HEIGHT + rows.length * ROW_HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = rgb(PALETTE.background);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = rgb(PALETTE.header);
  ctx.fillRect(0, 0, canvas.width, HEADER_HEIGHT);

  const headerY = HEADER_HEIGHT / 2 - 15;
  ctx.font = font(FONT_SIZE);
  ctx.fillStyle = rgb(PALETTE.text);
  ctx.textAlign = "left";
  fillTextAnchored(ctx, labels.rank, RANK_X, headerY);
  fillTextAnchored(ctx, labels.player, PLAYER_X, headerY);
  ctx.textAlign = "right";
  [labels.number, labels.score, labels.placement].forEach((label, i) => {
    fillTextAnchored(ctx, label, COLUMN_X[i]! + COLUMN_WIDTHS[i]!, headerY);
  });

  rows.forEach((row, index) => {
    const top = HEADER_HEIGHT + index * ROW_HEIGHT;
    const textY = top + ROW_HEIGHT / 2 - 15;
    const tierColor = rgb(TIER_COLORS[row.tier]);

    ctx.fillStyle = rgb(index % 2 === 0 ? PALETTE.rowEven : PALETTE.rowOdd);
    ctx.fillRect(0, top, canvas.width, ROW_HEIGHT);

    const medal = medals[row.rank - 1];
    if (medal) {
      ctx.drawImage(
        medal,
        RANK_X,
        Math.trunc(textY - 10),
        MEDAL_SIZE,
        MEDAL_SIZE
      );
    } else {
      ctx.font = font(FONT_SIZE);
      ctx.fillStyle = rgb(PALETTE.text);
      ctx.textAlign = "left";
      fillTextAnchored(ctx, String(row.rank), RANK_TEXT_X, textY, "ascender");
    }

    drawCircularImage(ctx, row.avatar, AVATAR_X, top + 15, AVATAR_SIZE);

    drawFittedText(ctx, row.name, PLAYER_X, textY, {
      family: FONT,
      size: FONT_SIZE,
      maxWidth: PLAYER_MAX_WIDTH,
      color: rgb(PALETTE.text),
    });

    drawFittedText(
      ctx,
      formatSpaced(row.number).padStart(7),
      COLUMN_X[0] + COLUMN_WIDTHS[0],
      textY,
      {
        family: MONO_FONT,
        size: FONT_SIZE,
        maxWidth: COLUMN_WIDTHS[0],
        color: tierColor,
        align: "right",
      }
    );

    drawFittedText(
      ctx,
      formatCompact(row.score),
      COLUMN_X[1] + COLUMN_WIDTHS[1],
      textY,
      {
        family: FONT,
        size: FONT_SIZE,
        maxWidth: COLUMN_WIDTHS[1],
        color: rgb(PALETTE.text),
        align: "right",
      }
    );

    const placement = formatPercent(row.percent);
    const right = COLUMN_X[2] + COLUMN_WIDTHS[2];
    const textWidth = fittedWidth(ctx, placement, FONT, COLUMN_WIDTHS[2]);
    const icon = row.percent > 50 ? arrowUp : trash;
    ctx.drawImage(
      icon,
      Math.trunc(right - textWidth - 10 - ICON_SIZE),
      Math.trunc(textY - 10),
      ICON_SIZE,
      ICON_SIZE
    );
    drawFittedText(ctx, placement, right, textY, {
      family: FONT,
      size: FONT_SIZE,
      maxWidth: COLUMN_WIDTHS[2],
      color: tierColor,
      align: "right",
    });
  });

  return canvas.encode("png");
}
