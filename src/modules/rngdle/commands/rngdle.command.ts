import {
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { overallPageComponents } from "#modules/rngdle/interactions/overall-page.button.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";
import {
  buildDailyLeaderboard,
  buildProfile,
  buildServerStats,
  cachedOverallPage,
  utcDayRange,
} from "#modules/rngdle/services/boards.js";
import imageCache from "#modules/rngdle/services/image-cache.service.js";
import rngdleService from "#modules/rngdle/services/rngdle.service.js";
import syncService from "#modules/rngdle/services/sync.service.js";
import { replyWithError } from "./replies.js";

const logger = loggerMaker("rngdle");

type Config = ConfigProvider<RngdleConfigSchema>;
type GuildCommand = ChatInputCommandInteraction<"cached" | "raw">;

const AUTOCOMPLETE_LIMIT = 25;

function attachment(image: Buffer, name: string) {
  return [new AttachmentBuilder(image, { name })];
}

async function showToday(interaction: GuildCommand, config: Config) {
  await interaction.deferReply();
  await syncService.syncGuildIfStale(interaction.guildId);

  const range = utcDayRange(0);
  const board = await imageCache.get(
    interaction.guildId,
    `daily:${config.locale}:${range[0].toISOString()}`,
    () =>
      buildDailyLeaderboard(
        interaction.client,
        interaction.guildId,
        range,
        config.t
      )
  );
  if (!board) {
    await interaction.editReply(config.t("leaderboard.empty"));
    return;
  }
  await interaction.editReply({
    files: attachment(board.image, "leaderboard.png"),
  });
}

async function showProfile(interaction: GuildCommand, config: Config) {
  const member = interaction.options.getUser("member");
  const username = interaction.options.getString("username");
  if (member && username) {
    await interaction.reply({
      content: config.t("profile.bothOptions"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const account = username
    ? await rngdleService.findAccountByUsername(interaction.guildId, username)
    : await rngdleService.getAccount(
        interaction.guildId,
        (member ?? interaction.user).id
      );
  if (!account) {
    await interaction.reply({
      content: config.t("profile.notRegistered"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  await syncService.syncGuildIfStale(interaction.guildId);

  const user = await interaction.client.users
    .fetch(account.userId)
    .catch(() => null);
  if (!user) {
    await interaction.editReply(config.t("profile.notRegistered"));
    return;
  }

  const image = await imageCache.get(
    interaction.guildId,
    `profile:${config.locale}:${account.userId}`,
    () => buildProfile(account, user, config.t, config.locale)
  );
  if (!image) {
    await interaction.editReply(
      config.t("profile.noRolls", { username: account.username })
    );
    return;
  }
  await interaction.editReply({
    files: attachment(image, `profile-${account.username}.png`),
  });
}

async function showServerStats(interaction: GuildCommand, config: Config) {
  await interaction.deferReply();
  await syncService.syncGuildIfStale(interaction.guildId);

  const guild =
    interaction.guild ??
    (await interaction.client.guilds.fetch(interaction.guildId));
  const image = await imageCache.get(
    interaction.guildId,
    `server:${config.locale}`,
    () => buildServerStats(interaction.client, guild, config.t)
  );
  if (!image) {
    await interaction.editReply(config.t("server.empty"));
    return;
  }
  await interaction.editReply({ files: attachment(image, "server-stats.png") });
}

async function showOverall(interaction: GuildCommand, config: Config) {
  await interaction.deferReply();
  await syncService.syncGuildIfStale(interaction.guildId);

  const result = await cachedOverallPage(
    interaction.client,
    interaction.guildId,
    interaction.options.getInteger("page") ?? 1,
    interaction.user.id,
    config.t,
    config.locale
  );
  if (!result) {
    await interaction.editReply(config.t("overall.empty"));
    return;
  }
  await interaction.editReply({
    files: attachment(result.image, "leaderboard.png"),
    components: overallPageComponents(
      result.page,
      result.pageCount,
      "public",
      config.t
    ),
  });
}

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

    try {
      switch (interaction.options.getSubcommand()) {
        case "leaderboard":
          await showToday(interaction, config);
          break;
        case "profile":
          await showProfile(interaction, config);
          break;
        case "server-stats":
          await showServerStats(interaction, config);
          break;
        case "leaderboard-all":
          await showOverall(interaction, config);
          break;
      }
    } catch (err) {
      logger.error(
        { err },
        `RNGdle command failed | guildId = ${interaction.guildId}`
      );
      await replyWithError(interaction, config.t("error.generic"));
    }
  },

  async complete(interaction) {
    if (!interaction.inGuild()) {
      await interaction.respond([]);
      return;
    }
    const typed = interaction.options.getFocused().toLowerCase();
    const accounts = await rngdleService.listAccounts(interaction.guildId);
    await interaction.respond(
      accounts
        .filter((account) => account.username.toLowerCase().includes(typed))
        .slice(0, AUTOCOMPLETE_LIMIT)
        .map((account) => ({ name: account.username, value: account.username }))
    );
  },
});
