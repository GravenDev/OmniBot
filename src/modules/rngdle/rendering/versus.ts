import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  createBoard,
  drawHighlight,
  drawPortrait,
  fillTextCentered,
  font,
  PALETTE,
  rgb,
  type Rgb,
} from "#lib/imaging.js";
import {
  BODY_TOP,
  BOTTOM_MARGIN,
  DEFAULT_WIDTH,
  drawPanel,
  fillPanel,
  fitText,
  GAP,
  HEADER_HEIGHT,
  LABEL_SIZE,
  MARGIN,
  PANEL_PADDING,
  PANEL_RADIUS,
  PORTRAIT_SIZE,
  strokePanel,
  SUBTEXT_MIN_SIZE,
  SUBTEXT_SIZE,
  TITLE_SIZE,
  VALUE_SIZE,
} from "#lib/stat-card.js";
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
import { ACCENT } from "./theme.js";

const WIDTH = DEFAULT_WIDTH;
const CENTER = WIDTH / 2;
const HEADER_CENTER = HEADER_HEIGHT / 2;
const NAME_GAP = 24;
const VS_SIZE = 28;
const VS_HALF_WIDTH = 40;
const NAME_MIN_SIZE = 22;
const NAME_MAX_WIDTH =
  CENTER - VS_HALF_WIDTH - MARGIN - PORTRAIT_SIZE - 2 * NAME_GAP;

const ROW_HEIGHT = 92;
const DUEL_HEIGHT = 140;
const DUEL_CENTER = 56;
const LABEL_HALF_WIDTH = 118;
const VALUE_OFFSET = 150;
const VALUE_MAX_WIDTH = CENTER - VALUE_OFFSET - MARGIN - PANEL_PADDING;
const ARROW_SIZE = 7;
const MIN_SCALE = 0.7;
const LOSER_ALPHA = 0.7;
const DUEL_DETAIL_SIZE = 16;
const DUEL_BAR_HEIGHT = 10;
const DUEL_BAR_GAP = 4;

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

function isLoser(winner: Winner | null, side: Side): boolean {
  return winner !== null && winner !== "tie" && winner !== side;
}

function barColor(winner: Winner | null, side: Side): Rgb {
  return winner === side ? ACCENT : PALETTE.text;
}

function drawHeader(
  ctx: SKRSContext2D,
  data: VersusImageData,
  labels: VersusLabels
): void {
  const portraitY = HEADER_CENTER - PORTRAIT_SIZE / 2;
  for (const side of SIDES) {
    const player = data[side];
    const left = side === "left";
    const portraitX = left ? MARGIN : WIDTH - MARGIN - PORTRAIT_SIZE;
    drawPortrait(
      ctx,
      player.avatar,
      portraitX,
      portraitY,
      PORTRAIT_SIZE,
      ACCENT
    );

    const name = fitText(
      ctx,
      player.name,
      TITLE_SIZE,
      NAME_MAX_WIDTH,
      NAME_MIN_SIZE
    );
    const nameX = left
      ? portraitX + PORTRAIT_SIZE + NAME_GAP
      : portraitX - NAME_GAP;
    drawCentered(
      ctx,
      name.text,
      nameX,
      HEADER_CENTER,
      name.size,
      PALETTE.text,
      left ? "left" : "right"
    );
  }

  drawCentered(
    ctx,
    labels.vs,
    CENTER,
    HEADER_CENTER,
    VS_SIZE,
    PALETTE.subtext,
    "center"
  );
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
  ctx.fillStyle = rgb(ACCENT);
  ctx.fill();
}

function drawRow(
  ctx: SKRSContext2D,
  y: number,
  height: number,
  winner: Winner | null
): void {
  const width = WIDTH - 2 * MARGIN;
  if (winner !== "left" && winner !== "right") {
    drawPanel(ctx, MARGIN, y, width, height);
    return;
  }
  fillPanel(ctx, MARGIN, y, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(MARGIN, y, width, height, PANEL_RADIUS);
  ctx.clip();
  drawHighlight(
    ctx,
    winner === "left" ? MARGIN : CENTER,
    y,
    width / 2,
    height,
    ACCENT,
    { edge: winner }
  );
  ctx.restore();
  strokePanel(ctx, MARGIN, y, width, height);
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

  ctx.globalAlpha = isLoser(winner, side) ? LOSER_ALPHA : 1;
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
    const subtext = fitText(
      ctx,
      value.subtext,
      SUBTEXT_SIZE,
      VALUE_MAX_WIDTH,
      SUBTEXT_MIN_SIZE
    );
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
  const fitted = fit(ctx, label, LABEL_SIZE, LABEL_HALF_WIDTH * 2 - 8);
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
  drawRow(ctx, y, ROW_HEIGHT, line.winner);
  const centerY = y + ROW_HEIGHT / 2;
  drawLabel(ctx, line.label, centerY);
  for (const side of SIDES) {
    drawValue(ctx, line[side], side, centerY, line.winner);
  }
  if (line.winner === "left" || line.winner === "right") {
    drawArrow(ctx, line.winner, centerY);
  }
}

function drawDuelBar(
  ctx: SKRSContext2D,
  duel: HeadToHead,
  winner: Winner | null,
  y: number
): void {
  const left = MARGIN + PANEL_PADDING;
  const width = WIDTH - 2 * left;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, y, width, DUEL_BAR_HEIGHT, DUEL_BAR_HEIGHT / 2);
  ctx.clip();
  ctx.fillStyle = rgb(PALETTE.track);
  ctx.fillRect(left, y, width, DUEL_BAR_HEIGHT);

  const segments = [
    { count: duel.left, color: barColor(winner, "left") },
    { count: duel.ties, color: PALETTE.placeholder },
    { count: duel.right, color: barColor(winner, "right") },
  ].filter((segment) => segment.count > 0);
  const available = width - DUEL_BAR_GAP * (segments.length - 1);
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
  drawRow(ctx, y, DUEL_HEIGHT, winner);
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
        ? { text: formatSpaced(duel[side]), subtext: labels.wins(duel[side]) }
        : null,
      side,
      centerY,
      winner
    );
  }
  if (winner === "left" || winner === "right") {
    drawArrow(ctx, winner, centerY - 11);
  }

  drawDuelBar(ctx, duel, winner, y + DUEL_HEIGHT - 30);
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
    BODY_TOP + rows.length * (ROW_HEIGHT + GAP) + DUEL_HEIGHT + BOTTOM_MARGIN;
  const ctx = createBoard(WIDTH, height, HEADER_HEIGHT, ACCENT);
  drawHeader(ctx, data, labels);

  rows.forEach((line, index) => {
    drawLine(ctx, line, BODY_TOP + index * (ROW_HEIGHT + GAP));
  });
  drawDuel(
    ctx,
    data.headToHead,
    data.winners.headToHead,
    labels,
    BODY_TOP + rows.length * (ROW_HEIGHT + GAP)
  );

  return ctx.canvas.encode("png");
}
