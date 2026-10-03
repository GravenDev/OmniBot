import {
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { overallPageMessage } from "#modules/rngdle/interactions/overall-page.button.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";
import store from "#modules/rngdle/services/store.js";
import sync from "#modules/rngdle/services/sync.js";
import {
  dailyLeaderboard,
  profileCard,
  serverCard,
  type ViewContext,
} from "#modules/rngdle/services/views.js";

const AUTOCOMPLETE_LIMIT = 25;

type Interaction = ChatInputCommandInteraction<"cached" | "raw">;
type Config = ConfigProvider<RngdleConfigSchema>;

function viewContext(interaction: Interaction, config: Config): ViewContext {
  return {
    client: interaction.client,
    guildId: interaction.guildId,
    t: config.t,
    locale: config.locale,
  };
}

async function replyWithImage(
  interaction: Interaction,
  image: Buffer | null,
  name: string,
  emptyMessage: string
) {
  await interaction.editReply(
    image
      ? { files: [new AttachmentBuilder(image, { name })] }
      : { content: emptyMessage }
  );
}

async function leaderboard(interaction: Interaction, config: Config) {
  const board = await dailyLeaderboard(viewContext(interaction, config), 0);
  await replyWithImage(
    interaction,
    board?.image ?? null,
    "leaderboard.png",
    config.t("leaderboard.empty")
  );
}

async function profile(interaction: Interaction, config: Config) {
  const account = interaction.options.getString("username")
    ? await store.accountByUsername(
        interaction.guildId,
        interaction.options.getString("username", true)
      )
    : await store.account(
        interaction.guildId,
        (interaction.options.getUser("member") ?? interaction.user).id
      );
  if (!account) {
    await interaction.editReply(config.t("profile.notRegistered"));
    return;
  }
  await replyWithImage(
    interaction,
    await profileCard(viewContext(interaction, config), account),
    `profile-${account.username}.png`,
    config.t("profile.noRolls", { username: account.username })
  );
}

async function serverStats(interaction: Interaction, config: Config) {
  const guild =
    interaction.guild ??
    (await interaction.client.guilds.fetch(interaction.guildId));
  await replyWithImage(
    interaction,
    await serverCard(viewContext(interaction, config), guild),
    "server-stats.png",
    config.t("server.empty")
  );
}

async function leaderboardAll(interaction: Interaction, config: Config) {
  await interaction.editReply(
    await overallPageMessage(
      viewContext(interaction, config),
      interaction.options.getInteger("page") ?? 1,
      interaction.user.id,
      "public"
    )
  );
}

const subcommands: Record<
  string,
  (interaction: Interaction, config: Config) => Promise<void>
> = {
  leaderboard,
  profile,
  "server-stats": serverStats,
  "leaderboard-all": leaderboardAll,
};

export default declareCommand<RngdleConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("rngdle")
    .setDescription("RNGdle leaderboards and statistics")
    .setDescriptionLocalizations({ fr: "Classements et statistiques RNGdle" })
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("Show today's leaderboard")
        .setDescriptionLocalizations({ fr: "Afficher le classement du jour" })
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
            .setName("username")
            .setDescription("RNGdle username to look up")
            .setDescriptionLocalizations({ fr: "Pseudo RNGdle à consulter" })
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("server-stats")
        .setDescription("Show the server's statistics")
        .setDescriptionLocalizations({
          fr: "Afficher les statistiques du serveur",
        })
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard-all")
        .setDescription("Show the all-time leaderboard")
        .setDescriptionLocalizations({ fr: "Afficher le classement général" })
        .addIntegerOption((option) =>
          option
            .setName("page")
            .setDescription("Page number")
            .setDescriptionLocalizations({ fr: "Numéro de page" })
            .setMinValue(1)
        )
    ),

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }
    if (
      interaction.options.getUser("member") &&
      interaction.options.getString("username")
    ) {
      await interaction.reply({
        content: config.t("profile.bothOptions"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();
    await sync.refreshIfStale(interaction.guildId);
    await subcommands[interaction.options.getSubcommand()]?.(
      interaction,
      config
    );
  },

  async complete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const accounts = interaction.guildId
      ? await store.accounts(interaction.guildId)
      : [];
    await interaction.respond(
      accounts
        .filter((account) => account.username.toLowerCase().includes(typed))
        .slice(0, AUTOCOMPLETE_LIMIT)
        .map((account) => ({ name: account.username, value: account.username }))
    );
  },
});
