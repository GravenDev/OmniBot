import { declareEventListener } from "#lib/listener.js";
import type { LatexConfigSchema } from "#modules/latex/latex.config.js";
import { renderEdited } from "#modules/latex/services/chat.js";

export default declareEventListener<"messageUpdate", LatexConfigSchema>({
  eventType: "messageUpdate",

  async execute(before, after, config) {
    await renderEdited(before, after, config);
  },
});
