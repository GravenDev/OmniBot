import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import type { BirthdayEntry } from "./birthday.service.js";

// Discord answers a member request for 100 users at most.
const MEMBER_FETCH_LIMIT = 100;

const logger = loggerMaker("birthday");

type MemberInteraction =
  | ChatInputCommandInteraction<"cached" | "raw">
  | ButtonInteraction<"cached" | "raw">;

/** Ids, among `userIds`, of the members still on the guild. */
async function stillOnGuild(
  interaction: MemberInteraction,
  userIds: string[]
): Promise<Set<string>> {
  const present = new Set<string>();
  if (!interaction.inCachedGuild()) {
    return present;
  }
  const batches: string[][] = [];
  for (let start = 0; start < userIds.length; start += MEMBER_FETCH_LIMIT) {
    batches.push(userIds.slice(start, start + MEMBER_FETCH_LIMIT));
  }
  // Together: the gateway's own send queue keeps to Discord's rate limit.
  const fetched = await Promise.all(
    batches.map((user) => interaction.guild.members.fetch({ user }))
  );
  for (const members of fetched) {
    for (const userId of members.keys()) {
      present.add(userId);
    }
  }
  return present;
}

class TwinsService implements Service {
  /**
   * The members who share `own`'s date, in a stable order; none when nobody
   * does. Only announced members still on the guild are named or counted: a
   * hidden one is never revealed, even to a hidden asker. The same registered
   * date, 29 February included: it is not 28 February's twin, as in the
   * statistics.
   */
  async of(
    interaction: MemberInteraction,
    own: BirthdayEntry,
    entries: readonly BirthdayEntry[]
  ): Promise<string[]> {
    const candidates = entries
      .filter(
        (entry) =>
          entry.announce &&
          entry.userId !== own.userId &&
          entry.day === own.day &&
          entry.month === own.month
      )
      .map((entry) => entry.userId);
    if (candidates.length === 0) {
      return [];
    }

    try {
      const present = await stillOnGuild(interaction, candidates);
      return candidates
        .filter((userId) => present.has(userId))
        .sort((a, b) => a.localeCompare(b));
    } catch (err) {
      // Better no twins than a departed member named.
      logger.error(
        { err },
        `Failed to fetch the birthday twins | guildId = ${interaction.guildId}`
      );
      return [];
    }
  }
}

export default declareService(new TwinsService());
