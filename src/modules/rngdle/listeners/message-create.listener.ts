import { declareEventListener } from "#lib/listener.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";
import { answerShare } from "#modules/rngdle/services/share-cards.js";

export default declareEventListener<"messageCreate", RngdleConfigSchema>({
  eventType: "messageCreate",

  async execute(message, config) {
    await answerShare(message, config);
  },
});
