import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import {
  drawCircularImage,
  drawFittedText,
  fillTextAnchored,
  rgb,
} from "#lib/imaging.js";
import { formatShort } from "../services/format.js";
import { FONT, font, loadMedals, PALETTE, registerFonts } from "./common.js";

const WIDTH = 800;
const ROW_HEIGHT = 90;
const HEADER_HEIGHT = 100;
const GAP = 20;
const FONT_SIZE = 30;
const AVATAR_SIZE = 60;
const MEDAL_SIZE = 50;
const NAME_MAX_WIDTH = 320;
const SCORE_MAX_WIDTH = 250;
const SCORE_COLOR = rgb([251, 251, 251]);
const SEPARATOR_COLOR = rgb([80, 80, 80]);

export interface OverallRow {
  rank: number;
  name: string;
  avatar: Image | null;
  totalScore: number;
}

export interface OverallLabels {
  rank: string;
  player: string;
  overallScore: string;
}

function drawRow(
  ctx: SKRSContext2D,
  medals: Image[],
  row: OverallRow,
  top: number,
  color: string,
  locale: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, top, WIDTH, ROW_HEIGHT + 1);

  const textY = top + ROW_HEIGHT / 2 - 15;
  const medal = medals[row.rank - 1];
  if (medal) {
    ctx.drawImage(medal, 15, Math.trunc(textY - 10), MEDAL_SIZE, MEDAL_SIZE);
  } else {
    ctx.font = font(FONT_SIZE);
    ctx.fillStyle = rgb(PALETTE.text);
    ctx.textAlign = "left";
    fillTextAnchored(ctx, String(row.rank), 30, textY, "ascender");
  }

  drawCircularImage(ctx, row.avatar, 100, top + 15, AVATAR_SIZE);

  drawFittedText(ctx, row.name, 190, textY, {
    family: FONT,
    size: FONT_SIZE,
    maxWidth: NAME_MAX_WIDTH,
    color: rgb(PALETTE.text),
  });
  drawFittedText(ctx, `${formatShort(row.totalScore, locale)} EP`, 770, textY, {
    family: FONT,
    size: FONT_SIZE,
    maxWidth: SCORE_MAX_WIDTH,
    color: SCORE_COLOR,
    align: "right",
  });
}

export async function renderOverallLeaderboard(
  rows: OverallRow[],
  labels: OverallLabels,
  locale: string,
  caller?: OverallRow
): Promise<Buffer> {
  registerFonts();
  const medals = await loadMedals();

  const height =
    HEADER_HEIGHT + rows.length * ROW_HEIGHT + (caller ? ROW_HEIGHT + GAP : 0);
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = rgb(PALETTE.background);
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = rgb(PALETTE.header);
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT + 1);

  const headerY = HEADER_HEIGHT / 2 - 15;
  ctx.font = font(FONT_SIZE);
  ctx.fillStyle = rgb(PALETTE.text);
  ctx.textAlign = "left";
  fillTextAnchored(ctx, labels.rank, 15, headerY);
  fillTextAnchored(ctx, labels.player, 190, headerY);
  ctx.textAlign = "right";
  fillTextAnchored(ctx, labels.overallScore, 770, headerY);

  rows.forEach((row, index) => {
    const color = rgb(index % 2 === 0 ? PALETTE.rowEven : PALETTE.rowOdd);
    drawRow(
      ctx,
      medals,
      row,
      HEADER_HEIGHT + index * ROW_HEIGHT,
      color,
      locale
    );
  });

  if (caller) {
    const baseY = HEADER_HEIGHT + rows.length * ROW_HEIGHT;
    const lineY = baseY + GAP / 2;
    ctx.fillStyle = SEPARATOR_COLOR;
    ctx.fillRect(0, lineY, WIDTH, 2);
    drawRow(ctx, medals, caller, baseY + GAP, rgb(PALETTE.rowEven), locale);
  }

  return canvas.encode("png");
}
