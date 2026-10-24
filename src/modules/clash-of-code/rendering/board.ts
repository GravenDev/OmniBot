import type { Image } from "@napi-rs/canvas";
import { loadMedals } from "#lib/imaging.js";
import { PANEL_PADDING, renderStatCard } from "#lib/stat-card.js";
import {
  drawCellText,
  drawTable,
  playerColumn,
  tableHeight,
  type RankedPlayer,
  type TableColumn,
} from "#lib/table.js";
import { ACCENT } from "./theme.js";

const WIDTH = 800;

// A column right-aligned on `right`, measured from the table's right edge.
export interface BoardColumn<Row> {
  header: string;
  right: number;
  text: (row: Row) => string;
  accent?: boolean;
}

export interface Board<Row extends RankedPlayer> {
  icon: Image | null;
  title: string;
  subtitle: string;
  headers: { rank: string; player: string };
  // Room left to the names, between the avatar and the first column.
  nameWidth: number;
  columns: BoardColumn<Row>[];
  rows: Row[];
  // A row drawn apart under the others: the member who asked, off the page.
  extra?: Row | undefined;
}

/** A stat card holding one table: the module's result and leaderboard. */
export async function renderBoard<Row extends RankedPlayer>(
  board: Board<Row>
): Promise<Buffer> {
  const medals = await loadMedals();
  return renderStatCard({
    accent: ACCENT,
    width: WIDTH,
    image: board.icon,
    title: board.title,
    subtitle: board.subtitle,
    rows: [],
    footer: {
      height: tableHeight(board.rows.length, board.extra !== undefined),
      draw(ctx, x, y, width) {
        const columns: TableColumn<Row>[] = board.columns.map((column) => ({
          header: column.header,
          x: width - PANEL_PADDING - column.right,
          align: "right",
          draw: (c, row, cx, cy) =>
            drawCellText(c, column.text(row), cx, cy, {
              align: "right",
              ...(column.accent && { color: ACCENT }),
            }),
        }));
        drawTable<Row>(ctx, x, y, width, {
          rows: board.rows,
          extra: board.extra,
          extraAccent: ACCENT,
          columns: [
            ...playerColumn(board.headers, board.nameWidth, medals),
            ...columns,
          ],
        });
      },
    },
  });
}
