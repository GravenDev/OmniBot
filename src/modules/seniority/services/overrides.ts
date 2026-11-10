import type { Client, Guild, REST } from "discord.js";
import prisma from "#lib/database.js";
import {
  searchGuildMessagesPage,
  SearchNotReadyError,
} from "#lib/discord-polyfills/guild-message-search.js";
import { allMembers } from "#lib/guild-members.js";
import { loggerMaker } from "#lib/logger.js";
import { fetchMember } from "#lib/moderation.js";

/** The recomputed seniority of the guild's members, by user id. */
export async function overrides(guildId: string): Promise<Map<string, Date>> {
  const rows = await prisma.seniorityOverride.findMany({
    where: { guildId },
    select: { userId: true, since: true },
  });
  return new Map(rows.map(({ userId, since }) => [userId, since]));
}

/** The date a member's seniority counts from: the earliest one known. */
export function seniorityStart(
  joinedAt: Date,
  override: Date | undefined
): Date {
  return override && override < joinedAt ? override : joinedAt;
}

export interface FirstMessage {
  /** The date of their first message, null when they never posted. */
  date: Date | null;
  /** Discord is still indexing old history: an older message may exist. */
  partial: boolean;
}

/**
 * When the member first posted on the server, as far as the bot can see: the
 * search only reads the channels it has access to, and a deleted message no
 * longer counts. Discord returns whole messages: only their dates are used,
 * their content is neither read nor kept.
 */
export async function firstMessageDate(
  rest: REST,
  guildId: string,
  userId: string,
  deadline: number
): Promise<FirstMessage> {
  const query = new URLSearchParams({
    author_id: userId,
    include_nsfw: "true",
    sort_by: "timestamp",
    sort_order: "asc",
    // A full page: Discord may return fewer results than asked when the
    // messages have not been read for a long time, and the oldest is first.
    limit: "25",
  });
  const page = await searchGuildMessagesPage(rest, guildId, query, deadline);
  if (page === null) {
    throw new SearchNotReadyError();
  }
  // The earliest of the page, rather than trusting its order.
  const times = page.messages.map(({ timestamp }) => Date.parse(timestamp));
  const date = times.length > 0 ? new Date(Math.min(...times)) : null;
  return { date, partial: page.deepIndexing };
}

export interface Recomputed {
  /** The date the member's seniority now counts from. */
  since: Date;
  /** True when that date is earlier than their current arrival. */
  corrected: boolean;
  /** Discord was still indexing old history: an older message may exist. */
  partial: boolean;
}

/**
 * Recomputes a member's seniority: the earliest of their current arrival,
 * their first message and the date already recomputed, if any — a message
 * deleted since then does not take seniority back. Stored only when earlier
 * than the arrival, which needs no row.
 */
export async function recompute(
  rest: REST,
  guildId: string,
  userId: string,
  joinedAt: Date,
  deadline: number
): Promise<Recomputed> {
  const first = await firstMessageDate(rest, guildId, userId, deadline);
  // Read after the search, which can take a minute, so that a date deleted
  // meanwhile (`/privacy delete`, the module disabled) is not written back.
  // The message found can still store one: an administrator's recompute is a
  // new request, which the member can delete again.
  const stored = await prisma.seniorityOverride.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { since: true },
  });
  // The rule the cards and announcements apply, so that the date shown is
  // the one celebrated.
  const since = seniorityStart(
    seniorityStart(joinedAt, first.date ?? undefined),
    stored?.since
  );
  if (since < joinedAt) {
    await prisma.seniorityOverride.upsert({
      where: { guildId_userId: { guildId, userId } },
      // Recomputed for a member who is here: no departure to count from.
      create: { guildId, userId, since, leftAt: null },
      update: { since, leftAt: null },
    });
    return { since, corrected: true, partial: first.partial };
  }
  if (first.partial) {
    // Nothing older yet, but old history is still being indexed: saying so
    // would be a guess.
    throw new SearchNotReadyError();
  }
  await remove(guildId, userId);
  return { since, corrected: false, partial: false };
}

export async function remove(guildId: string, userId: string): Promise<void> {
  await prisma.seniorityOverride.deleteMany({ where: { guildId, userId } });
}

export async function count(guildId: string): Promise<number> {
  return prisma.seniorityOverride.count({ where: { guildId } });
}

