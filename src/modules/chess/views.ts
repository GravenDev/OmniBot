import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  type MessageMentionOptions,
  escapeMarkdown,
} from "discord.js";
import type { Evaluation } from "wintrchess/engine";
import { getWinPercent } from "wintrchess/engine";
import type { TFunction } from "#lib/i18n.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { pageRow } from "#lib/pagination.js";
import { ratingEmoji } from "./emojis.js";
import { OUTCOME_EMOJI, playerSide } from "./ratings.js";
import { renderBoard } from "./rendering/board.js";
import { formatTimeControl, speedOf } from "./speed.js";
import type {
  ChessSession,
  ChessSide,
  ChessView,
  GameAnalysis,
  GameSummary,
  ParsedGame,
} from "./types.js";

export const GAMES_PER_PAGE = 5;

export const PUBLIC_FLAGS = MessageFlags.IsComponentsV2;
export const EPHEMERAL_FLAGS =
  MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
export type ChessMessageFlags =
  | MessageFlags.IsComponentsV2
  | typeof EPHEMERAL_FLAGS;

interface ChessMessageBody {
  components: (ContainerBuilder | ActionRowBuilder<ButtonBuilder>)[];
  files?: AttachmentBuilder[];
  allowedMentions: MessageMentionOptions;
}

export interface ChessMessage extends ChessMessageBody {
  flags: ChessMessageFlags;
}

export interface ChessEditMessage extends ChessMessageBody {
  flags: MessageFlags.IsComponentsV2;
}

const ACCENT = 0x4a90e2;

// Plain Unicode emojis: the action buttons need no application emoji, unlike
// the classification badges which do.
const ACTION_EMOJIS = {
  board: "♟️",
  analyse: "🔍",
  report: "📊",
  otherSide: "🔄",
} as const;

function flagsFor(ephemeral: boolean): ChessMessageFlags {
  return ephemeral ? EPHEMERAL_FLAGS : PUBLIC_FLAGS;
}

/**
 * Appends a transient notice below an existing chess message. The view and
 * its action buttons stay in place; the caller removes the notice by editing
 * the message back to its normal form.
 */
export function withNotice(
  message: ChessMessage,
  content: string
): ChessMessage {
  const notice = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents((text) => text.setContent(content));
  return { ...message, components: [...message.components, notice] };
}

/** Edits keep the original visibility; only the Components V2 flag changes. */
export function editable(message: ChessMessage): ChessEditMessage {
  return { ...message, flags: PUBLIC_FLAGS };
}

function sourceLabel(source: GameSummary["source"]): string {
  if (source === "chesscom") return "Chess.com";
  if (source === "lichess") return "Lichess";
  return source.toUpperCase();
}

function dateLabel(playedAt: Date | null, locale: string): string {
  if (!playedAt) return "?";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    playedAt
  );
}

function accuracy(value: number): string {
  // The formula is unbounded; a display cannot be negative or over 100.
  const bounded = Math.min(100, Math.max(0, value));
  return (Math.round(bounded * 10) / 10).toFixed(1);
}

const GAUGE_CELLS = 16;

/** White's share of the win probability, as a plain horizontal bar. */
function advantageGauge(evaluation: Evaluation): string {
  const white = Math.round(getWinPercent(evaluation, "white") * GAUGE_CELLS);
  return "⬜".repeat(white) + "⬛".repeat(GAUGE_CELLS - white);
}

