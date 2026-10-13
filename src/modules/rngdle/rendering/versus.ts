import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  createBoard,
  drawCircularImage,
  fillTextCentered,
  font,
  PALETTE,
  rgb,
  type Rgb,
} from "#lib/imaging.js";
import { fitText } from "#lib/stat-card.js";
import {
  TIER_COLORS,
  type TierOrError,
} from "#modules/rngdle/services/scoring.js";
import type {
  HeadToHead,
  Side,
  VersusWinners,
  Winner,
} from "#modules/rngdle/services/versus.js";
import { formatSpaced } from "./format.js";

const WIDTH = 1000;
const MARGIN = 40;
const CENTER = WIDTH / 2;
const HEADER_HEIGHT = 240;
const AVATAR_SIZE = 124;
const AVATAR_TOP = 28;
const AVATAR_RING = 5;
const PLAYER_CENTER = 250;
const NAME_SIZE = 32;
const NAME_Y = 196;
const NAME_MAX_WIDTH = 330;
const VS_RADIUS = 48;
const VS_SIZE = 40;

const BODY_TOP = HEADER_HEIGHT + 24;
const BOTTOM_MARGIN = 28;
const ROW_HEIGHT = 92;
const DUEL_HEIGHT = 150;
const DUEL_CENTER = 58;
const ROW_GAP = 12;
const ROW_RADIUS = 12;
const ACCENT_WIDTH = 6;
const LABEL_SIZE = 17;
const LABEL_HALF_WIDTH = 118;
const VALUE_OFFSET = 150;
const VALUE_MAX_WIDTH = CENTER - VALUE_OFFSET - MARGIN - 28;
const VALUE_SIZE = 36;
const SUBTEXT_SIZE = 17;
const ARROW_SIZE = 9;
const MIN_SCALE = 0.7;
const LOSER_ALPHA = 0.7;
const HIGHLIGHT_ALPHA = 0.13;
const DUEL_DETAIL_SIZE = 16;
const DUEL_BAR_HEIGHT = 12;
const DUEL_BAR_INSET = 28;
const DUEL_BAR_GAP = 4;

const SIDE_COLORS: Record<Side, Rgb> = {
  left: [77, 144, 254],
  right: [255, 82, 110],
};
const TIE_COLOR: Rgb = [110, 110, 110];
const SEPARATOR_COLOR: Rgb = [70, 70, 70];

export interface VersusPlayer {
  name: string;
  avatar: Image | null;
  totalScore: number;
  totalRolls: number;
  average: { score: number; tier: TierOrError } | null;
  best: { number: number; score: number; tier: TierOrError } | null;
  maxBadges: number | null;
}

export interface VersusImageData {
  left: VersusPlayer;
  right: VersusPlayer;
  headToHead: HeadToHead;
  winners: VersusWinners;
}

export interface VersusLabels {
  vs: string;
  totalScore: string;
  totalRolls: string;
  averageScore: string;
  bestRoll: string;
  maxBadges: string;
  headToHead: string;
  wins: (count: number) => string;
  duelDetail: (days: number, ties: number) => string;
  noCommonDay: string;
}

interface Value {
  text: string;
  color?: Rgb;
  subtext?: string;
}

interface Line {
  label: string;
  left: Value | null;
  right: Value | null;
  winner: Winner | null;
}

const SIDES: Side[] = ["left", "right"];

function ep(value: number): string {
  return `${formatSpaced(value)} EP`;
}

function fit(
  ctx: SKRSContext2D,
  value: string,
  size: number,
  maxWidth: number
): { text: string; size: number } {
  return fitText(ctx, value, size, maxWidth, Math.ceil(size * MIN_SCALE));
}

function drawCentered(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  centerY: number,
  size: number,
  color: Rgb,
  align: "left" | "right" | "center"
): void {
  ctx.font = font(size);
  ctx.fillStyle = rgb(color);
  ctx.textAlign = align;
  fillTextCentered(ctx, text, x, centerY);
  ctx.textAlign = "left";
}

function sideSign(side: Side): number {
  return side === "left" ? -1 : 1;
}

