import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { formatInteger } from "#lib/format.js";
import { loadMedals, PALETTE, rgb, type Rgb } from "#lib/imaging.js";
import {
  drawPanel,
  drawPanelTitle,
  GAP,
  measureText,
  PANEL_PADDING,
  renderStatCard,
  TREND_COLORS,
  type Trend,
} from "#lib/stat-card.js";
import {
  drawCellText,
  drawTable,
  playerColumn,
  tableHeight,
  type RankedPlayer,
} from "#lib/table.js";
import { ACCENT } from "./theme.js";

const REACTIONS_WIDTH = 300;
const NAME_WIDTH = 600;
const BAR_TOP = 52;
const BAR_HEIGHT = 36;
const BAR_GAP = 8;
const BAR_RADIUS = 8;
const BAR_ALPHA = 0.35;
const BAR_INSET = 12;
const BAR_FONT = 20;
const EMOJI_SIZE = 24;
const RECORD_COLOR: Rgb = [250, 199, 70];
const HOURS_HEIGHT = 210;
const HOURS_BARS_TOP = 56;
const HOURS_BARS_HEIGHT = 100;
const HOURS_LABEL_GAP = 18;
const HOURS_LABEL_SIZE = 16;
const HOURS_LABEL_STEP = 3;
const HOUR_BAR_RATIO = 0.7;
const HOUR_BAR_ALPHA = 0.5;
const HOUR_BAR_MIN = 2;

export interface ChannelEntry {
  name: string;
  count: number;
}

export interface ReactionEntry {
  text: string;
  image: Image | null;
  count: number;
}

export interface MemberEntry extends RankedPlayer {
  count: number;
}

export interface BoxNote {
  trend?: Trend | undefined;
  subtext?: string | undefined;
  record: boolean;
}

export type NotedBox = "joins" | "messages" | "activeMembers" | "reactions";

export interface ReportCardData {
  icon: Image | null;
  memberCount: number;
  joins: number;
  leaves: number;
  messages: number;
  activeMembers: number;
  activeChannels: number;
  reactions: number;
  topChannels: ChannelEntry[];
  topReactions: ReactionEntry[];
  topMembers: MemberEntry[] | null;
  hours: number[];
  notes: Record<NotedBox, BoxNote>;
}

export interface ReportCardLabels {
  locale: string;
  title: string;
  subtitle: string;
  memberCount: string;
  joins: string;
  leaves: string;
  messages: string;
  activeMembers: string;
  reactions: string;
  topChannels: (count: number) => string;
  hours: string;
  peak: (hour: number) => string;
  hour: (hour: number) => string;
  topReactions: string;
  topMembers: string;
  rank: string;
  member: string;
  messagesHeader: string;
}

export function rankingHeight(rows: number): number {
  return (
    BAR_TOP +
    Math.max(rows, 1) * (BAR_HEIGHT + BAR_GAP) -
    BAR_GAP +
    PANEL_PADDING
  );
}

function drawRanking<Entry extends { count: number }>(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  ranking: {
    title: string;
    entries: Entry[];
    locale: string;
    drawLabel: (
      entry: Entry,
      x: number,
      centerY: number,
      maxWidth: number
    ) => void;
  }
): void {
  drawPanel(ctx, x, y, width, height);
  drawPanelTitle(ctx, ranking.title, x, y);
  const left = x + PANEL_PADDING;
  const barWidth = width - 2 * PANEL_PADDING;
  if (ranking.entries.length === 0) {
    drawCellText(ctx, "—", left, y + BAR_TOP + BAR_HEIGHT / 2, {
      color: PALETTE.subtext,
      size: BAR_FONT,
    });
    return;
  }
  const max = Math.max(...ranking.entries.map((entry) => entry.count));
  ranking.entries.forEach((entry, index) => {
    const top = y + BAR_TOP + index * (BAR_HEIGHT + BAR_GAP);
    ctx.beginPath();
    ctx.roundRect(left, top, barWidth, BAR_HEIGHT, BAR_RADIUS);
    ctx.fillStyle = rgb(PALETTE.track);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = BAR_ALPHA;
    ctx.fillStyle = rgb(ACCENT);
    ctx.fillRect(left, top, (barWidth * entry.count) / max, BAR_HEIGHT);
    ctx.restore();

    const centerY = top + BAR_HEIGHT / 2;
    const count = formatInteger(entry.count, ranking.locale);
    drawCellText(ctx, count, left + barWidth - BAR_INSET, centerY, {
      align: "right",
      size: BAR_FONT,
    });
    const countWidth = measureText(ctx, count, BAR_FONT);
    ranking.drawLabel(
      entry,
      left + BAR_INSET,
      centerY,
      barWidth - 3 * BAR_INSET - countWidth
    );
  });
}

function noted(note: BoxNote, color?: Rgb) {
  return {
    trend: note.trend,
    ...(note.subtext === undefined ? {} : { subtext: note.subtext }),
    ...(note.record
      ? { color: RECORD_COLOR }
      : color
        ? { color, highlight: false }
        : {}),
  };
}

