import requests, {
  RateLimitedError,
} from "../services/site-requests.service.js";
import { speedOf } from "../speed.js";
import type { ChessSource, GameSummary } from "../types.js";
import { dateFromHeaders, parseGame } from "./pgn.js";

export const GAME_WINDOW_DAYS = 30;
export const MAX_GAMES = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

interface ChesscomGame {
  id?: number | string;
  game_id?: number | string;
  url?: string;
  pgn?: string;
  end_time?: number;
  time_class?: string;
  time_control?: string;
}

function lastPathSegment(value: string): string | null {
  try {
    return new URL(value).pathname.split("/").findLast(Boolean) ?? null;
  } catch {
    return null;
  }
}

function isChessSite(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "lichess.org" ||
      host.endsWith(".lichess.org") ||
      host === "chess.com" ||
      host.endsWith(".chess.com")
    );
  } catch {
    return false;
  }
}

function headerFromPgn(pgn: string, name: string): string | null {
  const match = new RegExp(String.raw`^\[${name}\s+"([^"]*)"\]`, "im").exec(
    pgn
  );
  return match?.[1] ?? null;
}

/** Builds the summary of one game, reusing the header parsing of `pgn.ts`. */
export function gameSummaryFromPgn(
  pgn: string,
  source: ChessSource,
  id: string,
  url?: string | null,
  apiSpeed?: string
): GameSummary | null {
  const game = parseGame(pgn);
  if (!game) return null;

  const { headers } = game;
  const timeControl = headers.get("TimeControl") ?? "";
  const site = headers.get("Site");
  const link = url || (site && isChessSite(site) ? site : null);

  return {
    id: id || (site ? lastPathSegment(site) : null) || "game",
    source,
    white: headers.get("White") ?? "?",
    black: headers.get("Black") ?? "?",
    result: game.result,
    timeControl,
    speed: speedOf(timeControl, apiSpeed),
    playedAt: dateFromHeaders(headers),
    url: link ?? null,
    pgn: pgn.trim(),
  };
}

function newestFirst<T>(items: T[], timeOf: (item: T) => number): T[] {
  return items.toSorted((a, b) => timeOf(b) - timeOf(a)).slice(0, MAX_GAMES);
}

function pgnBlocks(text: string): string[] {
  if (text.trimStart().startsWith("{")) {
    // Lichess also exports one JSON game per line on some endpoints.
    return text.split(/\r?\n/).flatMap((line) => {
      try {
        const value: unknown = JSON.parse(line);
        if (
          value &&
          typeof value === "object" &&
          "pgn" in value &&
          typeof value.pgn === "string"
        ) {
          return [value.pgn];
        }
      } catch {
        // Not a JSON line: ignore it.
      }
      return [];
    });
  }

  // A blank line also separates the headers from the movetext of one game.
  // A new header line after movetext starts the next game; an `[Event` tag
  // also does so when the previous block had headers but no movetext at all.
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
    const trimmed = line.trim();
    const hasMoves = current.some((previous) => {
      const previousTrimmed = previous.trim();
      return previousTrimmed !== "" && !previousTrimmed.startsWith("[");
    });
    const hasHeaders = current.some((previous) =>
      previous.trim().startsWith("[")
    );
    if (
      trimmed.startsWith("[") &&
      hasHeaders &&
      (hasMoves || trimmed.startsWith("[Event "))
    ) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join("\n"));

  return blocks
    .map((block) => block.trim())
    .filter((block) => block.startsWith("["));
}

export async function fetchLichessGames(
  username: string
): Promise<GameSummary[]> {
  const until = Date.now();
  const since = until - GAME_WINDOW_DAYS * DAY_MS;
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${MAX_GAMES}&since=${since}&until=${until}&ongoing=true`;
  const text = await requests.text(url, {
    Accept: "application/x-chess-pgn",
  });

  const games = pgnBlocks(text).flatMap((block) => {
    const site = headerFromPgn(block, "Site");
    const id =
      headerFromPgn(block, "GameId") ??
      (site ? (lastPathSegment(site) ?? "") : "");
    const summary = gameSummaryFromPgn(block, "lichess", id, null);
    if (!summary) return [];
    if (headerFromPgn(block, "Result") !== "*" || !id) return [summary];
    const termination = headerFromPgn(block, "Termination");
    // Aborted and never-started games are over: offering to watch them would
    // poll a feed that will never report a result.
    if (termination === "Aborted" || termination === "No start") {
      return [summary];
    }
    // An ongoing game has no playable PGN link yet: build the page URL the
    // watch flow reads to follow it.
    return [{ ...summary, ongoing: true, url: `https://lichess.org/${id}` }];
  });
  return newestFirst(games, (game) => game.playedAt?.getTime() ?? 0);
}

function intersectingArchives(
  urls: string[],
  since: number,
  until: number
): string[] {
  return urls.filter((archive) => {
    const match = /\/(\d{4})\/(\d{2})\/?$/.exec(archive);
    if (!match) return false;
    const year = Number(match[1] ?? "");
    const month = Number(match[2] ?? "");
    if (month < 1 || month > 12) return false;
    const start = Date.UTC(year, month - 1, 1);
    const end = Date.UTC(year, month, 1);
    return start <= until && end > since;
  });
}

