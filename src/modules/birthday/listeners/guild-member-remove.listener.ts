import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import type { BirthdayConfigSchema } from "../birthday.config.js";
import birthdayService from "../services/birthday.service.js";

const logger = loggerMaker("birthday");

// A member who leaves takes their birthday with them. Departures the bot
// misses (while down) are caught by the daily run.
export default declareEventListener<"guildMemberRemove", BirthdayConfigSchema>({
  eventType: "guildMemberRemove",
  async execute(member, config) {
    if (!config) {
      return;
    }
    if (await birthdayService.remove(member.guild.id, member.id)) {
      logger.info(
        `Departed member's birthday removed | guildId = ${member.guild.id} | userId = ${member.id}`
      );
    }
  },
});