function drawHeader(
  ctx: SKRSContext2D,
  data: VersusImageData,
  labels: VersusLabels
): void {
  for (const side of SIDES) {
    const player = data[side];
    const centerX = CENTER + sideSign(side) * PLAYER_CENTER;
    const radius = AVATAR_SIZE / 2;
    ctx.beginPath();
    ctx.arc(centerX, AVATAR_TOP + radius, radius + AVATAR_RING, 0, Math.PI * 2);
    ctx.fillStyle = rgb(SIDE_COLORS[side]);
    ctx.fill();
    drawCircularImage(
      ctx,
      player.avatar,
      centerX - radius,
      AVATAR_TOP,
      AVATAR_SIZE
    );

    const name = fit(ctx, player.name, NAME_SIZE, NAME_MAX_WIDTH);
    drawCentered(
      ctx,
      name.text,
      centerX,
      NAME_Y,
      name.size,
      PALETTE.text,
      "center"
    );
  }

  const vsCenterY = AVATAR_TOP + AVATAR_SIZE / 2;
  ctx.beginPath();
  ctx.arc(CENTER, vsCenterY, VS_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = rgb(PALETTE.background);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgb(SEPARATOR_COLOR);
  ctx.stroke();
  drawCentered(
    ctx,
    labels.vs,
    CENTER,
    vsCenterY,
    VS_SIZE,
    PALETTE.text,
    "center"
  );
}

function drawRowBackground(
  ctx: SKRSContext2D,
  y: number,
  height: number,
  winner: Winner | null
): void {
  const width = WIDTH - 2 * MARGIN;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(MARGIN, y, width, height, ROW_RADIUS);
  ctx.fillStyle = rgb(PALETTE.box);
  ctx.fill();
  ctx.clip();
  if (winner === "left" || winner === "right") {
    const color = SIDE_COLORS[winner];
    const x = winner === "left" ? MARGIN : CENTER;
    ctx.globalAlpha = HIGHLIGHT_ALPHA;
    ctx.fillStyle = rgb(color);
    ctx.fillRect(x, y, width / 2, height);
    ctx.globalAlpha = 1;
    ctx.fillRect(
      winner === "left" ? MARGIN : WIDTH - MARGIN - ACCENT_WIDTH,
      y,
      ACCENT_WIDTH,
      height
    );
  }
  ctx.restore();
}

function drawArrow(ctx: SKRSContext2D, side: Side, centerY: number): void {
  const sign = sideSign(side);
  const tip = CENTER + sign * (LABEL_HALF_WIDTH + ARROW_SIZE);
  const base = tip - sign * ARROW_SIZE * 1.4;
  ctx.beginPath();
  ctx.moveTo(tip, centerY);
  ctx.lineTo(base, centerY - ARROW_SIZE);
  ctx.lineTo(base, centerY + ARROW_SIZE);
  ctx.closePath();
  ctx.fillStyle = rgb(SIDE_COLORS[side]);
  ctx.fill();
}

function drawValue(
  ctx: SKRSContext2D,
  value: Value | null,
  side: Side,
  centerY: number,
  winner: Winner | null
): void {
  const x = CENTER + sideSign(side) * VALUE_OFFSET;
  const align = side === "left" ? "right" : "left";
  if (!value) {
    drawCentered(ctx, "—", x, centerY, VALUE_SIZE, PALETTE.placeholder, align);
    return;
  }

  const losing = winner !== null && winner !== "tie" && winner !== side;
  ctx.globalAlpha = losing ? LOSER_ALPHA : 1;
  const fitted = fit(ctx, value.text, VALUE_SIZE, VALUE_MAX_WIDTH);
  const valueY = value.subtext ? centerY - 11 : centerY;
  drawCentered(
    ctx,
    fitted.text,
    x,
    valueY,
    fitted.size,
    value.color ?? PALETTE.text,
    align
  );
  if (value.subtext) {
    const subtext = fit(ctx, value.subtext, SUBTEXT_SIZE, VALUE_MAX_WIDTH);
    drawCentered(
      ctx,
      subtext.text,
      x,
      centerY + 22,
      subtext.size,
      PALETTE.subtext,
      align
    );
  }
  ctx.globalAlpha = 1;
}

function drawLabel(ctx: SKRSContext2D, label: string, centerY: number): void {
  const fitted = fit(
    ctx,
    label.toUpperCase(),
    LABEL_SIZE,
    LABEL_HALF_WIDTH * 2 - 8
  );
  drawCentered(
    ctx,
    fitted.text,
    CENTER,
    centerY,
    fitted.size,
    PALETTE.title,
    "center"
  );
}

function drawLine(ctx: SKRSContext2D, line: Line, y: number): void {
  drawRowBackground(ctx, y, ROW_HEIGHT, line.winner);
  const centerY = y + ROW_HEIGHT / 2;
  drawLabel(ctx, line.label, centerY);
  for (const side of SIDES) {
    drawValue(ctx, line[side], side, centerY, line.winner);
  }
  if (line.winner === "left" || line.winner === "right") {
    drawArrow(ctx, line.winner, centerY);
  }
}

function drawDuelBar(ctx: SKRSContext2D, duel: HeadToHead, y: number): void {
  const left = MARGIN + DUEL_BAR_INSET;
  const width = WIDTH - 2 * (MARGIN + DUEL_BAR_INSET);
  const segments = [
    { count: duel.left, color: SIDE_COLORS.left },
    { count: duel.ties, color: TIE_COLOR },
    { count: duel.right, color: SIDE_COLORS.right },
  ].filter((segment) => segment.count > 0);
  const available = width - DUEL_BAR_GAP * (segments.length - 1);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, y, width, DUEL_BAR_HEIGHT, DUEL_BAR_HEIGHT / 2);
  ctx.clip();
  let x = left;
  segments.forEach((segment, index) => {
    const segmentWidth =
      index === segments.length - 1
        ? left + width - x
        : (segment.count / duel.days) * available;
    ctx.fillStyle = rgb(segment.color);
    ctx.fillRect(x, y, segmentWidth, DUEL_BAR_HEIGHT);
    x += segmentWidth + DUEL_BAR_GAP;
  });
  ctx.restore();
}

