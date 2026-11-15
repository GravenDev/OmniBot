import { declareEventListener } from "#lib/listener.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";
import shareCards from "#modules/rngdle/services/share-cards.service.js";

export default declareEventListener<"messageCreate", RngdleConfigSchema>({
  eventType: "messageCreate",

  async execute(message, config) {
    await shareCards.answerShare(message, config);
  },
});
