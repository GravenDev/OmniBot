import type { Image } from "@napi-rs/canvas";
import { formatInteger, formatPercentage } from "#lib/format.js";
import type { RankedPlayer } from "#lib/table.js";
import type { ClashMode } from "#modules/clash-of-code/services/api.js";
import { renderBoard, type BoardColumn } from "./board.js";
import { formatDuration } from "./format.js";

export interface ResultRow extends RankedPlayer {
  score: number;
  durationMs: number;
  criterion: number | null;
}

export interface ResultLabels {
  // The locale of the numbers drawn on the card.
  locale: string;
  title: string;
  subtitle: string;
  rank: string;
  player: string;
  score: string;
  time: string;
  characters: string;
}

// Right edges from the table's right edge, measured at the table's fonts: a
// time takes up to 86 px, a length 54 px under a 76 px header, a score 58 px,
// so each column keeps about 30 px from the next. The shortest mode adds the
// length column and leaves the names less room.
const TIME_RIGHT = 0;
const LENGTH_RIGHT = 120;
const SHORTEST_SCORE_RIGHT = 230;
const NAME_WIDTH = 380;
const SHORTEST_NAME_WIDTH = 270;

export function resultColumns(
  mode: ClashMode | null,
  labels: ResultLabels
): BoardColumn<ResultRow>[] {
  const time: BoardColumn<ResultRow> = {
    header: labels.time,
    right: TIME_RIGHT,
    text: (row) => formatDuration(row.durationMs),
  };
  const score = (right: number): BoardColumn<ResultRow> => ({
    header: labels.score,
    right,
    text: (row) => formatPercentage(row.score, labels.locale),
    accent: true,
  });
  if (mode !== "SHORTEST") {
    return [score(LENGTH_RIGHT), time];
  }
  return [
    score(SHORTEST_SCORE_RIGHT),
    {
      header: labels.characters,
      right: LENGTH_RIGHT,
      text: (row) =>
        row.criterion === null
          ? "—"
          : formatInteger(row.criterion, labels.locale),
    },
    time,
  ];
}

export function renderResult(
  mode: ClashMode | null,
  icon: Image | null,
  rows: ResultRow[],
  labels: ResultLabels
): Promise<Buffer> {
  return renderBoard({
    icon,
    title: labels.title,
    subtitle: labels.subtitle,
    headers: { rank: labels.rank, player: labels.player },
    nameWidth: mode === "SHORTEST" ? SHORTEST_NAME_WIDTH : NAME_WIDTH,
    columns: resultColumns(mode, labels),
    rows,
  });
}