function drawDuel(
  ctx: SKRSContext2D,
  duel: HeadToHead,
  winner: Winner | null,
  labels: VersusLabels,
  y: number
): void {
  drawRowBackground(ctx, y, DUEL_HEIGHT, winner);
  const centerY = y + DUEL_CENTER;
  const hasDays = duel.days > 0;
  drawLabel(ctx, labels.headToHead, centerY - 11);
  const detail = fit(
    ctx,
    hasDays ? labels.duelDetail(duel.days, duel.ties) : labels.noCommonDay,
    DUEL_DETAIL_SIZE,
    2 * VALUE_OFFSET - 24
  );
  drawCentered(
    ctx,
    detail.text,
    CENTER,
    centerY + 22,
    detail.size,
    PALETTE.subtext,
    "center"
  );

  for (const side of SIDES) {
    drawValue(
      ctx,
      hasDays
        ? {
            text: formatSpaced(duel[side]),
            color: duel[side] > 0 ? SIDE_COLORS[side] : PALETTE.text,
            subtext: labels.wins(duel[side]),
          }
        : null,
      side,
      centerY,
      winner
    );
  }
  if (winner === "left" || winner === "right") {
    drawArrow(ctx, winner, centerY - 11);
  }

  const barY = y + DUEL_HEIGHT - 32;
  if (hasDays) {
    drawDuelBar(ctx, duel, barY);
  } else {
    ctx.beginPath();
    ctx.roundRect(
      MARGIN + DUEL_BAR_INSET,
      barY,
      WIDTH - 2 * (MARGIN + DUEL_BAR_INSET),
      DUEL_BAR_HEIGHT,
      DUEL_BAR_HEIGHT / 2
    );
    ctx.fillStyle = rgb(SEPARATOR_COLOR);
    ctx.fill();
  }
}

function lines(data: VersusImageData, labels: VersusLabels): Line[] {
  const { left, right, winners } = data;
  const pair = (pick: (player: VersusPlayer) => Value | null) => ({
    left: pick(left),
    right: pick(right),
  });
  return [
    {
      label: labels.totalScore,
      ...pair((player) => ({ text: ep(player.totalScore) })),
      winner: winners.totalScore,
    },
    {
      label: labels.totalRolls,
      ...pair((player) => ({ text: formatSpaced(player.totalRolls) })),
      winner: winners.totalRolls,
    },
    {
      label: labels.averageScore,
      ...pair(
        ({ average }) =>
          average && {
            text: ep(average.score),
            color: TIER_COLORS[average.tier],
            subtext: average.tier,
          }
      ),
      winner: winners.averageScore,
    },
    {
      label: labels.bestRoll,
      ...pair(
        ({ best }) =>
          best && {
            text: formatSpaced(best.number),
            color: TIER_COLORS[best.tier],
            subtext: `${best.tier} · ${ep(best.score)}`,
          }
      ),
      winner: winners.bestRoll,
    },
    {
      label: labels.maxBadges,
      ...pair(({ maxBadges }) =>
        maxBadges === null ? null : { text: formatSpaced(maxBadges) }
      ),
      winner: winners.maxBadges,
    },
  ];
}

export async function renderVersus(
  data: VersusImageData,
  labels: VersusLabels
): Promise<Buffer> {
  const rows = lines(data, labels);
  const height =
    BODY_TOP +
    rows.length * (ROW_HEIGHT + ROW_GAP) +
    DUEL_HEIGHT +
    BOTTOM_MARGIN;
  const ctx = createBoard(WIDTH, height, HEADER_HEIGHT);
  drawHeader(ctx, data, labels);

  rows.forEach((line, index) => {
    drawLine(ctx, line, BODY_TOP + index * (ROW_HEIGHT + ROW_GAP));
  });
  drawDuel(
    ctx,
    data.headToHead,
    data.winners.headToHead,
    labels,
    BODY_TOP + rows.length * (ROW_HEIGHT + ROW_GAP)
  );

  return ctx.canvas.encode("png");
}
