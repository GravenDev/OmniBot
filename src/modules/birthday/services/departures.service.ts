import type { Client } from "discord.js";
import prisma from "#lib/database.js";
import { loggerMaker } from "#lib/logger.js";
import { sweepStoredMembers } from "#lib/member-presence.js";
import { declareService, type Service } from "#lib/service.js";
import birthdayService from "./birthday.service.js";

const logger = loggerMaker("birthday");

class DeparturesService implements Service {
  /**
   * Deletes the birthdays of members no longer on the server, asking Discord
   * rather than relying on the member-leave event: it runs even where the
   * module is skipped for a missing members intent, and catches up departures
   * the bot missed while down. Each birthday is deleted right after its member
   * is checked, rather than all at the end: a member found gone who comes back
   * and registers again while the rest of a large guild is checked keeps the
   * new one. Also deletes the birthdays of a guild where the module is
   * disabled; those of a guild the bot left are kept until it comes back, like
   * its configuration.
   */
  async sweep(
    client: Client<true>,
    isActivated: (guildId: string) => Promise<boolean>
  ): Promise<void> {
    const rows = await prisma.birthday.findMany({
      select: { guildId: true, userId: true },
    });
    // Logged once per guild: one the bot comes back to can hold hundreds.
    const removed = new Map<string, number>();
    await sweepStoredMembers(client, rows, {
      isActivated,
      clearGuild: (guildId) => birthdayService.clearGuild(guildId),
      async sweepMember(guild, { userId }, present) {
        if (!present && (await birthdayService.remove(guild.id, userId))) {
          removed.set(guild.id, (removed.get(guild.id) ?? 0) + 1);
        }
      },
      logger,
    });
    for (const [guildId, count] of removed) {
      logger.info(
        `Departed members' birthdays removed | guildId = ${guildId} | count = ${count}`
      );
    }
  }
}

export default declareService(new DeparturesService());
