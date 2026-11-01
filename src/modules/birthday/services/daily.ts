import type { Client, Collection, Guild, GuildMember } from "discord.js";
import configService from "#core/services/config.service.js";
import mentionService from "#core/services/mention.service.js";
import moduleService from "#core/services/module.service.js";
import {
  celebratesOn,
  dueDay,
  localTime,
  type CalendarDay,
} from "#lib/calendar.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import type { BirthdayConfigSchema } from "../birthday.config.js";
import { birthdayMessage } from "./announcements.js";
import birthdayService, { type BirthdayEntry } from "./birthday.service.js";
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

async function send(
  config: Config,
  guildId: string,
  content: string,
  userIds: string[]
): Promise<void> {
  const channel = config.get("channel");
  if (!channel?.isSendable()) {
    return;
  }
  await channel.send({
    content,
    allowedMentions: {
      users: await mentionService.mentionable(guildId, userIds),
    },
  });
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
  if (announced.length > 0) {
    await send(
      config,
      guild.id,
      birthdayMessage(
        config.t,
        config.locale,
        config.get("messages") ?? [],
        announced
      ),
      announced
    );
  }
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
  const members = await guild.members.fetch();
  if (!(await birthdayService.claimDay(guildId, day))) {
    return;
  }
  await announceBirthdays(
    guild,
    config,
    members,
    localTime(now, config.get("timeZone"))
  ).catch((err: unknown) =>
    logFailure(err, `Failed to announce the birthdays | guildId = ${guildId}`)
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
