import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  escapeMarkdown,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { renderBoard } from "../rendering/board.js";
import { formatTimeControl, speedOf } from "../speed.js";
import type { GameResult } from "../types.js";
import { EPHEMERAL_FLAGS, PUBLIC_FLAGS, type ChessMessage } from "../views.js";
import { gameFromUci, moveNotation } from "./moves.js";
import type { LiveAction, LiveGame } from "./types.js";

const ACCENT = 0x4a90e2;
const RESULT_ACCENTS: Record<GameResult, number> = {
  white: 0xeeeeee,
  black: 0x111111,
  draw: 0xffa500,
  unknown: ACCENT,
};
const RESULT_ICONS: Record<GameResult, string> = {
  white: "🏆",
  black: "🏆",
  draw: "🤝",
  unknown: "❔",
};

export function liveNavId(
  game: LiveGame,
  action: LiveAction,
  ply: number,
  ephemeral: boolean
): string {
  return `chess-live:${game.id}:${action}:${ephemeral ? "e" : "m"}:${ply}`;
}

function navRow(game: LiveGame, ply: number, ephemeral: boolean) {
  const total = game.moves.length;
  const actions: LiveAction[] = ["first", "prev", "next", "last"];
  const labels = ["⏮", "<", ">", "⏭"];
  const disabled = [ply <= 0, ply <= 0, ply >= total, ply >= total];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    actions.map((action, index) =>
      new ButtonBuilder()
        .setCustomId(liveNavId(game, action, ply, ephemeral))
        .setLabel(labels[index]!)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled[index]!)
    )
  );
}

export function liveStopId(game: LiveGame): string {
  return `chess-live-stop:${game.id}`;
}

/**
 * The site link stays available on the public watch and on private copies;
 * a watch still running also offers to stop it.
 */
function siteRow(game: LiveGame, t: TFunction, stoppable: boolean) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(t("live.site"))
      .setStyle(ButtonStyle.Link)
      .setURL(game.url)
  );
  if (stoppable) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(liveStopId(game))
        .setLabel(t("live.stop"))
        .setStyle(ButtonStyle.Danger)
    );
  }
  return row;
}

/**
 * The public message follows the game: the watcher edits it when a move is
 * played. A member navigating from it gets an ephemeral snapshot, whose own
 * buttons only browse that copy: it is never updated by the watcher.
 */
export async function liveMessage(
  game: LiveGame,
  t: TFunction,
  ply = game.ply,
  ephemeral = true,
  stopped = false
): Promise<ChessMessage> {
  const headers = game.startFen
    ? new Map([["FEN", game.startFen]])
    : new Map<string, string>();
  const parsed = gameFromUci(game.moves, headers) ?? {
    headers: new Map<string, string>(),
    positions: [],
    steps: [],
    variant: "chess" as const,
    result: "unknown" as const,
  };
  const name = `live-${game.id}.png`;
  const image = await renderBoard(parsed, ply, game.flipped);
  const count = parsed.steps.length;
  const current = Math.min(Math.max(ply, 0), count);
  const moves = moveNotation(parsed.steps, current);

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `## ${t("viewer.title", {
            white: escapeMarkdown(game.white),
            black: escapeMarkdown(game.black),
          })}`,
          `-# ${t("viewer.subtitle", {
            speed: t(`speed.${speedOf(game.timeControl)}`),
            clock: formatTimeControl(game.timeControl),
            ply: String(current),
            total: String(count),
          })}`,
        ].join("\n")
      )
    )
    .addSeparatorComponents((separator) => separator.setDivider(true))
    .addMediaGalleryComponents((media) =>
      media.addItems((item) => item.setURL(`attachment://${name}`))
    );
  if (moves) {
    container
      .addSeparatorComponents((separator) => separator.setDivider(true))
      .addTextDisplayComponents((text) => text.setContent(moves));
  }

  // A finished or stopped watch is gone from the database: its buttons would
  // only answer that the session expired.
  const over = game.finished || stopped;
  const components: ChessMessage["components"] = [
    over
      ? container
      : container.addActionRowComponents(navRow(game, current, ephemeral)),
  ];
  if (!ephemeral) {
    // Only the public watch follows the game. A private copy is a snapshot the
    // member browses, so it carries no live status to go stale.
    let status = `**${t("live.started")}**`;
    if (stopped) {
      status = `## ${t("live.stopped")}`;
    } else if (game.finished) {
      const result = t(`live.result.${game.result}`);
      status = [
        `## ${t("live.finished")}`,
        `**${RESULT_ICONS[game.result]} ${result}**`,
      ].join("\n");
    }
    components.push(
      new ContainerBuilder()
        .setAccentColor(game.finished ? RESULT_ACCENTS[game.result] : ACCENT)
        .addTextDisplayComponents((text) => text.setContent(status))
    );
  }
  components.push(siteRow(game, t, !ephemeral && !over));

  return {
    components,
    files: [new AttachmentBuilder(image, { name })],
    flags: ephemeral ? EPHEMERAL_FLAGS : PUBLIC_FLAGS,
    allowedMentions: NO_MENTIONS,
  };
}
