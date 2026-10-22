import { declareEventListener } from "#lib/listener.js";
import type { LatexConfigSchema } from "#modules/latex/latex.config.js";
import { renderPosted } from "#modules/latex/services/chat.js";

export default declareEventListener<"messageCreate", LatexConfigSchema>({
  eventType: "messageCreate",

  async execute(message, config) {
    await renderPosted(message, config);
  },
});
