import {
  AttachmentBuilder,
  type Collection,
  type GuildMember,
} from "discord.js";
import {
  celebratesOn,
  daysInMonth,
  formatDayOfYear,
  type CalendarDay,
} from "#lib/calendar.js";
import type { ConfigProvider } from "#lib/config.js";
import type { TFunction } from "#lib/i18n.js";
import { fetchAvatar } from "#lib/imaging.js";
import { truncate } from "#lib/text.js";
import type { BirthdayConfigSchema } from "../birthday.config.js";
import {
  renderBirthdayCalendar,
  shownAvatars,
  type BirthdayCalendarLabels,
} from "../rendering/birthday-calendar.js";
import birthdayService, { type BirthdayEntry } from "./birthday.service.js";

const ALT_LIMIT = 1024;

/**
 * Members who agreed to be announced, by day of the month (index 0 is the
 * 1st). The others are left out entirely, so that no cell gives them away.
 */
export function monthCelebrants(
  entries: BirthdayEntry[],
  year: number,
  month: number
): string[][] {
  return Array.from({ length: daysInMonth(month, year) }, (_, index) =>
    entries
      .filter(
        (entry) =>
          entry.announce && celebratesOn(entry, { year, month, day: index + 1 })
      )
      .map((entry) => entry.userId)
  );
}

/** First day of the week in `locale`, 1 (Monday) to 7 (Sunday). */
function weekStart(locale: string): number {
  // Not yet in TypeScript's lib; older engines only have the getter.
  const info = new Intl.Locale(locale) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
    weekInfo?: { firstDay: number };
  };
  return (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1;
}

/** Empty cells before the 1st of the month, weeks starting as in `locale`. */
export function leadingDays(
  year: number,
  month: number,
  locale: string
): number {
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay() || 7;
  return (weekday - weekStart(locale) + 7) % 7;
}

export function calendarLabels(
  t: TFunction,
  locale: string,
  { year, month }: CalendarDay
): BirthdayCalendarLabels {
  const first = weekStart(locale);
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  return {
    kicker: t("calendar.kicker", { year }),
    title: t(`calendar.title.${month}`),
    // 3 January 2000 was a Monday.
    weekdays: Array.from({ length: 7 }, (_, index) =>
      weekday.format(new Date(Date.UTC(2000, 0, 2 + first + index)))
    ),
    several: (count) => t("calendar.several", { count }),
  };
}

/** Alternative text: every day with its members' names. */
export function calendarAlt(
  t: TFunction,
  locale: string,
  { year, month }: CalendarDay,
  names: string[][]
): string {
  const list = new Intl.ListFormat(locale, { type: "conjunction" });
  const days = names
    .map((dayNames, index) =>
      dayNames.length === 0
        ? null
        : t("calendar.altDay", {
            date: formatDayOfYear({ day: index + 1, month }, locale),
            names: list.format(dayNames),
          })
    )
    .filter((day) => day !== null)
    .join(t("calendar.altSeparator"));
  return truncate(
    t("calendar.alt", { title: t(`calendar.title.${month}`), year, days }),
    ALT_LIMIT
  );
}

/**
 * On the 1st of the month, posts the month's calendar of the announced
 * birthdays of members still on the guild. Nothing when nobody celebrates.
 * Nobody is notified: it is a calendar, not a wish.
 */
export async function postMonthlyCalendar(
  guildId: string,
  config: ConfigProvider<BirthdayConfigSchema>,
  members: Collection<string, GuildMember>,
  today: CalendarDay
): Promise<void> {
  const channel = config.get("channel");
  if (
    today.day !== 1 ||
    !config.get("monthlyCalendar") ||
    !channel?.isSendable()
  ) {
    return;
  }
  const entries = (await birthdayService.list(guildId)).filter((entry) =>
    members.has(entry.userId)
  );
  const days = monthCelebrants(entries, today.year, today.month).map(
    (userIds) => userIds.map((userId) => members.get(userId)!)
  );
  if (days.every((day) => day.length === 0)) {
    return;
  }
  const cells = await Promise.all(
    days.map((day) =>
      Promise.all(
        day.map(async (member, index) => ({
          name: member.displayName,
          // Only the first ones are drawn.
          avatar:
            index < shownAvatars(day.length)
              ? await fetchAvatar(member, 64)
              : null,
        }))
      )
    )
  );
  const png = renderBirthdayCalendar(
    {
      leading: leadingDays(today.year, today.month, config.locale),
      days: cells,
    },
    calendarLabels(config.t, config.locale, today)
  );
  await channel.send({
    content: config.t("calendar.content"),
    files: [
      new AttachmentBuilder(png, {
        name: "birthday-calendar.png",
        description: calendarAlt(
          config.t,
          config.locale,
          today,
          days.map((day) => day.map((member) => member.displayName))
        ),
      }),
    ],
    allowedMentions: { parse: [] },
  });
}