export async function clearGuild(guildId: string): Promise<void> {
  await prisma.seniorityOverride.deleteMany({ where: { guildId } });
}

// A recomputed seniority outlives the member's departure by a year: long
// enough for them to come back, bounded since a departed member can no longer
// run `/privacy delete`.
/** A calendar year before `now`: the departures older than that are past. */
function aYearBefore(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(now.getUTCFullYear() - 1);
  return cutoff;
}

const logger = loggerMaker("seniority");

/** One guild's part of `sweepDepartures`. */
async function sweepGuild(
  guild: Guild,
  rows: readonly { userId: string; leftAt: Date | null }[],
  now: Date
): Promise<void> {
  const cutoff = aYearBefore(now);
  const isPresent = await presence(guild);
  for (const { userId, leftAt } of rows) {
    try {
      await sweepMember(guild, userId, leftAt, now, cutoff, isPresent);
    } catch (err) {
      // The other members are still swept; this one is tried again tomorrow.
      logger.error(
        { err },
        `Failed to sweep a departure | guildId = ${guild.id} | userId = ${userId}`
      );
    }
  }
}

/**
 * Who is still on the server: the whole member list, fetched once and shared
 * with the other modules, rather than one request per recomputed seniority,
 * which a large server can have by the thousand. Member by member, asked to
 * Discord rather than the cache, when the list cannot be had (no members
 * intent) or misses members, who may be absent from it rather than gone.
 */
async function presence(
  guild: Guild
): Promise<(userId: string) => Promise<boolean>> {
  try {
    const members = await allMembers(guild);
    if (members.size >= guild.memberCount) {
      return async (userId) => members.has(userId);
    }
  } catch (err) {
    logger.warn(
      { err },
      `Member list unavailable, asking member by member | guildId = ${guild.id}`
    );
  }
  return async (userId) =>
    (await fetchMember(guild, userId, { force: true })) !== null;
}

async function sweepMember(
  guild: Guild,
  userId: string,
  leftAt: Date | null,
  now: Date,
  cutoff: Date,
  isPresent: (userId: string) => Promise<boolean>
): Promise<void> {
  const where = { guildId: guild.id, userId };
  // Each write checks the stored state it was decided on, so a recompute that
  // ran while Discord was asked is not undone by a delete or a return. A
  // member coming back in that instant is not seen: dated as a departure, the
  // next sweep forgets it; deleted after a year, an administrator recomputes.
  if (await isPresent(userId)) {
    if (leftAt) {
      await prisma.seniorityOverride.updateMany({
        where: { ...where, leftAt: { not: null } },
        data: { leftAt: null },
      });
    }
  } else if (!leftAt) {
    await prisma.seniorityOverride.updateMany({
      where: { ...where, leftAt: null },
      data: { leftAt: now },
    });
  } else if (leftAt < cutoff) {
    await prisma.seniorityOverride.deleteMany({
      where: { ...where, leftAt: { lt: cutoff } },
    });
  }
}

/**
 * Checks who is still on the server, against its member list: dates a
 * departure, forgets it on a return, and deletes the date a calendar year
 * after the departure. Daily rather than on join and leave events, so that a
 * departure or a return the bot missed while down, or a recompute racing a
 * departure, is caught up the next day. Also deletes the dates of a guild where the module is
 * disabled; those of a guild the bot left are kept until it comes back, like
 * its configuration.
 */
export async function sweepDepartures(
  client: Client<true>,
  isActivated: (guildId: string) => Promise<boolean>,
  now = new Date()
): Promise<void> {
  const rows = await prisma.seniorityOverride.findMany({
    select: { guildId: true, userId: true, leftAt: true },
  });
  for (const [guildId, guildRows] of Map.groupBy(rows, (row) => row.guildId)) {
    try {
      // Asked when the guild comes up, not from a list read at the start: the
      // module may have been enabled again, and a date recomputed, meanwhile.
      if (!(await isActivated(guildId))) {
        await clearGuild(guildId);
        continue;
      }
      const guild = client.guilds.cache.get(guildId);
      if (guild?.available) {
        await sweepGuild(guild, guildRows, now);
      }
    } catch (err) {
      // The other guilds are still swept; this one is tried again tomorrow.
      logger.error(
        { err },
        `Failed to sweep the departures | guildId = ${guildId}`
      );
    }
  }
}