function archivesFromIndex(index: unknown): string[] {
  if (!index || typeof index !== "object" || !("archives" in index)) return [];
  return Array.isArray(index.archives)
    ? index.archives.filter((url): url is string => typeof url === "string")
    : [];
}

interface DatedSummary {
  summary: GameSummary;
  endedAt: number;
}

function endedWithin(
  game: ChesscomGame,
  since: number,
  until: number
): game is ChesscomGame & { end_time: number } {
  if (typeof game.end_time !== "number" || !Number.isFinite(game.end_time))
    return false;
  // Chess.com timestamps are seconds; the window boundaries are milliseconds.
  return game.end_time >= since / 1000 && game.end_time <= until / 1000;
}

function summaryFromChesscomGame(game: ChesscomGame): GameSummary | null {
  if (typeof game.pgn !== "string") return null;
  const summary = gameSummaryFromPgn(
    game.pgn,
    "chesscom",
    chesscomGameId(game),
    game.url ?? null,
    game.time_class ?? game.time_control
  );
  if (!summary) return null;
  return {
    ...summary,
    timeControl: game.time_control || summary.timeControl,
    speed: game.time_control
      ? speedOf(game.time_control, game.time_class)
      : summary.speed,
  };
}

function datedSummary(
  game: ChesscomGame,
  since: number,
  until: number
): DatedSummary | null {
  if (!endedWithin(game, since, until)) return null;
  const summary = summaryFromChesscomGame(game);
  if (!summary) return null;
  return { summary, endedAt: game.end_time };
}