function evaluationLabel(
  evaluation: Evaluation,
  t: TFunction,
  checkmateWinner?: ChessSide
): string {
  if (evaluation.type === "mate") {
    // A final `mate 0` carries no winner: the side to move is the one mated.
    if (checkmateWinner) {
      return t(
        checkmateWinner === "white"
          ? "analyse.checkmateWhite"
          : "analyse.checkmateBlack"
      );
    }
    const moves = Math.ceil(Math.abs(evaluation.value) / 2);
    return t(
      evaluation.value >= 0 ? "analyse.mateWhite" : "analyse.mateBlack",
      { moves: String(moves) }
    );
  }
  const pawns = evaluation.value / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

function gameLine(
  game: GameSummary,
  t: TFunction,
  locale: string,
  requestedPlayer?: string
): string {
  const speed = t(`speed.${game.speed}`);
  const when = game.ongoing
    ? t("list.ongoing")
    : dateLabel(game.playedAt, locale);
  return [
    `${resultFor(game, requestedPlayer)} **${escapeMarkdown(game.white)} – ${escapeMarkdown(game.black)}**`,
    `-# ${speed} ${formatTimeControl(game.timeControl)} · ${when}`,
  ].join("\n");
}

/** The outcome is read from the account behind the request, not from White. */
function resultFor(game: GameSummary, requestedPlayer?: string): string {
  const playedAs = playerSide(game, requestedPlayer);
  if (!playedAs || game.result === "unknown") return OUTCOME_EMOJI.unknown;
  if (game.result === "draw") return OUTCOME_EMOJI.draw;
  return game.result === playedAs ? OUTCOME_EMOJI.win : OUTCOME_EMOJI.loss;
}

export function listMessage(
  session: ChessSession,
  t: TFunction,
  locale: string,
  page = session.page
) {
  const pageCount = Math.max(
    1,
    Math.ceil(session.games.length / GAMES_PER_PAGE)
  );
  const current = Math.min(Math.max(page, 1), pageCount);
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `## ${t("list.title")}`,
          t("list.subtitle", {
            source: sourceLabel(session.games[0]?.source ?? "pgn"),
            count: String(session.games.length),
          }),
        ].join("\n")
      )
    );

  const start = (current - 1) * GAMES_PER_PAGE;
  session.games.slice(start, start + GAMES_PER_PAGE).forEach((game, offset) => {
    if (offset > 0) {
      container.addSeparatorComponents((separator) =>
        separator.setDivider(true)
      );
    }
    const index = start + offset;
    const watchable =
      session.mode === "view" &&
      !!game.ongoing &&
      !!game.url &&
      (game.source === "lichess" || game.source === "chesscom");
    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(gameLine(game, t, locale, session.requestedPlayer))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(
              watchable
                ? `chess-watch:${session.id}:${index}`
                : `chess-pick:${session.id}:${index}`
            )
            .setLabel(t(watchable ? "list.watch" : "list.view"))
            .setStyle(watchable ? ButtonStyle.Success : ButtonStyle.Primary)
        )
    );
  });

  container.addActionRowComponents(
    pageRow(
      t,
      (target) => `chess-list:${session.id}:${target}`,
      current,
      pageCount,
      "list.page",
      { previousLabel: "<", nextLabel: ">" }
    )
  );

  return {
    components: [container],
    flags: EPHEMERAL_FLAGS,
    allowedMentions: NO_MENTIONS,
  };
}

/** The five movement buttons, inside the board container. */
function boardRow(session: ChessSession) {
  const total = session.parsed?.steps.length ?? 0;
  const atStart = session.ply <= 0;
  const atEnd = session.ply >= total;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`chess-nav:${session.id}:first`)
      .setLabel("⏮")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atStart),
    new ButtonBuilder()
      .setCustomId(`chess-nav:${session.id}:prev`)
      .setLabel("<")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atStart),
    new ButtonBuilder()
      .setCustomId(`chess-nav:${session.id}:flip`)
      .setLabel("⟲")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`chess-nav:${session.id}:next`)
      .setLabel(">")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atEnd),
    new ButtonBuilder()
      .setCustomId(`chess-nav:${session.id}:last`)
      .setLabel("⏭")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atEnd)
  );
}

/**
 * Game, analyse and report always sit below the container, never inside it.
 * All three stay visible; the button for the view already on screen is
 * disabled, not removed.
 */
