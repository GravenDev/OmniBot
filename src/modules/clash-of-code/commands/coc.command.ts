import {
  AttachmentBuilder,
  escapeMarkdown,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { ClashOfCodeConfigSchema } from "#modules/clash-of-code/clash-of-code.config.js";
import { leaderboardMessage } from "#modules/clash-of-code/interactions/leaderboard-page.button.js";
import {
  CLASH_MODES,
  isClashMode,
} from "#modules/clash-of-code/services/api.js";
import store from "#modules/clash-of-code/services/store.js";
import {
  profileCard,
  type ViewContext,
} from "#modules/clash-of-code/services/views.js";

const AUTOCOMPLETE_LIMIT = 25;
const NICKNAME_MAX_LENGTH = 64;

const logger = loggerMaker("clash-of-code");

type Interaction = ChatInputCommandInteraction<"cached" | "raw">;
type Config = ConfigProvider<ClashOfCodeConfigSchema>;

const ephemeral = { flags: MessageFlags.Ephemeral } as const;
const noPings = { allowedMentions: NO_MENTIONS } as const;

function viewContext(interaction: Interaction, config: Config): ViewContext {
  return {
    client: interaction.client,
    guildId: interaction.guildId,
    t: config.t,
    locale: config.locale,
  };
}

async function leaderboard(interaction: Interaction, config: Config) {
  const mode = interaction.options.getString("mode");
  await interaction.deferReply();
  await interaction.editReply(
    await leaderboardMessage(
      viewContext(interaction, config),
      isClashMode(mode) ? mode : null,
      interaction.options.getInteger("page") ?? 1,
      interaction.user.id,
      "public"
    )
  );
}

async function profile(interaction: Interaction, config: Config) {
  const member = interaction.options.getUser("member");
  const nickname = interaction.options.getString("player");
  if (member && nickname) {
    await interaction.reply({
      content: config.t("profile.bothOptions"),
      ...ephemeral,
    });
    return;
  }
  const self = !nickname && (!member || member.id === interaction.user.id);
  const player = nickname
    ? await store.playerByNickname(interaction.guildId, nickname)
    : await store.playerByUser(
        interaction.guildId,
        (member ?? interaction.user).id
      );
  if (!player) {
    await interaction.reply({
      content: nickname
        ? config.t("profile.unknownPlayer", {
            player: escapeMarkdown(nickname),
          })
        : self
          ? config.t("profile.notLinkedSelf")
          : config.t("profile.notLinked", { user: `<@${member!.id}>` }),
      ...ephemeral,
      ...noPings,
    });
    return;
  }

  await interaction.deferReply();
  const image = await profileCard(viewContext(interaction, config), player);
  await interaction.editReply(
    image
      ? { files: [new AttachmentBuilder(image, { name: "profile.png" })] }
      : { content: config.t("profile.noGames") }
  );
}

async function link(interaction: Interaction, config: Config) {
  const { guildId } = interaction;
  const userId = interaction.user.id;
  const nickname = interaction.options.getString("player", true).trim();
  const player = await store.playerByNickname(guildId, nickname);
  if (!player) {
    await interaction.reply({
      content: config.t("link.unknownPlayer", {
        player: escapeMarkdown(nickname),
      }),
      ...ephemeral,
    });
    return;
  }

  const outcome = await store.link(guildId, userId, player.codingamerId);
  const name = escapeMarkdown(player.nickname);
  switch (outcome.kind) {
    case "conflict":
      await interaction.reply({
        content: config.t("link.conflict", {
          player: name,
          user: `<@${outcome.userId}>`,
        }),
        ...ephemeral,
        ...noPings,
      });
      return;
    case "unknown":
      await interaction.reply({
        content: config.t("link.unknownPlayer", { player: name }),
        ...ephemeral,
      });
      return;
    default:
      logger.info(
        `Account ${outcome.kind} | guildId = ${guildId} | userId = ${userId} | codingamerId = ${player.codingamerId}`
      );
      await interaction.reply({
        content: config.t(
          outcome.kind === "unchanged" ? "link.unchanged" : "link.linked",
          { player: name }
        ),
        ...ephemeral,
      });
  }
}

async function unlink(interaction: Interaction, config: Config) {
  const nickname = await store.unlink(interaction.guildId, interaction.user.id);
  if (nickname) {
    logger.info(
      `Account unlinked | guildId = ${interaction.guildId} | userId = ${interaction.user.id}`
    );
  }
  await interaction.reply({
    content: nickname
      ? config.t("unlink.done", { player: escapeMarkdown(nickname) })
      : config.t("unlink.none"),
    ...ephemeral,
  });
}

const subcommands: Record<
  string,
  (interaction: Interaction, config: Config) => Promise<void>
> = { leaderboard, profile, link, unlink };

const modeChoices = [
  {
    name: "All modes",
    name_localizations: { fr: "Tous les modes" },
    value: "all",
  },
  ...CLASH_MODES.map((mode) => ({
    name: mode.charAt(0) + mode.slice(1).toLowerCase(),
    value: mode,
  })),
];

export default declareCommand<ClashOfCodeConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("coc")
    .setDescription("Clash of Code leaderboards and profiles")
    .setDescriptionLocalizations({
      fr: "Classements et profils Clash of Code",
    })
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("Show the server's wins leaderboard")
        .setDescriptionLocalizations({
          fr: "Afficher le classement des victoires du serveur",
        })
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("Only count games of this mode")
            .setDescriptionLocalizations({
              fr: "Ne compter que les parties de ce mode",
            })
            .addChoices(...modeChoices)
        )
        .addIntegerOption((option) =>
          option
            .setName("page")
            .setDescription("Page number")
            .setDescriptionLocalizations({ fr: "Numéro de page" })
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("profile")
        .setDescription("Show a player's profile")
        .setDescriptionLocalizations({ fr: "Afficher le profil d'un joueur" })
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to look up (defaults to you)")
            .setDescriptionLocalizations({
              fr: "Membre à consulter (vous par défaut)",
            })
        )
        .addStringOption((option) =>
          option
            .setName("player")
            .setDescription("CodinGame nickname to look up")
            .setDescriptionLocalizations({ fr: "Pseudo CodinGame à consulter" })
            .setMaxLength(NICKNAME_MAX_LENGTH)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("link")
        .setDescription("Link your CodinGame account")
        .setDescriptionLocalizations({ fr: "Lier votre compte CodinGame" })
        .addStringOption((option) =>
          option
            .setName("player")
            .setDescription("Your CodinGame nickname, as seen in a game")
            .setDescriptionLocalizations({
              fr: "Votre pseudo CodinGame, tel qu'il apparaît dans une partie",
            })
            .setMaxLength(NICKNAME_MAX_LENGTH)
            .setAutocomplete(true)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("unlink")
        .setDescription("Unlink your CodinGame account")
        .setDescriptionLocalizations({ fr: "Délier votre compte CodinGame" })
    ),

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }
    await subcommands[interaction.options.getSubcommand()]?.(
      interaction,
      config
    );
  },

  async complete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const players = interaction.guildId
      ? await store.players(interaction.guildId)
      : [];
    await interaction.respond(
      players
        .filter((player) => player.nickname.toLowerCase().includes(typed))
        .slice(0, AUTOCOMPLETE_LIMIT)
        .map((player) => ({ name: player.nickname, value: player.nickname }))
    );
  },
});
