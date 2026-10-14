import {
  renderLeaderboardTable,
  type LeaderboardEntry,
} from "#lib/leaderboard-table.js";
import { ACCENT } from "./theme.js";

export interface LeaderboardRow extends LeaderboardEntry {
  score: number;
}

export interface LeaderboardHeaders {
  rank: string;
  player: string;
  score: string;
}

export function renderLeaderboard(
  rows: LeaderboardRow[],
  headers: LeaderboardHeaders
): Promise<Buffer> {
  return renderLeaderboardTable({
    headers,
    rows,
    accent: ACCENT,
    columns: [
      {
        header: headers.score,
        x: 650,
        maxWidth: 140,
        cell: (row) => ({ text: String(row.score) }),
      },
    ],
  });
}