function actionsRow(session: ChessSession, t: TFunction, current: ChessView) {
  const actions = [
    { id: "board", emoji: ACTION_EMOJIS.board, label: t("viewer.game") },
    { id: "analyse", emoji: ACTION_EMOJIS.analyse, label: t("viewer.analyse") },
    { id: "report", emoji: ACTION_EMOJIS.report, label: t("viewer.report") },
  ];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    actions.map((action) =>
      new ButtonBuilder()
        .setCustomId(`chess-action:${session.id}:${action.id}`)
        .setLabel(`${action.emoji} ${action.label}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(action.id === current)
    )
  );
}

/** The report's own row: read the same game from the opponent's side. */
function otherSideRow(session: ChessSession, t: TFunction) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`chess-action:${session.id}:opponent`)
      .setLabel(`${ACTION_EMOJIS.otherSide} ${t("report.otherSide")}`)
      .setStyle(ButtonStyle.Secondary)
  );
}

function subtitle(session: ChessSession, t: TFunction): string {
  const headers = session.parsed?.headers;
  const timeControl = headers?.get("TimeControl") ?? "";
  return t("viewer.subtitle", {
    speed: t(`speed.${speedOf(timeControl)}`),
    clock: formatTimeControl(timeControl),
    ply: String(session.ply),
    total: String(session.parsed?.steps.length ?? 0),
  });
}

function boardName(session: ChessSession): string {
  return `board-${session.id}.png`;
}

/** The selected game's summary keeps its names even without PGN tags. */
function playerName(session: ChessSession, side: ChessSide): string {
  const game = session.games[session.gameIndex ?? 0];
  const name = side === "white" ? game?.white : game?.black;
  return (
    name?.trim() ||
    session.parsed?.headers.get(side === "white" ? "White" : "Black")?.trim() ||
    "?"
  );
}

async function renderSessionBoard(session: ChessSession) {
  if (!session.parsed) throw new Error("No parsed game in this session");
  return renderBoard(
    session.parsed as ParsedGame,
    session.ply,
    session.flipped,
    session.ply > 0 ? session.analysis?.ratings[session.ply - 1] : undefined
  );
}

function analysisReadout(
  session: ChessSession,
  t: TFunction,
  analysis: GameAnalysis
): string {
  const evaluation: Evaluation = analysis.evaluations[session.ply] ?? {
    type: "cp",
    value: 0,
  };
  const position = session.parsed?.positions[session.ply];
  // Stockfish reports `mate 0` for the final position, which getWinPercent
  // reads as a White loss whatever the actual result. Recover the winner from
  // the side to move: that is the checkmated side.
  let checkmateWinner: ChessSide | undefined;
  if (evaluation.type === "mate" && evaluation.value === 0 && position) {
    const whiteToMove =
      String(position.turn) === "w" || String(position.turn) === "white";
    if (whiteToMove) checkmateWinner = "black";
    else checkmateWinner = "white";
  }
  let displayed: Evaluation = evaluation;
  if (checkmateWinner) {
    if (checkmateWinner === "white") {
      displayed = { type: "mate", value: 1 };
    } else {
      displayed = { type: "mate", value: -1 };
    }
  }
  const rating =
    session.ply > 0 ? analysis.ratings[session.ply - 1] : undefined;
  const san =
    session.ply > 0 ? session.parsed?.steps[session.ply - 1]?.san : undefined;
  let move = t("analyse.start");
  if (san) {
    let prefix = "";
    if (rating) prefix = `${ratingEmoji(rating)} `;
    move = `${prefix}${escapeMarkdown(san)}`;
  }
  return [
    `## ${t("analyse.title")}`,
    move,
    t("analyse.evaluation", {
      value: evaluationLabel(displayed, t, checkmateWinner),
    }),
    advantageGauge(displayed),
  ].join("\n");
}

/** Both board tabs share the same frame, subtitle, image and navigation. */
function boardContainer(
  session: ChessSession,
  t: TFunction,
  analysis?: GameAnalysis
): ContainerBuilder {
  const name = boardName(session);
  const white = playerName(session, "white");
  const black = playerName(session, "black");
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `## ${t("viewer.title", {
            white: escapeMarkdown(white),
            black: escapeMarkdown(black),
          })}`,
          `-# ${subtitle(session, t)}`,
        ].join("\n")
      )
    )
    .addSeparatorComponents((separator) => separator.setDivider(true))
    .addMediaGalleryComponents((media) =>
      media.addItems((item) => item.setURL(`attachment://${name}`))
    );

  if (analysis) {
    container.addSeparatorComponents((separator) => separator.setDivider(true));
    container.addTextDisplayComponents((text) =>
      text.setContent(analysisReadout(session, t, analysis))
    );
  }

  return container.addActionRowComponents(boardRow(session));
}

