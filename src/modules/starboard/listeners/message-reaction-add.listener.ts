import type {
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import starboardService from "#modules/starboard/services/starboard.service.js";
import type { StarboardConfigSchema } from "#modules/starboard/starboard.config.js";

export default declareEventListener<
  "messageReactionAdd",
  StarboardConfigSchema
>({
  eventType: "messageReactionAdd",

  async execute(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    _details: unknown,
    config
  ) {
    if (!config) return;

    await starboardService.handleReactionChange(reaction, user, config);
  },
});
