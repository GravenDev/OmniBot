import type { ConfigProvider } from "#lib/config.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { BirthdayConfigSchema } from "../birthday.config.js";
import { milestoneEmbed } from "./announcements.js";
import birthdayService from "./birthday.service.js";
import { logFailure } from "./failures.js";
import {
  expectedFirstCollision,
  newMilestones,
  sharedDates,
} from "./paradox.js";

const queue = new KeyedQueue();

/**
 * Records the birthday paradox milestones the guild's registrations just
 * reached, and announces them when the guild wants it. Only aggregate figures
 * are posted: never who registered, nor which date is shared.
 */
export function checkMilestones(
  guildId: string,
  config: ConfigProvider<BirthdayConfigSchema>
): Promise<void> {
  return queue.run(guildId, async () => {
    const entries = await birthdayService.list(guildId);
    const state = await birthdayService.getState(guildId);
    const reached = newMilestones(
      entries.length,
      sharedDates(entries).length > 0,
      state.milestones
    );
    if (reached.length === 0) {
      return;
    }
    await birthdayService.recordMilestones(
      guildId,
      reached,
      reached.includes("first-collision") ? entries.length : null
    );

    const channel = config.get("channel");
    if (!config.get("paradoxMilestones") || !channel?.isSendable()) {
      return;
    }
    for (const milestone of reached) {
      await channel
        .send({
          embeds: [
            milestoneEmbed(config.t, milestone, {
              count: entries.length,
              expectedFirstCollision: expectedFirstCollision(),
              locale: config.locale,
            }),
          ],
          allowedMentions: NO_MENTIONS,
        })
        .catch((err: unknown) =>
          logFailure(
            err,
            `Failed to announce a paradox milestone | guildId = ${guildId}`
          )
        );
    }
  });
}
