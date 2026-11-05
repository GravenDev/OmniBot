import type { Collection, Guild, GuildMember } from "discord.js";
import { loggerMaker } from "./logger.js";

const logger = loggerMaker("guild-members");

/**
 * How long a whole-guild fetch stays good: twice Discord's window of one
 * whole-guild request per 30 s, so that a second request never comes too
 * soon. Within it, the member cache is enough: the GuildMembers intent,
 * which fetching every member needs anyway, keeps it up to date with
 * arrivals and departures.
 */
export const MEMBERS_FRESH_MS = 60_000;

/**
 * Members who joined this close before a request may be missing from its
 * answer, or our clock may run behind Discord's: the cache keeps them.
 */
const RECENT_JOIN_MS = 60_000;

// Not a RevisionCache: a request still running is waited for however long it
// takes, and a refused one is kept until Discord's retry time, not a TTL.
type Request = {
  startedAt: number;
  done: Promise<void>;
} & (
  | { state: "running" | "answered" }
  /** `retryAt`: when Discord accepts a new request. */
  | { state: "rate-limited"; retryAt: number }
);

// Keyed by the guild object, which discord.js keeps for as long as the bot is
// on the server.
const requests = new WeakMap<Guild, Request>();

const iso = (ms: number) => new Date(ms).toISOString();

/** When a request started and when the next one may, for the logs. */
const times = (request: Request) =>
  `fetchedAt = ${iso(request.startedAt)} | refreshAt = ${iso(request.startedAt + MEMBERS_FRESH_MS)}`;

/** Seconds Discord asks to wait, when it refused the request for its rate. */
function retryAfter(err: unknown): number | null {
  const seconds = (err as { data?: { retry_after?: unknown } } | null)?.data
    ?.retry_after;
  return typeof seconds === "number" ? seconds : null;
}

/**
 * Drops the members missing from Discord's answer: a fetch only adds to the
 * cache, and a departure missed while the bot reconnected would otherwise
 * stay there for good. Those who joined around the request are kept, and
 * nobody when the answer holds fewer members than the guild counts: they
 * may be missing from it rather than gone.
 */
function prune(
  guild: Guild,
  fetched: Collection<string, GuildMember>,
  startedAt: number
): void {
  if (fetched.size < guild.memberCount) {
    return;
  }
  guild.members.cache.sweep(
    (member) =>
      !fetched.has(member.id) &&
      (member.joinedTimestamp ?? 0) < startedAt - RECENT_JOIN_MS
  );
}

/** Asks Discord for every member, and remembers how it went. */
function startRequest(guild: Guild): Request {
  const request: Request = {
    startedAt: Date.now(),
    state: "running",
    done: guild.members
      .fetch()
      .then((fetched) => {
        prune(guild, fetched, request.startedAt);
        request.state = "answered";
        logger.info(
          `Members fetched from Discord | guildId = ${guild.id} | count = ${guild.members.cache.size} | ${times(request)}`
        );
      })
      // After the answer's handling too: whatever fails, the request must not
      // stay "running", which every later call would wait for.
      .catch((err: unknown) => {
        // Refused for its rate: asking again before Discord allows it, counted
        // from its refusal, would be refused too, so callers get this error
        // until then. Any other failure is forgotten, the next call asks again.
        const seconds = retryAfter(err);
        if (seconds === null) {
          requests.delete(guild);
        } else {
          Object.assign(request, {
            state: "rate-limited",
            retryAt: Date.now() + seconds * 1000,
          });
        }
        throw err;
      }),
  };
  requests.set(guild, request);
  return request;
}

/** Whether a call now still uses this request rather than a new one. */
function stillGood(request: Request): boolean {
  switch (request.state) {
    case "running":
      return true;
    case "rate-limited":
      return Date.now() < request.retryAt;
    case "answered":
      return Date.now() - request.startedAt < MEMBERS_FRESH_MS;
  }
}

function describe(request: Request, guildId: string): string {
  switch (request.state) {
    case "running":
      return `Members fetch already in progress, waiting for it | guildId = ${guildId} | ${times(request)}`;
    case "rate-limited":
      return `Members fetch rate limited by Discord, not asking again yet | guildId = ${guildId} | retryAt = ${iso(request.retryAt)}`;
    case "answered":
      return `Members served from the bot's cache | guildId = ${guildId} | ${times(request)}`;
  }
}

/**
 * Fills the member cache with every member of a guild, fetched at most once
 * per {@link MEMBERS_FRESH_MS} whoever asks. Discord rate limits whole-guild
 * member requests (one per 30 s per guild): modules asking at the same time,
 * birthdays and seniority at the same hour, share one request instead of
 * having the second refused. A request still running is waited for, however
 * long it takes. Its error goes to the caller, to log with its own context.
 */
export async function loadAllMembers(guild: Guild): Promise<void> {
  const current = requests.get(guild);
  if (current && stillGood(current)) {
    logger.info(describe(current, guild.id));
    await current.done;
    return;
  }
  await startRequest(guild).done;
}

/**
 * Every member of a guild, as {@link loadAllMembers} gets them: a copy of the
 * member cache, which the caller may keep.
 */
export async function allMembers(
  guild: Guild
): Promise<Collection<string, GuildMember>> {
  await loadAllMembers(guild);
  return guild.members.cache.clone();
}
