import { fileURLToPath } from "node:url";
import {
  createCanvas,
  type Image,
  loadImage,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import type { Square } from "chessops";
import { makeFen } from "chessops/fen";
import sharp from "sharp";
import type { Classification } from "wintrchess/classify";
import { ratingAsset } from "../ratings.js";
import type { ParsedGame } from "../types.js";

// The board frame comes from the module's own assets, which are 1088 wide with
// a 32 coordinate border and 128 squares. The image is rendered at 1024 px:
// Discord shows it a few hundred pixels wide, and a 4096 px board took ~360 ms
// of CPU per render, for every navigation click and every live move. All
// geometry is that frame's, scaled.
const SOURCE_SIZE = 1088;
const BOARD_SIZE = 1024;
const SCALE = BOARD_SIZE / SOURCE_SIZE;
export const COORD = 32 * SCALE;
export const SQUARE = 128 * SCALE;
// The raster cache wants integer sizes: one pixel of deviation per piece,
// absorbed by the rounded draw rectangles below.
const PIECE_SIZE = Math.round(SQUARE);
export const BADGE = Math.round(SQUARE * 0.375);
const BADGE_OFFSET = 0.25;
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const BOARD_BORDER = "#302E2B";
const HIGHLIGHT = "rgba(255, 235, 59, 0.45)";

const BOARD_PNG = new URL("../assets/board/board.png", import.meta.url);
const PIECES = new URL("../assets/pieces/", import.meta.url);
const RATINGS = new URL("../assets/ratings/", import.meta.url);

const rasterCache = new Map<string, Promise<Image>>();

/**
 * The PNG assets are 8192²: decoding one straight would take ~256 MB. sharp
 * resamples each to the exact drawing size once, and the small bitmap is
 * cached for the lifetime of the process.
 */
function raster(url: URL, size: number): Promise<Image> {
  const key = `${url.href}@${size}`;
  let image = rasterCache.get(key);
  if (!image) {
    image = sharp(fileURLToPath(url))
      .resize(size, size)
      .png()
      .toBuffer()
      .then((buffer) => loadImage(buffer));
    rasterCache.set(key, image);
    image.catch(() => rasterCache.delete(key));
  }
  return image;
}

export interface BoardSquare {
  x: number;
  y: number;
  file: number;
  rank: number;
}

/**
 * Pixels of one chessops square, relative to the board image. A flipped board
 * rotates the squares, not the pieces: this keeps ranks, files and every glyph
 * readable.
 */
export function boardSquare(
  square: Square,
  flipped = false,
  offsetY = 0
): BoardSquare {
  const file = square % 8;
  const rank = Math.floor(square / 8);
  return {
    x: COORD + (flipped ? 7 - file : file) * SQUARE,
    y: offsetY + COORD + (flipped ? rank : 7 - rank) * SQUARE,
    file,
    rank,
  };
}

export interface FenPiece {
  key: string;
  square: Square;
}

/** The FEN board part, rank 8 first, as chessops square indices. */
export function piecesFromFen(fen: string): FenPiece[] {
  const pieces: FenPiece[] = [];
  const ranks = (fen.split(" ")[0] ?? START_FEN).split("/");
  for (const [row, rank] of ranks.entries()) {
    if (rank === undefined) continue;
    let file = 0;
    for (const char of rank) {
      if (/\d/.test(char)) {
        file += Number(char);
        continue;
      }
      const upper = char.toUpperCase();
      pieces.push({
        key: `${char === upper ? "w" : "b"}${upper}`,
        square: ((7 - row) * 8 + file) as Square,
      });
      file++;
    }
  }
  return pieces;
}

export interface BadgePosition {
  x: number;
  y: number;
}

/**
 * Badge placement: anchored to the top-right corner of the square, then pushed
 * a quarter of its size inside the square so it reads as an overlay on the
 * corner, not hanging off the board.
 */
export function ratingBadgePosition(
  square: Square,
  flipped = false,
  offsetY = 0,
  size = BADGE
): BadgePosition {
  const inset = Math.round(size * BADGE_OFFSET);
  const { x, y } = boardSquare(square, flipped, offsetY);
  return { x: x + SQUARE - size + inset, y: y - inset };
}

function drawHighlights(
  ctx: SKRSContext2D,
  flipped: boolean,
  last?: { from: Square; to: Square }
): void {
  if (!last) return;
  ctx.fillStyle = HIGHLIGHT;
  for (const square of [last.from, last.to]) {
    const { x, y } = boardSquare(square, flipped);
    // Rounded to the same pixel grid as the pieces: no half-pixel seam of
    // translucent yellow leaking into the neighbour squares.
    ctx.fillRect(
      Math.round(x),
      Math.round(y),
      Math.round(x + SQUARE) - Math.round(x),
      Math.round(y + SQUARE) - Math.round(y)
    );
  }
}

/**
 * The board.png frame keeps its own borders and coordinates; only the pieces,
 * highlights and badges are drawn on top. A flipped board rotates the frame —
 * its side labels are designed to face the player, so turning the whole frame
 * around is exactly the opponent's view.
 */
async function drawFrame(ctx: SKRSContext2D, flipped: boolean): Promise<void> {
  const background = await raster(BOARD_PNG, BOARD_SIZE);
  if (!flipped) {
    ctx.drawImage(background, 0, 0, BOARD_SIZE, BOARD_SIZE);
    return;
  }
  ctx.save();
  ctx.translate(BOARD_SIZE / 2, BOARD_SIZE / 2);
  ctx.rotate(Math.PI);
  ctx.drawImage(
    background,
    -BOARD_SIZE / 2,
    -BOARD_SIZE / 2,
    BOARD_SIZE,
    BOARD_SIZE
  );
  ctx.restore();
}

/**
 * The last two border strips are repainted with the frame colour before the
 * badge goes on: a badge on the last rank or the h-file then overlaps a plain
 * border instead of the coordinate labels, and stays fully readable.
 */
function hideTopAndRightBorders(ctx: SKRSContext2D): void {
  ctx.fillStyle = BOARD_BORDER;
  ctx.fillRect(0, 0, BOARD_SIZE, COORD);
  ctx.fillRect(BOARD_SIZE - COORD, 0, COORD, BOARD_SIZE);
}

/**
 * The board at a given ply (0 is the initial position), with the last move and
 * an optional classification of it. `flipped` turns the frame around, while
 * every piece, coordinate and badge stays upright.
 */
export async function renderBoard(
  game: ParsedGame,
  ply: number,
  flipped: boolean,
  rating?: Classification
): Promise<Buffer> {
  const currentPly = Math.min(Math.max(ply, 0), game.steps.length);
  const position = game.positions[currentPly] ?? game.positions.at(-1);
  const fen = position ? makeFen(position.toSetup()) : START_FEN;
  const last = game.steps[currentPly - 1];

  const ctx = createCanvas(BOARD_SIZE, BOARD_SIZE).getContext("2d");
  ctx.fillStyle = BOARD_BORDER;
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  await drawFrame(ctx, flipped);
  drawHighlights(ctx, flipped, last);

  const placed = await Promise.all(
    piecesFromFen(fen).map(async (piece) => ({
      image: await raster(new URL(`${piece.key}.png`, PIECES), PIECE_SIZE),
      square: piece.square,
    }))
  );
  for (const piece of placed) {
    const { x, y } = boardSquare(piece.square, flipped);
    // Whole pixels for position and size alike: pieces never straddle a
    // resampled seam next to the frame's own squares.
    const left = Math.round(x);
    const top = Math.round(y);
    ctx.drawImage(
      piece.image,
      left,
      top,
      Math.round(x + SQUARE) - left,
      Math.round(y + SQUARE) - top
    );
  }

  hideTopAndRightBorders(ctx);

  if (last && rating) {
    const badge = ratingBadgePosition(last.to, flipped);
    const image = await raster(
      new URL(`${ratingAsset(rating)}.png`, RATINGS),
      BADGE
    );
    ctx.drawImage(
      image,
      Math.round(badge.x),
      Math.round(badge.y),
      BADGE,
      BADGE
    );
  }

  // Encoded on the canvas thread pool: `toBuffer` would hold the event loop
  // (and every other module's interactions) for the whole encoding.
  return ctx.canvas.encode("png");
}
