import type { Previews } from "#lib/preview.js";
import { parseGame } from "../games/pgn.js";
import { renderBoard } from "./board.js";

// A short, made-up game: enough moves to show a developed position and a
// highlighted last move. The header tags are the ones a real PGN carries.
const game = parseGame(`[Event "Preview"]
[White "Camille"]
[Black "Yanis"]
[TimeControl "300+3"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7`);

if (!game) {
  throw new Error("Invalid preview PGN");
}

export default {
  initial: () => renderBoard(game, 0, false),
  "last-move": () => renderBoard(game, game.steps.length, false),
  "rating-badge": () =>
    renderBoard(game, game.steps.length, false, "brilliant"),
  flipped: () => renderBoard(game, game.steps.length, true),
  "flipped-badge": () => renderBoard(game, game.steps.length, true, "blunder"),
} satisfies Previews;