function summariesFromArchives(
  results: PromiseSettledResult<unknown>[],
  since: number,
  until: number
): DatedSummary[] {
  const entries: DatedSummary[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue;
    for (const game of result.value as ChesscomGame[]) {
      const entry = datedSummary(game, since, until);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

function chesscomGameId(game: ChesscomGame): string {
  const explicit = game.id ?? game.game_id;
  if (explicit !== undefined) return String(explicit);
  return game.url ? (lastPathSegment(game.url) ?? "") : "";
}

/** Chess.com daily games use `days/seconds`; keep the seconds for the clock. */
export function chesscomTimeControl(raw: string): string {
  return /^\d+\/(\d+)$/.exec(raw)?.[1] ?? raw;
}

function chesscomCurrentGamesUrl(username: string): string {
  // The same endpoint feeds the list and the watch: a fresh read matters when
  // a daily game has just moved.
  return `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games?v=${Date.now()}`;
}

/**
 * The monthly archives only hold finished games. This public endpoint lists
 * the player's ongoing daily games, the only Chess.com games that can be
 * watched live by username.
 */
export async function fetchChesscomCurrentGames(
  username: string
): Promise<GameSummary[]> {
  const data = asObject(await requests.json(chesscomCurrentGamesUrl(username)));
  const games = Array.isArray(data?.["games"]) ? data["games"] : [];
  return games.flatMap((value) => {
    const game = asObject(value);
    const pgn = typeof game?.["pgn"] === "string" ? game["pgn"] : null;
    const url = stringAt(game, "url");
    if (!pgn || !url || !/\[Result\s+"\*"\]/.test(pgn)) return [];
    const id = lastPathSegment(url);
    if (!id) return [];
    const rawControl = stringAt(game, "time_control") ?? undefined;
    const summary = gameSummaryFromPgn(pgn, "chesscom", id, url, rawControl);
    if (!summary) return [];
    return [
      {
        ...summary,
        ongoing: true,
        timeControl: rawControl
          ? chesscomTimeControl(rawControl)
          : summary.timeControl,
        speed: rawControl
          ? speedOf(rawControl, stringAt(game, "time_class") ?? undefined)
          : summary.speed,
      },
    ];
  });
}

export async function fetchChesscomGames(
  username: string
): Promise<GameSummary[]> {
  const until = Date.now();
  const since = until - GAME_WINDOW_DAYS * DAY_MS;
  const indexUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`;
  const archives = archivesFromIndex(await requests.json(indexUrl));
  const selected = intersectingArchives(archives, since, until);
  // Ongoing daily games are not in the archives. A failure here must not hide
  // the finished games the archives did return.
  const current = fetchChesscomCurrentGames(username).catch((err: unknown) => {
    // Except a rate limit: the list would claim the player has no game.
    if (err instanceof RateLimitedError) throw err;
    return [];
  });

  // The month archives are independent (the requests still go one at a
  // time): a month that failed is left out rather than losing the window. A
  // rate limit is not: the site would refuse every later month too, and the
  // list would silently miss a whole period.
  const results = await Promise.allSettled(
    selected.map(async (url) => {
      const body = await requests.json(url);
      return body && typeof body === "object" && "games" in body
        ? body.games
        : [];
    })
  );
  const limited = results.find(
    (result) =>
      result.status === "rejected" && result.reason instanceof RateLimitedError
  );
  if (limited?.status === "rejected") {
    // `current` may have failed the same way: handle it before throwing.
    await current.catch(() => undefined);
    throw limited.reason;
  }
  const entries = summariesFromArchives(results, since, until);

  // The games still running come first: they are the ones worth watching.
  return [
    ...(await current),
    ...newestFirst(entries, (entry) => entry.endedAt).map(
      (entry) => entry.summary
    ),
  ].slice(0, MAX_GAMES);
}

export interface ParsedGameUrl {
  source: "lichess" | "chesscom";
  id: string;
  kind?: "live" | "daily";
}

function lichessGameSegment(segments: string[]): string | undefined {
  if (segments[0] !== "game") return segments[0];
  return segments[1] === "export" ? segments[2] : segments[1];
}

export function parseGameUrl(raw: string): ParsedGameUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid game URL: ${raw}`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`Unsupported game URL: ${raw}`);
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "lichess.org" || host === "www.lichess.org") {
    const segment = lichessGameSegment(segments);
    // Lichess also shares 12-character "full IDs"; the API only accepts their
    // first 8 characters, the last 4 being the browser's board orientation.
    // Other paths (`/tournament/…`, `/analysis/…`) are not games: reject them
    // before spending a request on the export endpoint.
    if (!segment || !/^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{4})?$/.test(segment)) {
      throw new Error(`Unsupported Lichess game URL: ${raw}`);
    }
    return { source: "lichess", id: segment.slice(0, 8) };
  }
  if (host === "chess.com" || host === "www.chess.com") {
    const [root, kind, id] = segments;
    if (
      root !== "game" ||
      (kind !== "live" && kind !== "daily") ||
      !id ||
      !/^\d+$/.test(id)
    ) {
      throw new Error(`Unsupported Chess.com game URL: ${raw}`);
    }
    return { source: "chesscom", id, kind };
  }
  throw new Error(`Unsupported game URL host: ${url.hostname}`);
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function stringAt(value: unknown, key: string): string | null {
  const candidate = asObject(value)?.[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

interface ImportedPgn {
  pgn: string;
  timeClass?: string;
}

/**
 * Chess.com's game page is a JavaScript app with no PGN in its HTML. Its web
 * client reads the callback below; the PGN itself lives in the monthly archive
 * of either player, matched by the game id at the end of the archive URL.
 */
async function fetchChesscomPgn(
  kind: "live" | "daily",
  id: string
): Promise<ImportedPgn> {
  const callbackUrl = `https://www.chess.com/callback/${kind}/game/${id}`;
  const callback = asObject(await requests.json(callbackUrl));
  const details = asObject(callback?.["game"]);
  const headers = asObject(details?.["pgnHeaders"]);
  const white = stringAt(headers, "White")?.toLowerCase();

  // Monthly archives are keyed by the end date: daily games can start in one
  // month and finish in the next one.
  let ended: Date | undefined;
  if (typeof details?.["endTime"] === "number") {
    ended = new Date((details["endTime"] as number) * 1000);
  } else {
    const date = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(
      stringAt(headers, "EndDate") ?? stringAt(headers, "Date") ?? ""
    );
    if (date?.[1] && date[2]) {
      ended = new Date(`${date[1]}-${date[2]}-01T00:00:00Z`);
    }
  }
  const year = ended ? String(ended.getUTCFullYear()) : undefined;
  const month = ended
    ? String(ended.getUTCMonth() + 1).padStart(2, "0")
    : undefined;
  if (!white || !year || !month) {
    throw new Error(`Chess.com game ${id} has no player and date`);
  }

  const archiveUrl = `https://api.chess.com/pub/player/${encodeURIComponent(
    white
  )}/games/${year}/${month}`;
  const archive = asObject(await requests.json(archiveUrl));
  const games: unknown[] = Array.isArray(archive?.["games"])
    ? (archive["games"] as unknown[])
    : [];
  const entry = games.find((value): value is JsonObject => {
    const game = asObject(value);
    return (
      !!game &&
      typeof game["pgn"] === "string" &&
      typeof game["url"] === "string" &&
      lastPathSegment(game["url"] as string) === id
    );
  });
  if (!entry) {
    throw new Error(`No PGN found in the Chess.com archive of ${white}`);
  }

  const pgn = entry["pgn"] as string;
  const timeClass = stringAt(entry, "time_class");
  return timeClass ? { pgn, timeClass } : { pgn };
}

export async function fetchGameFromUrl(url: string): Promise<GameSummary> {
  const game = parseGameUrl(url);
  const imported: ImportedPgn =
    game.source === "lichess"
      ? {
          pgn: await requests.text(
            `https://lichess.org/game/export/${encodeURIComponent(game.id)}`,
            { Accept: "application/x-chess-pgn" }
          ),
        }
      : await fetchChesscomPgn(game.kind!, game.id);

  const summary = gameSummaryFromPgn(
    imported.pgn,
    "url",
    game.id,
    url,
    imported.timeClass
  );
  if (!summary) {
    throw new Error(`Could not parse the PGN of the game: ${url}`);
  }
  return summary;
}
