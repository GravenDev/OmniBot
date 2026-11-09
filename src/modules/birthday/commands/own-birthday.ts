import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { formatDayOfYear } from "#lib/calendar.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import type { BirthdayConfigSchema } from "#modules/birthday/birthday.config.js";
import { ACCENT_COLOR } from "#modules/birthday/rendering/theme.js";
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

/** Which command the sheet answers: `/birthday set` or `/birthday show`. */
export type SheetTitle = "set" | "show";

/**
 * The button that hides an announced birthday, or announces a hidden one. It
 * carries the sheet's title, so that its edit keeps it.
 */
function announceButton(config: Config, announce: boolean, title: SheetTitle) {
  const id = `${ANNOUNCE_BUTTON_ID}:${announce ? "off" : "on"}`;
  return new ButtonBuilder()
    .setCustomId(title === "set" ? `${id}:set` : id)
    .setLabel(config.t(announce ? "announce.hide" : "announce.show"))
    .setStyle(ButtonStyle.Secondary);
}

/** Where the birthday is announced, if it is. */
function visibility(config: Config, announce: boolean): string {
  if (!announce) {
    return config.t("own.private");
  }
  const channel = config.get("channel");
  return channel
    ? config.t("own.announced", { channel: `<#${channel.id}>` })
    : config.t("own.announcedLater");
}

/** A message laid out with components: the flag goes with every send and edit. */
export interface SheetMessage {
  components: ContainerBuilder[];
  flags: MessageFlags.IsComponentsV2;
}

/** Text in the module's frame: a reply, or the edit of a sheet message. */
export function sheetNotice(...texts: string[]): SheetMessage {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(ACCENT_COLOR)
        .addTextDisplayComponents(
          texts.map((text) => new TextDisplayBuilder().setContent(text))
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

/**
 * The member's own birthday, as `/birthday set` and `/birthday show` answer
 * it and its button updates it: the date and where it is announced beside
 * the button that changes it, the members who share it, then what is stored.
 */
export async function ownBirthdaySheet(
  interaction: MemberInteraction,
  config: Config,
  entry: BirthdayEntry,
  entries: readonly BirthdayEntry[],
  title: SheetTitle = "show"
): Promise<SheetMessage> {
  const twins = await twinsLine(interaction, config, entry, entries);
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(config.t(`own.title.${title}`))
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `**${formatDayOfYear(entry, config.locale)}**`,
              visibility(config, entry.announce),
            ].join("\n")
          )
        )
        .setButtonAccessory(announceButton(config, entry.announce, title))
    );
  if (twins) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(twins)
    );
  }
  container
    .addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${config.t("own.stored")}`)
    );
  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}
