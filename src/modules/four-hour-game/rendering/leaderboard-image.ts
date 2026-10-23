import type { Image } from "@napi-rs/canvas";
import { formatInteger } from "#lib/format.js";
import { loadMedals } from "#lib/imaging.js";
import { PANEL_PADDING, renderStatCard } from "#lib/stat-card.js";
import {
  drawCellText,
  drawTable,
  playerColumn,
  tableHeight,
  type RankedPlayer,
} from "#lib/table.js";
import { ACCENT } from "./theme.js";

const WIDTH = 800;
const NAME_WIDTH = 420;

export interface LeaderboardRow extends RankedPlayer {
  score: number;
}

export interface LeaderboardData {
  icon: Image | null;
  rows: LeaderboardRow[];
}

export interface LeaderboardLabels {
  // The locale of the scores drawn on the card.
  locale: string;
  title: string;
  subtitle: string;
  rank: string;
  player: string;
  score: string;
}

export async function renderLeaderboard(
  data: LeaderboardData,
  labels: LeaderboardLabels
): Promise<Buffer> {
  const medals = await loadMedals();
  return renderStatCard({
    accent: ACCENT,
    width: WIDTH,
    image: data.icon,
    title: labels.title,
    subtitle: labels.subtitle,
    rows: [],
    footer: {
      height: tableHeight(data.rows.length),
      draw(ctx, x, y, width) {
        drawTable<LeaderboardRow>(ctx, x, y, width, {
          rows: data.rows,
          columns: [
            ...playerColumn(
              { rank: labels.rank, player: labels.player },
              NAME_WIDTH,
              medals
            ),
            {
              header: labels.score,
              x: width - PANEL_PADDING,
              align: "right",
              draw: (c, row, cx, cy) =>
                drawCellText(
                  c,
                  formatInteger(row.score, labels.locale),
                  cx,
                  cy,
                  {
                    align: "right",
                    color: ACCENT,
                  }
                ),
            },
          ],
        });
      },
    },
  });
}
