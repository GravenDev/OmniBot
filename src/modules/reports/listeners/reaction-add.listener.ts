import { matchesEmoji } from "#lib/config.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import type { ReportsConfigSchema } from "../reports.config.js";
import reportService, {
  ineligibility,
  snapshotOf,
} from "../services/report.service.js";

const logger = loggerMaker("reports");

export default declareEventListener<"messageReactionAdd", ReportsConfigSchema>({
  eventType: "messageReactionAdd",

  async execute(reaction, user, _details, config) {
    if (!config || user.bot) {
      return;
    }
    const alertChannel = config.get("alertChannel");
    if (!alertChannel?.isSendable()) {
      logger.debug(
        `Reaction ignored | reason = alert channel missing or not sendable | guildId = ${reaction.message.guildId} | messageId = ${reaction.message.id}`
      );
      return;
    }
    if (!matchesEmoji(config.get("emoji"), reaction.emoji)) {
      return;
    }

    let reactionKept = false;
    try {
      await reaction.users.remove(user.id);
    } catch (err) {
      reactionKept = true;
      logger.warn(
        { err },
        `Report reaction could not be removed | guildId = ${reaction.message.guildId} | channelId = ${reaction.message.channelId} | messageId = ${reaction.message.id} | userId = ${user.id}`
      );
    }

    let message;
    try {
      message = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message;
    } catch (err) {
      logger.info(
        { err },
        `Reported message is gone | guildId = ${reaction.message.guildId} | channelId = ${reaction.message.channelId} | messageId = ${reaction.message.id}`
      );
      return;
    }
    if (!message.inGuild()) {
      return;
    }
    const blocked = ineligibility(message, user.id, alertChannel.id);
    if (blocked) {
      logger.debug(
        `Report ignored | reason = ${blocked} | guildId = ${message.guildId} | messageId = ${message.id} | userId = ${user.id}`
      );
      return;
    }

    await reportService.report(
      message.client,
      config,
      snapshotOf(message),
      { userId: user.id, source: "reaction", reason: null },
      reactionKept
    );
  },
});
