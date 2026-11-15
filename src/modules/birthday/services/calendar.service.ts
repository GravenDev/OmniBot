import {
  AttachmentBuilder,
  type Collection,
  type GuildMember,
} from "discord.js";
import type { CalendarDay } from "#lib/calendar.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { BirthdayConfigSchema } from "../birthday.config.js";
import { renderBirthdayCalendar } from "../rendering/birthday-calendar.js";
import birthdayService from "./birthday.service.js";
import {
  calendarAlt,
  calendarLabels,
  leadingDays,
  monthCelebrants,
} from "./calendar.js";
import portraitsService from "./portraits.service.js";

const logger = loggerMaker("birthday");

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
  if (today.day !== 1 || !config.get("monthlyCalendar")) {
    return;
  }
  if (!channel?.isSendable()) {
    logger[channel ? "warn" : "debug"](
      `Monthly calendar skipped | reason = ${channel ? "channel not sendable" : "no channel"} | guildId = ${guildId}`
    );
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
  const avatars = await portraitsService.ofCalendarDays(days);
  const cells = days.map((day, dayIndex) =>
    day.map((member, index) => ({
      name: member.displayName,
      avatar: avatars[dayIndex]?.[index] ?? null,
    }))
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
    allowedMentions: NO_MENTIONS,
  });
  logger.info(
    `Monthly calendar posted | guildId = ${guildId} | channelId = ${channel.id} | count = ${days.reduce((total, day) => total + day.length, 0)}`
  );
}
