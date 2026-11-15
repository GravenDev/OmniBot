import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { formatDayOfYear } from "#lib/calendar.js";
import type { ConfigProvider } from "#lib/config.js";
import type { BirthdayConfigSchema } from "#modules/birthday/birthday.config.js";
import { ACCENT_COLOR } from "#modules/birthday/rendering/theme.js";
import type { BirthdayEntry } from "#modules/birthday/services/birthday.service.js";

// Twins named in the reply to /birthday set and show; the rest are counted.
const SHOWN_TWINS = 10;

/** Custom id of the button that switches the member's announcement on or off. */
export const ANNOUNCE_BUTTON_ID = "birthday-announce";

type Config = ConfigProvider<BirthdayConfigSchema>;

/**
 * The line naming the members who share the member's date, found by the
 * twins service, or null when nobody does.
 */
function twinsLine(config: Config, twins: readonly string[]): string | null {
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
export function ownBirthdaySheet(
  config: Config,
  entry: BirthdayEntry,
  twinIds: readonly string[],
  title: SheetTitle = "show"
): SheetMessage {
  const twins = twinsLine(config, twinIds);
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
