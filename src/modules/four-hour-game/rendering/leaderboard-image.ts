import { createCanvas, type Image } from "@napi-rs/canvas";
import {
  drawCircularImage,
  drawFittedText,
  fillTextAnchored,
  loadAsset,
  registerFont,
  rgb,
  type Rgb,
} from "#lib/imaging.js";

const FONT_FAMILY = "Outfit";
const FONT_SIZE = 30;

const WIDTH = 800;
const HEADER_HEIGHT = 100;
const ROW_HEIGHT = 90;
const AVATAR_SIZE = 60;
const MEDAL_SIZE = 50;

const BACKGROUND: Rgb = [25, 25, 25];
const HEADER_BACKGROUND: Rgb = [50, 50, 50];
const ROW_EVEN: Rgb = [35, 35, 35];
const ROW_ODD: Rgb = [45, 45, 45];
const TEXT: Rgb = [255, 255, 255];

const RANK_X = 15;
const PLAYER_X = 190;
const SCORE_X = 650;
const PLAYER_MAX_WIDTH = 320;
const SCORE_MAX_WIDTH = 140;

const assets = new URL("../assets/", import.meta.url);

export interface LeaderboardRow {
  rank: number;
  name: string;
  score: number;
  avatar: Image | null;
}

export interface LeaderboardHeaders {
  rank: string;
  player: string;
  score: string;
}

export async function renderLeaderboard(
  rows: LeaderboardRow[],
  headers: LeaderboardHeaders
): Promise<Buffer> {
  registerFont(new URL("outfit.ttf", assets), FONT_FAMILY);
  const medals = await Promise.all(
    ["medal_gold.png", "medal_silver.png", "medal_bronze.png"].map((file) =>
      loadAsset(new URL(file, assets))
    )
  );

  const canvas = createCanvas(WIDTH, HEADER_HEIGHT + rows.length * ROW_HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = rgb(BACKGROUND);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = rgb(HEADER_BACKGROUND);
  ctx.fillRect(0, 0, canvas.width, HEADER_HEIGHT);

  const headerY = HEADER_HEIGHT / 2 - 15;
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.fillStyle = rgb(TEXT);
  ctx.textAlign = "left";
  fillTextAnchored(ctx, headers.rank, RANK_X, headerY);
  fillTextAnchored(ctx, headers.player, PLAYER_X, headerY);
  fillTextAnchored(ctx, headers.score, SCORE_X, headerY);

  rows.forEach((row, index) => {
    const top = HEADER_HEIGHT + index * ROW_HEIGHT;
    const textY = top + ROW_HEIGHT / 2 - 15;

    ctx.fillStyle = rgb(index % 2 === 0 ? ROW_EVEN : ROW_ODD);
    ctx.fillRect(0, top, canvas.width, ROW_HEIGHT);

    const medal = medals[row.rank - 1];
    if (medal) {
      ctx.drawImage(medal, RANK_X, textY - 10, MEDAL_SIZE, MEDAL_SIZE);
    } else {
      ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
      ctx.fillStyle = rgb(TEXT);
      ctx.textAlign = "left";
      fillTextAnchored(ctx, String(row.rank), 30, textY, "ascender");
    }

    drawCircularImage(ctx, row.avatar, 100, top + 15, AVATAR_SIZE);

    const text = { family: FONT_FAMILY, size: FONT_SIZE, color: rgb(TEXT) };
    drawFittedText(ctx, row.name, PLAYER_X, textY, {
      ...text,
      maxWidth: PLAYER_MAX_WIDTH,
    });
    drawFittedText(ctx, String(row.score), SCORE_X, textY, {
      ...text,
      maxWidth: SCORE_MAX_WIDTH,
    });
  });

  return canvas.encode("png");
}
