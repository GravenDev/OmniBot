import { ConfigType, type ConfigSchema } from "#lib/config.js";
import { THEMES } from "#modules/latex/rendering/formula.js";

export const latexConfigSchema = {
  autoDetect: {
    name: "Automatic detection",
    description:
      "Renders the messages containing LaTeX ($…$, $$…$$, \\[…\\], \\begin{…}) as images.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
  theme: {
    name: "Theme",
    description:
      "Colors of the images: light (black on white) or dark (white on dark gray).",
    type: ConfigType.ENUM,
    options: THEMES,
    defaultValue: "light",
  },
} satisfies ConfigSchema;

export type LatexConfigSchema = typeof latexConfigSchema;
