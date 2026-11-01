import type { Client, Collection, Guild, GuildMember } from "discord.js";
import configService from "#core/services/config.service.js";
import mentionService from "#core/services/mention.service.js";
import moduleService from "#core/services/module.service.js";
import {
  anniversaryYears,
  dueDay,
  localTime,
  type CalendarDay,
} from "#lib/calendar.js";
import type { ConfigProvider } from "#lib/config.js";
import { isGuildSetupError } from "#lib/discord-errors.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import type { SeniorityConfigSchema } from "../seniority.config.js";
import {
  memberAnniversaryMessages,
  serverAnniversaryMessage,
  type MemberAnniversary,
} from "./announcements.js";
import * as state from "./state.js";

const logger = loggerMaker("seniority");

type Config = ConfigProvider<SeniorityConfigSchema>;

export function memberAnniversaries(
  members: Iterable<GuildMember>,
  today: CalendarDay,
  timeZone: string
): MemberAnniversary[] {
  const anniversaries: MemberAnniversary[] = [];
  for (const member of members) {
    if (member.user.bot || !member.joinedAt) {
      continue;
    }
    const years = anniversaryYears(member.joinedAt, today, timeZone);
    if (years !== null) {
      anniversaries.push({ userId: member.id, years });
    }
  }
  return anniversaries;
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

async function announceMembers(
  guild: Guild,
  config: Config,
  members: Collection<string, GuildMember>,
  today: CalendarDay
): Promise<void> {
  const anniversaries = memberAnniversaries(
    members.values(),
    today,
    config.get("timeZone")
  );
  for (const { content, userIds } of memberAnniversaryMessages(
    config.t,
    anniversaries
  )) {
    await send(config, guild.id, content, userIds);
  }
}

async function announceServer(
  guild: Guild,
  config: Config,
  today: CalendarDay
): Promise<void> {
  const years = anniversaryYears(
    guild.createdAt,
    today,
    config.get("timeZone")
  );
  if (years === null) {
    return;
  }
  await send(
    config,
    guild.id,
    serverAnniversaryMessage(config.t, {
      years,
      members: guild.memberCount,
    }),
    []
  );
}

/** Each announcement is attempted even when another one failed. */
async function attempt(
  guildId: string,
  what: string,
  run: () => Promise<void>
): Promise<void> {
  await run().catch((err: unknown) => {
    const message = `Failed to announce ${what} | guildId = ${guildId}`;
    if (isGuildSetupError(err)) {
      logger.warn({ err }, message);
    } else {
      logger.error({ err }, message);
    }
  });
}

/**
 * Posts the day's anniversaries once the guild's announcement hour is
 * reached, at most once per guild-local day. A day missed while the bot was
 * down is not caught up the next day.
 */
export async function runGuildDay(
  client: Client<true>,
  module: Module<SeniorityConfigSchema>,
  guildId: string,
  now: Date
): Promise<void> {
  if (!client.guilds.cache.has(guildId)) {
    return;
  }
  const config = await configService.getConfigForModuleIn(module, guildId);
  const timeZone = config.get("timeZone");
  const day = dueDay(
    now,
    timeZone,
    config.get("hour"),
    await state.lastDay(guildId)
  );
  if (day === null) {
    return;
  }

  // Members fetched before the day is claimed: when Discord does not answer,
  // the next hour tries again instead of losing the day.
  const guild = await client.guilds.fetch(guildId);
  const today = localTime(now, timeZone);
  const members = config.get("memberAnniversaries")
    ? await guild.members.fetch()
    : null;
  await state.claimDay(guildId, day);
  if (members) {
    await attempt(guildId, "member anniversaries", () =>
      announceMembers(guild, config, members, today)
    );
  }
  if (config.get("serverAnniversary")) {
    await attempt(guildId, "the server anniversary", () =>
      announceServer(guild, config, today)
    );
  }
  logger.info(`Day announced | guildId = ${guildId} | day = ${day}`);
}

export async function runAllGuildDays(
  client: Client<true>,
  module: Module<SeniorityConfigSchema>,
  now = new Date()
): Promise<void> {
  for (const guildId of await moduleService.getActivatedGuildIds(module.id)) {
    await runGuildDay(client, module, guildId, now).catch((err: unknown) =>
      logger.error({ err }, `Failed to run the day | guildId = ${guildId}`)
    );
  }
}
