import type {
  GuildTextBasedChannel,
  Message,
  PartialMessage,
  ReadonlyCollection,
  Snowflake,
} from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { handleGameDeletions } from "#modules/four-hour-game/services/deletions.js";

export default declareEventListener<
  "messageDeleteBulk",
  FourHourGameConfigSchema
>({
  eventType: "messageDeleteBulk",

  async execute(
    messages: ReadonlyCollection<Snowflake, Message | PartialMessage>,
    deletedFrom: GuildTextBasedChannel,
    config
  ) {
    await handleGameDeletions(config, deletedFrom.guildId, deletedFrom.id, [
      ...messages.keys(),
    ]);
  },
});
