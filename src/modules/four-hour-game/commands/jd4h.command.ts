import {
  AttachmentBuilder,
  GuildMember,
  InteractionContextType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { fetchImage } from "#lib/imaging.js";
import { resolvePlayers } from "#lib/players.js";
import { RevisionCache } from "#lib/revision-cache.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { renderLeaderboard } from "#modules/four-hour-game/rendering/leaderboard-image.js";
import { renderProfileCard } from "#modules/four-hour-game/rendering/profile-card.js";
import fourHourGameService from "#modules/four-hour-game/services/four-hour-game.service.js";

const LEADERBOARD_SIZE = 10;

const leaderboardCache = new RevisionCache(15_000);
const profileCache = new RevisionCache(15_000);

type Config = ConfigProvider<FourHourGameConfigSchema>;
type Board = "hold" | "daily";

async function showScore(
  interaction: ChatInputCommandInteraction<"cached" | "raw">,
  config: Config
) {
  const option = interaction.options.getUser("member");
  const user = option ?? interaction.user;
  const member = option
    ? interaction.options.getMember("member")
    : interaction.member;
  const shown = member instanceof GuildMember ? member : user;

  await interaction.deferReply();

  const image = await profileCache.get(
    `${interaction.guildId}:${config.locale}:${user.id}`,
    fourHourGameService.getRevision(interaction.guildId),
    async () => {
      const profile = await fourHourGameService.getProfile(
        interaction.guildId,
        user.id
      );
      if (!profile) {
        return null;
      }
      const avatar = await fetchImage(
        shown.displayAvatarURL({ extension: "png", size: 128 })
      );
      return renderProfileCard(
        profile,
        { name: shown.displayName, avatar },
        config.t,
        config.locale
      );
    }
  );

  if (!image) {
    await interaction.editReply({
      content: config.t("score.none", { user: `<@${user.id}>` }),
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.editReply({
    files: [new AttachmentBuilder(image, { name: "profile.png" })],
  });
}

async function buildLeaderboardImage(
  interaction: ChatInputCommandInteraction<"cached" | "raw">,
  config: Config,
  board: Board
): Promise<Buffer | null> {
  const entries =
    board === "daily"
      ? (
          await fourHourGameService.getDailyStandings(interaction.guildId)
        ).slice(0, LEADERBOARD_SIZE)
      : await fourHourGameService.getLeaderboard(
          interaction.guildId,
          LEADERBOARD_SIZE
        );

  const players = await resolvePlayers(
    interaction.client,
    interaction.guildId,
    entries.map((entry) => entry.userId)
  );
  const rows = entries.flatMap((entry) => {
    const player = players.get(entry.userId);
    return player
      ? [
          {
            rank: entry.rank,
            name: player.name,
            score: entry.score,
            avatar: player.avatar,
          },
        ]
      : [];
  });

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
  const board: Board =
    interaction.options.getString("type") === "daily" ? "daily" : "hold";
  await interaction.deferReply();

  const image = await leaderboardCache.get(
    `${interaction.guildId}:${config.locale}:${board}`,
    fourHourGameService.getRevision(interaction.guildId),
    () => buildLeaderboardImage(interaction, config, board)
  );

  if (!image) {
    await interaction.editReply(
      config.t(
        board === "daily" ? "leaderboard.daily.empty" : "leaderboard.empty"
      )
    );
    return;
  }

  await interaction.editReply({
    ...(board === "daily" && { content: config.t("leaderboard.daily.title") }),
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
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Which points to rank (defaults to 4h points)")
            .setDescriptionLocalizations({
              fr: "Points à classer (points des 4h par défaut)",
            })
            .addChoices(
              {
                name: "4h points",
                name_localizations: { fr: "Points des 4h" },
                value: "hold",
              },
              {
                name: "Daily points",
                name_localizations: { fr: "Points du jour" },
                value: "daily",
              }
            )
        )
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