function drawHours(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  hours: number[],
  labels: ReportCardLabels
): void {
  drawPanel(ctx, x, y, width, HOURS_HEIGHT);
  drawPanelTitle(ctx, labels.hours, x, y);
  const max = Math.max(...hours);
  const peak = hours.indexOf(max);
  const left = x + PANEL_PADDING;
  const right = x + width - PANEL_PADDING;
  drawCellText(ctx, labels.peak(peak), right, y + 26, {
    align: "right",
    color: PALETTE.subtext,
    size: HOURS_LABEL_SIZE + 2,
  });
  const slot = (right - left) / hours.length;
  const barWidth = slot * HOUR_BAR_RATIO;
  const bottom = y + HOURS_BARS_TOP + HOURS_BARS_HEIGHT;
  hours.forEach((count, hour) => {
    const barX = left + hour * slot + (slot - barWidth) / 2;
    const height = Math.max(HOUR_BAR_MIN, (HOURS_BARS_HEIGHT * count) / max);
    ctx.globalAlpha = count === 0 ? 1 : hour === peak ? 1 : HOUR_BAR_ALPHA;
    ctx.fillStyle = rgb(count === 0 ? PALETTE.track : ACCENT);
    ctx.beginPath();
    ctx.roundRect(barX, bottom - height, barWidth, height, [3, 3, 0, 0]);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (hour % HOURS_LABEL_STEP === 0) {
      drawCellText(
        ctx,
        labels.hour(hour),
        barX + barWidth / 2,
        bottom + HOURS_LABEL_GAP,
        { align: "center", color: PALETTE.subtext, size: HOURS_LABEL_SIZE }
      );
    }
  });
}

export async function renderReportCard(
  data: ReportCardData,
  labels: ReportCardLabels
): Promise<Buffer> {
  const medals = await loadMedals();
  const format = (value: number) => formatInteger(value, labels.locale);
  const rankingsHeight = rankingHeight(
    Math.max(data.topChannels.length, data.topReactions.length)
  );
  const showHours = data.hours.some((count) => count > 0);
  const hoursHeight = showHours ? GAP + HOURS_HEIGHT : 0;
  const membersHeight = data.topMembers
    ? GAP + tableHeight(data.topMembers.length, false, true)
    : 0;

  return renderStatCard({
    accent: ACCENT,
    image: data.icon,
    title: labels.title,
    subtitle: labels.subtitle,
    rows: [
      [
        { title: labels.memberCount, value: format(data.memberCount) },
        {
          title: labels.joins,
          value: format(data.joins),
          ...noted(data.notes.joins, TREND_COLORS.up),
        },
        {
          title: labels.leaves,
          value: format(data.leaves),
          color: TREND_COLORS.down,
          highlight: false,
        },
      ],
      [
        {
          title: labels.messages,
          value: format(data.messages),
          ...noted(data.notes.messages),
        },
        {
          title: labels.activeMembers,
          value: format(data.activeMembers),
          ...noted(data.notes.activeMembers),
        },
        {
          title: labels.reactions,
          value: format(data.reactions),
          ...noted(data.notes.reactions),
        },
      ],
    ],
    footer: {
      height: rankingsHeight + hoursHeight + membersHeight,
      draw(ctx, x, y, width) {
        const channelsWidth = width - GAP - REACTIONS_WIDTH;
        drawRanking(ctx, x, y, channelsWidth, rankingsHeight, {
          title: labels.topChannels(data.activeChannels),
          entries: data.topChannels,
          locale: labels.locale,
          drawLabel: (entry, labelX, centerY, maxWidth) =>
            drawCellText(ctx, `# ${entry.name}`, labelX, centerY, {
              size: BAR_FONT,
              fitWidth: maxWidth,
            }),
        });
        drawRanking(
          ctx,
          x + channelsWidth + GAP,
          y,
          REACTIONS_WIDTH,
          rankingsHeight,
          {
            title: labels.topReactions,
            entries: data.topReactions,
            locale: labels.locale,
            drawLabel: (entry, labelX, centerY) => {
              if (entry.image) {
                ctx.drawImage(
                  entry.image,
                  labelX,
                  centerY - EMOJI_SIZE / 2,
                  EMOJI_SIZE,
                  EMOJI_SIZE
                );
              } else {
                drawCellText(ctx, entry.text, labelX, centerY, {
                  size: EMOJI_SIZE,
                });
              }
            },
          }
        );
        if (showHours) {
          drawHours(
            ctx,
            x,
            y + rankingsHeight + GAP,
            width,
            data.hours,
            labels
          );
        }
        if (!data.topMembers) {
          return;
        }
        drawTable<MemberEntry>(
          ctx,
          x,
          y + rankingsHeight + hoursHeight + GAP,
          width,
          {
            title: labels.topMembers,
            rows: data.topMembers,
            columns: [
              ...playerColumn(
                { rank: labels.rank, player: labels.member },
                NAME_WIDTH,
                medals
              ),
              {
                header: labels.messagesHeader,
                x: width - PANEL_PADDING,
                align: "right",
                draw: (c, row, cx, cy) =>
                  drawCellText(c, format(row.count), cx, cy, {
                    align: "right",
                    color: ACCENT,
                  }),
              },
            ],
          }
        );
      },
    },
  });
}
