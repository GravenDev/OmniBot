import {
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { LatexConfigSchema } from "#modules/latex/latex.config.js";
import {
  FORMULA_MAX_LENGTH,
  FormulaError,
  renderFormula,
} from "#modules/latex/rendering/formula.js";

const ALT_TEXT_MAX_LENGTH = 1024;

export default declareCommand<LatexConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("latex")
    .setDescription("Render a LaTeX formula as an image")
    .setDescriptionLocalizations({
      fr: "Afficher une formule LaTeX sous forme d'image",
    })
    .setContexts([InteractionContextType.Guild])
    .addStringOption((option) =>
      option
        .setName("formula")
        .setDescription("The formula, without $ delimiters (e.g. \\frac{a}{b})")
        .setDescriptionLocalizations({
          fr: "La formule, sans délimiteurs $ (ex. : \\frac{a}{b})",
        })
        .setMaxLength(FORMULA_MAX_LENGTH)
        .setRequired(true)
    ),

  async execute(interaction, config) {
    const formula = interaction.options.getString("formula", true);
    await interaction.deferReply();

    let image: Buffer;
    try {
      image = await renderFormula(formula, config.get("theme"));
    } catch (err) {
      if (!(err instanceof FormulaError)) {
        throw err;
      }
      await interaction.deleteReply();
      await interaction.followUp({
        content: config.t("render.invalid", { error: err.message }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.editReply({
      files: [
        new AttachmentBuilder(image, {
          name: "formula.png",
          description: formula.slice(0, ALT_TEXT_MAX_LENGTH),
        }),
      ],
    });
  },
});
