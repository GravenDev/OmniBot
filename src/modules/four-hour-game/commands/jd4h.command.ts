import {
  AttachmentBuilder,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { fetchAvatar } from "#lib/imaging.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { renderLeaderboard } from "#modules/four-hour-game/rendering/leaderboard-image.js";
import fourHourGameService from "#modules/four-hour-game/services/four-hour-game.service.js";
import leaderboardCache from "#modules/four-hour-game/services/leaderboard-cache.service.js";
import { Colors } from "#utils/colors.js";

const LEADERBOARD_SIZE = 10;

type Config = ConfigProvider<FourHourGameConfigSchema>;

async function showScore(
  interaction: ChatInputCommandInteraction<"cached" | "raw">,
  config: Config
) {
  const user = interaction.options.getUser("member") ?? interaction.user;
  const score = await fourHourGameService.getScore(
    interaction.guildId,
    user.id
  );

  if (score === null) {
    await interaction.reply({
      content: config.t("score.none", { user: `<@${user.id}>` }),
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(config.t("score.title"))
        .setDescription(
          config.t("score.value", { user: `<@${user.id}>`, score })
        )
        .setColor(Colors.SkyBlue),
    ],
  });
}

async function buildLeaderboardImage(
  interaction: ChatInputCommandInteraction<"cached" | "raw">,
  config: Config
): Promise<Buffer | null> {
  const entries = await fourHourGameService.getLeaderboard(
    interaction.guildId,
    LEADERBOARD_SIZE
  );

  const rows = (
    await Promise.all(
      entries.map(async (entry) => {
        const user = await interaction.client.users
          .fetch(entry.userId)
          .catch(() => null);
        if (!user) {
          return null;
        }
        return {
          rank: entry.rank,
          name: user.username,
          score: entry.score,
          avatar: await fetchAvatar(user),
        };
      })
    )
  ).filter((row) => row !== null);

  if (rows.length === 0) {
    return null;
  }

  return renderLeaderboard(rows, {
    rank: config.t("leaderboard.header.rank"),
    player: config.t("leaderboard.header.player"),
    score: config.t("leaderboard.header.score"),
  });
}

async function showLeaderboard(
  interaction: ChatInputCommandInteraction<"cached" | "raw">,
  config: Config
) {
  await interaction.deferReply();

  const image = await leaderboardCache.get(
    interaction.guildId,
    config.locale,
    () => buildLeaderboardImage(interaction, config)
  );

  if (!image) {
    await interaction.editReply(config.t("leaderboard.empty"));
    return;
  }

  await interaction.editReply({
    files: [new AttachmentBuilder(image, { name: "leaderboard.png" })],
  });
}

export default declareCommand<FourHourGameConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("jd4h")
    .setDescription("Commands for the 4h game")
    .setDescriptionLocalizations({ fr: "Commandes du jeu des 4h" })
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("score")
        .setDescription("Show a member's score")
        .setDescriptionLocalizations({ fr: "Afficher le score d'un membre" })
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to look up (defaults to you)")
            .setDescriptionLocalizations({
              fr: "Membre à consulter (vous par défaut)",
            })
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("Show the 4h game leaderboard")
        .setDescriptionLocalizations({ fr: "Afficher le classement du jeu" })
    ),

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }

    switch (interaction.options.getSubcommand()) {
      case "score":
        await showScore(interaction, config);
        break;
      case "leaderboard":
        await showLeaderboard(interaction, config);
        break;
    }
  },
});
