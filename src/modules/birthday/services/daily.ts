import {
  AttachmentBuilder,
  type Client,
  type Collection,
  type Guild,
  type GuildMember,
  type SendableChannels,
} from "discord.js";
import configService from "#core/services/config.service.js";
import mentionService from "#core/services/mention.service.js";
import moduleService from "#core/services/module.service.js";
import {
  celebratesOn,
  dueDay,
  localTime,
  type CalendarDay,
} from "#lib/calendar.js";
import {
  renderCelebrationCard,
  SHOWN_PORTRAITS,
} from "#lib/celebration-card.js";
import type { ConfigProvider } from "#lib/config.js";
import { allMembers } from "#lib/guild-members.js";
import { fetchAvatar } from "#lib/imaging.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { postCard } from "#lib/post-card.js";
import type { BirthdayConfigSchema } from "../birthday.config.js";
import {
  birthdayCard,
  plainMessage,
  birthdayMessage,
  cardContent,
  pickGuildMessage,
} from "./announcements.js";
import birthdayService, { type BirthdayEntry } from "./birthday.service.js";
import { postMonthlyCalendar } from "./calendar.js";
import { logFailure } from "./failures.js";

const logger = loggerMaker("birthday");

type Config = ConfigProvider<BirthdayConfigSchema>;

/** Members celebrating today who agreed to have it announced. */
export function announcedCelebrants(
  entries: BirthdayEntry[],
  today: CalendarDay
): string[] {
  return entries
    .filter((entry) => entry.announce && celebratesOn(entry, today))
    .map((entry) => entry.userId);
}

/** Today's card. */
async function drawCard(
  config: Config,
  celebrants: GuildMember[],
  template: string | null,
  today: CalendarDay
): Promise<AttachmentBuilder> {
  const guild = celebrants[0]!.guild;
  const { card, alt } = birthdayCard(
    config.t,
    config.locale,
    celebrants.map((member) => member.displayName),
    template &&
      plainMessage(
        template,
        {
          user: (id) => guild.members.cache.get(id)?.displayName,
          role: (id) => guild.roles.cache.get(id)?.name,
          channel: (id) => guild.channels.cache.get(id)?.name,
        },
        config.locale
      ),
    today
  );
  const avatars = await Promise.all(
    celebrants.map((member, index) =>
      // Only the first ones are drawn.
      index < SHOWN_PORTRAITS ? fetchAvatar(member, 256) : null
    )
  );
  return new AttachmentBuilder(renderCelebrationCard({ ...card, avatars }), {
    name: "birthday.png",
    description: alt,
  });
}

/**
 * Posts today's card, with the mentions in its text. The plain text wish
 * goes instead when the card cannot be drawn or Discord refuses it (no
 * permission to attach files, say), so that the birthdays are still wished.
 */
async function sendWishes(
  config: Config,
  guildId: string,
  channel: SendableChannels,
  celebrants: GuildMember[],
  today: CalendarDay
): Promise<void> {
  const userIds = celebrants.map((member) => member.id);
  const template = pickGuildMessage(config.get("messages") ?? []);
  const allowedMentions = {
    users: await mentionService.mentionable(guildId, userIds),
  };
  const posted = await postCard(
    logger,
    `the birthdays | guildId = ${guildId}`,
    () => drawCard(config, celebrants, template, today),
    (card) =>
      channel.send({
        content: cardContent(config.t, config.locale, userIds),
        files: [card],
        allowedMentions,
      })
  );
  if (!posted) {
    await channel.send({
      content: birthdayMessage(config.t, config.locale, template, userIds),
      allowedMentions,
    });
  }
}

/**
 * Gives the role to the members celebrating today and takes it from the
 * others, member by member: one refusal does not stop the rest.
 */
async function updateRole(
  guildId: string,
  config: Config,
  members: Collection<string, GuildMember>,
  celebrating: string[]
): Promise<void> {
  const role = config.get("role");
  if (!role) {
    return;
  }
  const keep = new Set(celebrating);
  const changes = [
    ...[...role.members.values()]
      .filter((member) => !keep.has(member.id))
      .map((member) => () => member.roles.remove(role)),
    ...celebrating
      .map((userId) => members.get(userId))
      .filter((member) => member && !member.roles.cache.has(role.id))
      .map((member) => () => member!.roles.add(role)),
  ];
  for (const change of changes) {
    await change().catch((err: unknown) =>
      logFailure(
        err,
        `Failed to update the birthday role | guildId = ${guildId}`
      )
    );
  }
}

async function announceBirthdays(
  guild: Guild,
  config: Config,
  members: Collection<string, GuildMember>,
  today: CalendarDay
): Promise<void> {
  // Rows of members who left while the bot could not see it go now.
  const entries = await birthdayService.list(guild.id);
  const departed = entries
    .map((entry) => entry.userId)
    .filter((userId) => !members.has(userId));
  if (departed.length > 0) {
    await birthdayService.removeMany(guild.id, departed);
    logger.info(
      `Departed members' birthdays removed | guildId = ${guild.id} | count = ${departed.length}`
    );
  }

  const announced = announcedCelebrants(
    entries.filter((entry) => members.has(entry.userId)),
    today
  );
  await updateRole(guild.id, config, members, announced);
  const channel = config.get("channel");
  if (announced.length === 0 || !channel?.isSendable()) {
    return;
  }
  await sendWishes(
    config,
    guild.id,
    channel,
    announced.map((userId) => members.get(userId)!),
    today
  );
}

/**
 * Posts the day's birthdays once the guild's announcement hour is reached, at
 * most once per guild-local day. A day missed while the bot was down is not
 * caught up the next day.
 */
export async function runGuildDay(
  client: Client<true>,
  module: Module<BirthdayConfigSchema>,
  guildId: string,
  now: Date
): Promise<void> {
  // A guild the bot left keeps its rows, like its configuration: nothing to
  // post there.
  if (!client.guilds.cache.has(guildId)) {
    return;
  }
  const config = await configService.getConfigForModuleIn(module, guildId);
  const { lastDay } = await birthdayService.getState(guildId);
  const day = dueDay(now, config.get("timeZone"), config.get("hour"), lastDay);
  if (day === null) {
    return;
  }

  // Fetched before the day is claimed: when Discord does not answer, the
  // next hour tries again instead of losing the day.
  const guild = await client.guilds.fetch(guildId);
  const members = await allMembers(guild);
  if (!(await birthdayService.claimDay(guildId, day))) {
    return;
  }
  const today = localTime(now, config.get("timeZone"));
  await announceBirthdays(guild, config, members, today).catch((err: unknown) =>
    logFailure(err, `Failed to announce the birthdays | guildId = ${guildId}`)
  );
  // After the wishes, and on its own: a calendar is not worth losing them.
  await postMonthlyCalendar(guildId, config, members, today).catch(
    (err: unknown) =>
      logFailure(
        err,
        `Failed to post the birthday calendar | guildId = ${guildId}`
      )
  );
  logger.info(`Day announced | guildId = ${guildId} | day = ${day}`);
}

export async function runAllGuildDays(
  client: Client<true>,
  module: Module<BirthdayConfigSchema>,
  now = new Date()
): Promise<void> {
  for (const guildId of await moduleService.getActivatedGuildIds(module.id)) {
    await runGuildDay(client, module, guildId, now).catch((err: unknown) =>
      logger.error({ err }, `Failed to run the day | guildId = ${guildId}`)
    );
  }
}
