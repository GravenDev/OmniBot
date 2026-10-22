import { declareEventListener } from "#lib/listener.js";
import type { LatexConfigSchema } from "#modules/latex/latex.config.js";
import { removeReply } from "#modules/latex/services/chat.js";

export default declareEventListener<"messageDelete", LatexConfigSchema>({
  eventType: "messageDelete",

  async execute(message, config) {
    if (config) {
      await removeReply(message);
    }
  },
});
