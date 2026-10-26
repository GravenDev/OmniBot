import { declareEventListener } from "#lib/listener.js";
import starboard, {
  isCounted,
} from "#modules/starboard/services/starboard.service.js";
import type { StarboardConfigSchema } from "#modules/starboard/starboard.config.js";

export default declareEventListener<
  "messageReactionAdd",
  StarboardConfigSchema
>({
  eventType: "messageReactionAdd",

  async execute(reaction, user, _details, config) {
    if (!config || user.bot || !isCounted(reaction.emoji, config)) {
      return;
    }
    await starboard.refresh(reaction.message, config);
  },
});