export async function boardMessage(
  session: ChessSession,
  t: TFunction,
  ephemeral = true
): Promise<ChessMessage> {
  const name = boardName(session);
  const image = await renderSessionBoard(session);
  // The container ends with the board; the view switchers sit below it.
  return {
    components: [boardContainer(session, t), actionsRow(session, t, "board")],
    files: [new AttachmentBuilder(image, { name })],
    flags: flagsFor(ephemeral),
    allowedMentions: NO_MENTIONS,
  };
}

/** The analysis tab keeps the board and adds the evaluation of every ply. */
export async function analyseMessage(
  session: ChessSession,
  t: TFunction,
  ephemeral = true
): Promise<ChessMessage> {
  const analysis = session.analysis;
  if (!analysis) throw new Error("No analysis in this session");
  const name = boardName(session);
  const image = await renderSessionBoard(session);
  return {
    components: [
      boardContainer(session, t, analysis),
      actionsRow(session, t, "analyse"),
    ],
    files: [new AttachmentBuilder(image, { name })],
    flags: flagsFor(ephemeral),
    allowedMentions: NO_MENTIONS,
  };
}

export function reportMessage(
  session: ChessSession,
  t: TFunction,
  ephemeral = true
): ChessMessage {
  const analysis = session.analysis;
  if (!analysis) throw new Error("No analysis in this session");
  const side = session.side;
  const player = escapeMarkdown(playerName(session, side));
  const counts = analysis.counts[side];
  const lines = counts.length
    ? counts.map((count) => {
        const label = t(`rating.${count.rating}`);
        return `${ratingEmoji(count.rating)} ${label} · ${count.count}`;
      })
    : [t("report.empty")];

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `## ${t("report.title", {
            player,
            side: t(`report.side.${side}`),
          })}`,
          t("report.accuracy", {
            value: accuracy(analysis.accuracies[side]),
          }),
        ].join("\n")
      )
    )
    .addSeparatorComponents((separator) => separator.setDivider(true))
    .addTextDisplayComponents((text) => text.setContent(lines.join("\n")))
    .addActionRowComponents(otherSideRow(session, t));

  // The other-side switch belongs to the report; only the view switchers sit
  // below its container.
  return {
    components: [container, actionsRow(session, t, "report")],
    flags: flagsFor(ephemeral),
    allowedMentions: NO_MENTIONS,
  };
}

/** Renders the tab stored on the session, or an explicit one. */
export async function chessView(
  session: ChessSession,
  t: TFunction,
  view: ChessView = session.view,
  ephemeral = true
): Promise<ChessMessage> {
  if (view === "analyse") return analyseMessage(session, t, ephemeral);
  if (view === "report") return reportMessage(session, t, ephemeral);
  return boardMessage(session, t, ephemeral);
}

export function analysingMessage(t: TFunction): ChessMessage {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents((text) => text.setContent(t("viewer.analysing")));
  return {
    components: [container],
    flags: EPHEMERAL_FLAGS,
    allowedMentions: NO_MENTIONS,
  };
}

export function preparingMessage(t: TFunction): ChessMessage {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents((text) => text.setContent(t("viewer.preparing")));
  return {
    components: [container],
    flags: EPHEMERAL_FLAGS,
    allowedMentions: NO_MENTIONS,
  };
}

export function errorMessage(
  t: TFunction,
  key: string,
  options?: Record<string, unknown>
): ChessMessage {
  const container = new ContainerBuilder()
    .setAccentColor(0xe74c3c)
    .addTextDisplayComponents((text) => text.setContent(t(key, options)));
  return {
    components: [container],
    flags: EPHEMERAL_FLAGS,
    allowedMentions: NO_MENTIONS,
  };
}
