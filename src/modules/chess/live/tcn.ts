// Chess.com encodes `moveList` with TCN, two characters per move. Port of the
// public chess-tcn decoder; only the normal-move part is needed here, as the
// watched games are standard chess (no drops).
const TCN_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=";
const PIECES = "qnrbkp";

function squareName(index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index > 63) return null;
  return `${TCN_CHARS[index % 8]}${Math.floor(index / 8) + 1}`;
}

interface Promotion {
  piece: string;
  target: number;
}

function decodePromotion(from: number, to: number): Promotion | null {
  const piece = PIECES[Math.floor((to - 64) / 3)];
  if (!piece) return null;
  return { piece, target: from + (from < 16 ? -8 : 8) + ((to - 1) % 3) - 1 };
}

/** TCN → UCI, or null when the feed sends something this decoder cannot read. */
export function decodeTcn(encoded: string): string[] | null {
  if (encoded.length % 2 !== 0) return null;
  const moves: string[] = [];
  for (let index = 0; index < encoded.length; index += 2) {
    const from = TCN_CHARS.indexOf(encoded[index]!);
    let to = TCN_CHARS.indexOf(encoded[index + 1]!);
    if (from < 0 || to < 0) return null;

    let promotion = "";
    if (to > 63) {
      const decoded = decodePromotion(from, to);
      if (!decoded) return null;
      promotion = decoded.piece;
      to = decoded.target;
    }
    // Indices above 75 encode a drop piece in Crazyhouse, not an origin square.
    // Skipping it would shift every later move and desync the board.
    if (from > 75) return null;
    const origin = squareName(from);
    const target = squareName(to);
    if (!origin || !target) return null;
    moves.push(`${origin}${target}${promotion}`);
  }
  return moves;
}
