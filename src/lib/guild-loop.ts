import type { Client, Guild } from "discord.js";
import { eachLimited } from "./concurrency.js";
import type { loggerMaker } from "./logger.js";

/**
 * Guilds run at once by default: enough that a slow guild does not hold the
 * others back, few enough that a task over many guilds never holds every
 * guild's members and images in memory together.
 */
const CONCURRENCY = 4;

export interface GuildLoopOptions {
  /** What is done in each guild, for the logs: "post the daily report". */
  action: string;
  logger: ReturnType<typeof loggerMaker>;
  /** Guilds run at once; 1 runs them one after another. */
  concurrency?: number;
}

/**
 * The guilds of `guildIds` the bot is still on, in that order. A module's
 * activation outlives the bot's departure from the guild, like its
 * configuration, so that both come back with a new invite: a guild the bot
 * left is skipped, logged at debug level. One Discord reports unavailable
 * (an outage, or not arrived yet when the bot got ready) is kept: its API
 * may still answer, and a daily task skipped then would not come back.
 */
export function presentGuilds(
  client: Client,
  guildIds: Iterable<string>,
  { action, logger }: Omit<GuildLoopOptions, "concurrency">
): Guild[] {
  const guilds: Guild[] = [];
  for (const guildId of guildIds) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      guilds.push(guild);
    } else {
      logger.debug(
        `Guild skipped | action = ${action} | reason = bot not in the guild | guildId = ${guildId}`
      );
    }
  }
  return guilds;
}

/**
 * Runs `run` in each of the {@link presentGuilds}, a few at once. A guild's
 * failure is logged and does not stop the others.
 */
export async function forEachGuild(
  client: Client,
  guildIds: Iterable<string>,
  run: (guild: Guild) => Promise<void>,
  options: GuildLoopOptions
): Promise<void> {
  const { action, logger, concurrency = CONCURRENCY } = options;
  await eachLimited(
    presentGuilds(client, guildIds, options),
    concurrency,
    async (guild) => {
      try {
        await run(guild);
      } catch (err) {
        logger.error({ err }, `Failed to ${action} | guildId = ${guild.id}`);
      }
    }
  );
}
