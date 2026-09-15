import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import imcService, { categoryForBmi } from "../services/imc.service.js";

const DEFAULT_LEADERBOARD_LIMIT = 10;
const MAX_LEADERBOARD_LIMIT = 25;

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("imc")
    .setDescription("Record your BMI and view the server leaderboard")
    .setDescriptionLocalizations({
      fr: "Enregistrer votre IMC et voir le classement du serveur",
    })
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("record")
        .setDescription("Record your weight and height to compute your BMI")
        .setDescriptionLocalizations({
          fr: "Enregistrer votre poids et taille pour calculer votre IMC",
        })
        .addNumberOption((option) =>
          option
            .setName("weight")
            .setDescription("Weight in kilograms (e.g. 70)")
            .setDescriptionLocalizations({
              fr: "Poids en kilogrammes (ex. 70)",
            })
            .setRequired(true)
            .setMinValue(20)
            .setMaxValue(300)
        )
        .addNumberOption((option) =>
          option
            .setName("height")
            .setDescription("Height in centimeters (e.g. 175)")
            .setDescriptionLocalizations({
              fr: "Taille en centimètres (ex. 175)",
            })
            .setRequired(true)
            .setMinValue(50)
            .setMaxValue(250)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("Show the recorded BMI of a member")
        .setDescriptionLocalizations({
          fr: "Afficher l'IMC enregistré d'un membre",
        })
        .addUserOption((option) =>
          option
            .setName("target")
            .setDescription("Member to inspect (defaults to yourself)")
            .setDescriptionLocalizations({
              fr: "Membre à consulter (vous-même par défaut)",
            })
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("Show the server ranking by BMI (descending)")
        .setDescriptionLocalizations({
          fr: "Afficher le classement du serveur par IMC décroissant",
        })
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of entries to show (default 10, max 25)")
            .setDescriptionLocalizations({
              fr: "Nombre d'entrées à afficher (défaut 10, max 25)",
            })
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(MAX_LEADERBOARD_LIMIT)
        )
    ),

  async execute(interaction, config) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: config.t("error.noGuild"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "record") {
        const weightKg = interaction.options.getNumber("weight", true);
        const heightCm = interaction.options.getNumber("height", true);
        const entry = await imcService.saveEntry(
          interaction.guildId,
          interaction.user.id,
          weightKg,
          heightCm
        );
        await interaction.reply({
          content: config.t("record.success", {
            bmi: entry.bmi.toFixed(1),
            category: config.t(`category.${categoryForBmi(entry.bmi)}`),
            weight: weightKg,
            height: heightCm,
          }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (subcommand === "view") {
        const target =
          interaction.options.getUser("target") ?? interaction.user;
        const entry = await imcService.getEntry(interaction.guildId, target.id);
        if (!entry) {
          await interaction.reply({
            content: config.t("view.missing", { user: target.toString() }),
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await interaction.reply({
          content: config.t("view.found", {
            user: target.toString(),
            bmi: entry.bmi.toFixed(1),
            category: config.t(`category.${categoryForBmi(entry.bmi)}`),
            weight: entry.weightKg,
            height: entry.heightCm,
          }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // leaderboard
      const limit =
        interaction.options.getInteger("limit") ?? DEFAULT_LEADERBOARD_LIMIT;
      const entries = await imcService.getLeaderboard(
        interaction.guildId,
        Math.min(limit, MAX_LEADERBOARD_LIMIT)
      );
      if (entries.length === 0) {
        await interaction.reply(config.t("leaderboard.empty"));
        return;
      }
      const rows = entries
        .map((entry, index) =>
          config.t("leaderboard.row", {
            rank: index + 1,
            user: `<@${entry.userId}>`,
            bmi: entry.bmi.toFixed(1),
            category: config.t(`category.${categoryForBmi(entry.bmi)}`),
          })
        )
        .join("\n");
      await interaction.reply(`# ${config.t("leaderboard.title")}\n${rows}`);
    } catch {
      const reply = { content: config.t("error.failed") };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply({ ...reply, flags: MessageFlags.Ephemeral });
      }
    }
  },
});
