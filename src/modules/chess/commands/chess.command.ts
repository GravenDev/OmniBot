import {
  InteractionContextType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type SlashCommandSubcommandGroupBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { replyEphemeral } from "#lib/reply.js";
import { startListFlow } from "../flows.js";
import {
  fetchChesscomGames,
  fetchGameFromUrl,
  fetchLichessGames,
} from "../games/fetch.js";
import { gameFromUrl, gameFromUsername } from "../live/sources.js";
import { startWatchFlow, watchRefusal } from "../live/watch.js";
import store from "../services/session.service.js";
import { RateLimitedError } from "../services/site-requests.service.js";
import type { ChessMode, ChessSide, GameSummary } from "../types.js";
import { editable, errorMessage } from "../views.js";

const logger = loggerMaker("chess");

export const PGN_MODAL_ID = "chess-pgn";
export const PGN_FIELD_IDS = ["pgn1", "pgn2", "pgn3", "pgn4", "pgn5"] as const;

const MODES: Record<ChessMode, { en: string; fr: string }> = {
  view: {
    en: "Watch the game on an image board",
    fr: "Regarder la partie sur un échiquier",
  },
  report: {
    en: "Get a classification report",
    fr: "Obtenir un rapport de classification",
  },
  analyse: {
    en: "Analyse the game move by move",
    fr: "Analyser la partie coup par coup",
  },
};
const MODE_VALUES = ["view", "report", "analyse"] as const;

const SOURCES = {
  lichess: { en: "A Lichess account", fr: "Un compte Lichess" },
  chesscom: { en: "A Chess.com account", fr: "Un compte Chess.com" },
  url: { en: "A game URL", fr: "Une URL de partie" },
  pgn: { en: "Paste a PGN", fr: "Coller un PGN" },
} as const;

function addModeOption(command: SlashCommandSubcommandBuilder) {
  command.addStringOption((option) =>
    option
      .setName("mode")
      .setDescription("What to do with the game")
      .setDescriptionLocalizations({ fr: "Action à appliquer à la partie" })
      .setRequired(false)
      .addChoices(
        ...MODE_VALUES.map((value) => ({
          name: MODES[value].en,
          name_localizations: { fr: MODES[value].fr },
          value,
        }))
      )
  );
}

function addSideOption(command: SlashCommandSubcommandBuilder) {
  command.addStringOption((option) =>
    option
      .setName("side")
      .setDescription("Side shown in the report")
      .setDescriptionLocalizations({ fr: "Camp affiché dans le rapport" })
      .setRequired(false)
      .addChoices(
        { name: "White", value: "white" },
        { name: "Black", value: "black" }
      )
  );
}

function sourceCommands(group: SlashCommandSubcommandGroupBuilder) {
  const lichess = new SlashCommandSubcommandBuilder()
    .setName("lichess")
    .setDescription(SOURCES.lichess.en)
    .setDescriptionLocalizations({ fr: SOURCES.lichess.fr })
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Lichess username")
        .setDescriptionLocalizations({ fr: "Pseudo Lichess" })
        .setRequired(true)
    );
  const chesscom = new SlashCommandSubcommandBuilder()
    .setName("chesscom")
    .setDescription(SOURCES.chesscom.en)
    .setDescriptionLocalizations({ fr: SOURCES.chesscom.fr })
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Chess.com username")
        .setDescriptionLocalizations({ fr: "Pseudo Chess.com" })
        .setRequired(true)
    );
  const url = new SlashCommandSubcommandBuilder()
    .setName("url")
    .setDescription(SOURCES.url.en)
    .setDescriptionLocalizations({ fr: SOURCES.url.fr })
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("Lichess or Chess.com game URL")
        .setDescriptionLocalizations({
          fr: "URL d'une partie Lichess ou Chess.com",
        })
        .setRequired(true)
    );
  const pgn = new SlashCommandSubcommandBuilder()
    .setName("pgn")
    .setDescription(SOURCES.pgn.en)
    .setDescriptionLocalizations({ fr: SOURCES.pgn.fr });

  // The side is only needed for a report on an imported game. Discord cannot
  // make an option required conditionally, so the command checks it at runtime.
  for (const command of [lichess, chesscom, url, pgn]) addModeOption(command);
  for (const command of [url, pgn]) addSideOption(command);

  group.addSubcommand(lichess);
  group.addSubcommand(chesscom);
  group.addSubcommand(url);
  group.addSubcommand(pgn);
}

/** `/chess watch` is a separate command: a live game is not an analysis mode. */
function addWatchCommands(group: SlashCommandSubcommandGroupBuilder) {
  for (const name of ["lichess", "chesscom"] as const) {
    group.addSubcommand(
      new SlashCommandSubcommandBuilder()
        .setName(name)
        .setDescription(SOURCES[name].en)
        .setDescriptionLocalizations({ fr: SOURCES[name].fr })
        .addStringOption((option) =>
          option
            .setName("username")
            .setDescription(
              `${name === "lichess" ? "Lichess" : "Chess.com"} username`
            )
            .setDescriptionLocalizations({
              fr: `Pseudo ${name === "lichess" ? "Lichess" : "Chess.com"}`,
            })
            .setRequired(true)
        )
    );
  }
  group.addSubcommand(
    new SlashCommandSubcommandBuilder()
      .setName("url")
      .setDescription(SOURCES.url.en)
      .setDescriptionLocalizations({ fr: SOURCES.url.fr })
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription("Lichess or Chess.com game URL")
          .setDescriptionLocalizations({
            fr: "URL d'une partie Lichess ou Chess.com",
          })
          .setRequired(true)
      )
  );
}

