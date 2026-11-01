import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { formatDayOfYear } from "#lib/calendar.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import type { BirthdayConfigSchema } from "#modules/birthday/birthday.config.js";
import type { BirthdayEntry } from "#modules/birthday/services/birthday.service.js";

// Twins named in the reply to /birthday set and show; the rest are counted.
const SHOWN_TWINS = 10;
// Discord answers a member request for 100 users at most.
const MEMBER_FETCH_LIMIT = 100;

/** Custom id of the button that switches the member's announcement on or off. */
export const ANNOUNCE_BUTTON_ID = "birthday-announce";

const logger = loggerMaker("birthday");

type Config = ConfigProvider<BirthdayConfigSchema>;
export type MemberInteraction =
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
  for (let start = 0; start < userIds.length; start += MEMBER_FETCH_LIMIT) {
    const members = await interaction.guild.members.fetch({
      user: userIds.slice(start, start + MEMBER_FETCH_LIMIT),
    });
    for (const userId of members.keys()) {
      present.add(userId);
    }
  }
  return present;
}

/**
 * The line naming the members who share `own`'s date, or null when nobody
 * does. Only announced members still on the guild are named or counted: a
 * hidden one is never revealed, even to a hidden asker. The same registered
 * date, 29 February included: it is not 28 February's twin, as in the
 * statistics.
 */
export async function twinsLine(
  interaction: MemberInteraction,
  config: Config,
  own: BirthdayEntry,
  entries: readonly BirthdayEntry[]
): Promise<string | null> {
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
    return null;
  }

  let twins: string[];
  try {
    const present = await stillOnGuild(interaction, candidates);
    twins = candidates.filter((userId) => present.has(userId)).sort();
  } catch (err) {
    // Better no twins than a departed member named.
    logger.error(
      { err },
      `Failed to fetch the birthday twins | guildId = ${interaction.guildId}`
    );
    return null;
  }
  if (twins.length === 0) {
    return null;
  }

  // Ten names, then « N other members »: the reply stays short.
  const names = twins.slice(0, SHOWN_TWINS).map((userId) => `<@${userId}>`);
  if (twins.length > SHOWN_TWINS) {
    names.push(config.t("twins.more", { count: twins.length - SHOWN_TWINS }));
  }
  return config.t("twins.line", {
    users: new Intl.ListFormat(config.locale).format(names),
  });
}

/** The button that hides an announced birthday, or announces a hidden one. */
export function announceRow(config: Config, announce: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ANNOUNCE_BUTTON_ID}:${announce ? "off" : "on"}`)
      .setLabel(config.t(announce ? "announce.hide" : "announce.show"))
      .setStyle(ButtonStyle.Secondary)
  );
}

/** What `/birthday show` says about the member's own birthday, with its button. */
export async function showMessage(
  interaction: MemberInteraction,
  config: Config,
  entry: BirthdayEntry,
  entries: readonly BirthdayEntry[]
) {
  const twins = await twinsLine(interaction, config, entry, entries);
  return {
    content: [
      config.t("show.entry", { date: formatDayOfYear(entry, config.locale) }),
      config.t(entry.announce ? "show.announced" : "show.private"),
      ...(twins ? [twins] : []),
      config.t("show.stored"),
    ].join("\n"),
    components: [announceRow(config, entry.announce)],
  };
}
