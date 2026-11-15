import { type Client, GatewayIntentBits, type Guild } from "discord.js";
import { allMembers } from "./guild-members.js";
import type { Logger } from "./logger.js";
import { fetchMember } from "./moderation.js";

/**
 * Who is still on the server, for a sweep of stored members: the whole member
 * list, fetched once and shared with the other modules, rather than one
 * request per stored member, which a large server can have by the thousand.
 * A member missing from the list is still asked about before being said gone.
 * Member by member, asked to Discord rather than the cache, when the list
 * cannot be had (no members intent) or misses members, who may be absent from
 * it rather than gone. Without the intent, the list is not even asked for:
 * Discord never answers, and discord.js would wait two minutes per guild for
 * it. A Discord error other than an unknown member or user goes to the
 * caller: the member is neither present nor gone.
 *
 * @param logger The caller's, so that the logs say which sweep fell back.
 */
export async function memberPresence(
  guild: Guild,
  logger: Logger
): Promise<(userId: string) => Promise<boolean>> {
  const asked = async (userId: string) =>
    (await fetchMember(guild, userId, { force: true })) !== null;
  if (guild.client.options.intents.has(GatewayIntentBits.GuildMembers)) {
    try {
      const members = await allMembers(guild);
      if (members.size >= guild.memberCount) {
        // The list is the member cache, which can keep a departure the bot
        // missed, so that a short answer passes for complete: a member
        // missing from it is asked about before being said gone.
        return async (userId) => members.has(userId) || (await asked(userId));
      }
    } catch (err) {
      logger.warn(
        { err },
        `Member list unavailable, asking member by member | guildId = ${guild.id}`
      );
    }
  }
  return asked;
}

export interface MemberSweep<Row> {
  /** Whether the module is enabled on the guild, asked when it comes up. */
  isActivated: (guildId: string) => Promise<boolean>;
  /** Deletes what the module stored for a guild where it is disabled. */
  clearGuild: (guildId: string) => Promise<void>;
  /** Acts on one stored member, knowing whether they are still on the server. */
  sweepMember: (guild: Guild, row: Row, present: boolean) => Promise<void>;
  logger: Logger;
}

/** One guild's part of `sweepStoredMembers`. */
async function sweepGuild<Row extends { userId: string }>(
  guild: Guild,
  rows: readonly Row[],
  { sweepMember, logger }: MemberSweep<Row>
): Promise<void> {
  const isPresent = await memberPresence(guild, logger);
  for (const row of rows) {
    // One at a time: without the member list, each one is a request to
    // Discord, which rate limits them.
    try {
      await sweepMember(guild, row, await isPresent(row.userId));
    } catch (err) {
      // Neither here nor known to be gone, or the write failed: the other
      // members are still swept, this one is tried again tomorrow.
      logger.error(
        { err },
        `Failed to sweep a stored member | guildId = ${guild.id} | userId = ${row.userId}`
      );
    }
  }
}

/**
 * Checks stored members against who is still on the server, for a
 * maintenance task that keeps them within the privacy policy: each member of
 * a guild the bot is on goes to `sweepMember`; a guild where the module is
 * disabled is cleared; the rows of a guild the bot left are kept until it
 * comes back, like its configuration; an unavailable guild (Discord outage)
 * waits for the next run.
 */
export async function sweepStoredMembers<
  Row extends { guildId: string; userId: string },
>(
  client: Client<true>,
  rows: readonly Row[],
  sweep: MemberSweep<Row>
): Promise<void> {
  for (const [guildId, guildRows] of Map.groupBy(rows, (row) => row.guildId)) {
    // Guild by guild: the sweep's requests stay within Discord's global rate
    // limit, which the bot's other work shares.
    try {
      // Asked when the guild comes up, not from a list read at the start: the
      // module may have been enabled again, and data stored, meanwhile.
      if (!(await sweep.isActivated(guildId))) {
        await sweep.clearGuild(guildId);
        continue;
      }
      const guild = client.guilds.cache.get(guildId);
      if (guild?.available) {
        await sweepGuild(guild, guildRows, sweep);
      }
    } catch (err) {
      // The other guilds are still swept; this one is tried again tomorrow.
      sweep.logger.error(
        { err },
        `Failed to sweep the departures | guildId = ${guildId}`
      );
    }
  }
}