const data = new SlashCommandBuilder()
  .setName("chess")
  .setDescription("Watch and analyse chess games")
  .setDescriptionLocalizations({
    fr: "Regarder et analyser des parties d'échecs",
  })
  .setContexts([InteractionContextType.Guild]);

data.addSubcommandGroup((group) => {
  group
    .setName("view")
    .setDescription("Watch, analyse or report chess games")
    .setDescriptionLocalizations({
      fr: "Regarder, analyser ou rapporter des parties d'échecs",
    });
  sourceCommands(group);
  return group;
});

data.addSubcommandGroup((group) => {
  group
    .setName("watch")
    .setDescription("Follow a game in progress")
    .setDescriptionLocalizations({
      fr: "Suivre une partie en cours",
    });
  addWatchCommands(group);
  return group;
});

function pgnModal(mode: ChessMode, side: ChessSide, locale: string) {
  const modal = new ModalBuilder()
    .setCustomId(`${PGN_MODAL_ID}:${mode}:${side}`)
    .setTitle(locale === "fr" ? "Coller une partie PGN" : "Paste a game PGN");

  PGN_FIELD_IDS.forEach((id, index) => {
    modal.addLabelComponents(
      new LabelBuilder({ label: `PGN ${index + 1}` }).setTextInputComponent(
        new TextInputBuilder()
          .setCustomId(id)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(
            locale === "fr"
              ? "Collez jusqu'à 4000 caractères par champ."
              : "Paste up to 4000 characters per field."
          )
          .setMaxLength(4000)
          .setRequired(index === 0)
      )
    );
  });
  return modal;
}

/** A busy site is not a wrong URL or an unknown player. */
function fetchErrorKey(error: unknown, subcommand: string): string {
  if (error instanceof RateLimitedError) return "error.rateLimited";
  return subcommand === "url" ? "error.url" : "error.user";
}

async function fetchGames(
  subcommand: string,
  interaction: ChatInputCommandInteraction
): Promise<{ games: GameSummary[]; requestedPlayer?: string }> {
  if (subcommand === "lichess" || subcommand === "chesscom") {
    const requestedPlayer = interaction.options.getString("username", true);
    const games =
      subcommand === "lichess"
        ? await fetchLichessGames(requestedPlayer)
        : await fetchChesscomGames(requestedPlayer);
    return { games, requestedPlayer };
  }
  return {
    games: [await fetchGameFromUrl(interaction.options.getString("url", true))],
  };
}

async function startWatch(
  interaction: ChatInputCommandInteraction,
  config: ConfigProvider<{}>
): Promise<void> {
  const subcommand = interaction.options.getSubcommand(true);
  if (
    subcommand === "pgn" ||
    !["lichess", "chesscom", "url"].includes(subcommand)
  ) {
    await replyEphemeral(interaction, config.t("error.invalid"));
    return;
  }
  const guildId = interaction.guildId;
  if (!guildId) {
    await replyEphemeral(interaction, config.t("error.invalid"));
    return;
  }

  const refusal = await watchRefusal(interaction, config.t);
  if (refusal) {
    await replyEphemeral(interaction, refusal);
    return;
  }

  const requestedPlayer =
    subcommand === "url"
      ? undefined
      : interaction.options.getString("username", true);
  // The command's own response is the public watch: its buttons are the ones
  // that open a private copy.
  await interaction.deferReply();
  try {
    const snapshot = requestedPlayer
      ? await gameFromUsername(
          subcommand as "lichess" | "chesscom",
          requestedPlayer
        )
      : await gameFromUrl(interaction.options.getString("url", true));
    if (!snapshot) {
      await interaction.editReply(
        editable(errorMessage(config.t, "live.noGame"))
      );
      return;
    }

    await startWatchFlow(snapshot, {
      guildId,
      channelId: interaction.channelId,
      ownerId: interaction.user.id,
      requestedPlayer,
      t: config.t,
      send: (message) => interaction.editReply(message),
    });
  } catch (error) {
    logger.error({ err: error }, "Chess live watch failed");
    await interaction.editReply(
      editable(errorMessage(config.t, fetchErrorKey(error, subcommand)))
    );
  }
}

export default declareCommand<{}>({
  data,
  async execute(interaction, config) {
    const group = interaction.options.getSubcommandGroup(false);
    if (group === "watch") {
      await startWatch(interaction, config);
      return;
    }
    const rawMode = interaction.options.getString("mode") ?? "view";
    if (
      group !== "view" ||
      !(MODE_VALUES as readonly string[]).includes(rawMode)
    ) {
      await replyEphemeral(interaction, config.t("error.invalid"));
      return;
    }
    const mode = rawMode as ChessMode;
    const subcommand = interaction.options.getSubcommand(true);
    const imported = subcommand === "url" || subcommand === "pgn";
    const rawSide = interaction.options.getString("side");
    if (mode === "report" && imported && !rawSide) {
      await replyEphemeral(interaction, config.t("error.side"));
      return;
    }
    const side: ChessSide =
      rawSide === "white" || rawSide === "black" ? rawSide : "white";

    if (subcommand === "pgn") {
      await interaction.showModal(pgnModal(mode, side, config.locale));
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const { games, requestedPlayer } = await fetchGames(
        subcommand,
        interaction
      );
      if (games.length === 0) {
        await interaction.editReply(
          editable(errorMessage(config.t, "error.noGames"))
        );
        return;
      }
      const session = store.create(
        interaction.user.id,
        mode,
        side,
        games,
        requestedPlayer
      );
      await startListFlow(interaction, session, config);
    } catch (error) {
      logger.error({ err: error }, "Chess game fetch failed");
      await interaction.editReply(
        editable(errorMessage(config.t, fetchErrorKey(error, subcommand)))
      );
    }
  },
});
