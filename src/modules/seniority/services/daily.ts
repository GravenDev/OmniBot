import type {
  Client,
  Collection,
  Guild,
  GuildMember,
  MessageCreateOptions,
} from "discord.js";
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
import { allMembers } from "#lib/guild-members.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { postCard } from "#lib/post-card.js";
import type { SeniorityConfigSchema } from "../seniority.config.js";
import {
  memberAnniversaryMessages,
  memberMentionMessages,
  serverAnniversaryMessage,
} from "./announcements.js";
import { celebratedMembers, seniorityCard, serverCard } from "./cards.js";
import * as state from "./state.js";

const logger = loggerMaker("seniority");

type Config = ConfigProvider<SeniorityConfigSchema>;

async function send(
  config: Config,
  guildId: string,
  message: MessageCreateOptions,
  userIds: string[]
): Promise<void> {
  const channel = config.get("channel");
  if (!channel?.isSendable()) {
    return;
  }
  await channel.send({
    ...message,
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
  const celebrated = celebratedMembers(
    members.values(),
    today,
    config.get("timeZone")
  );
  if (celebrated.length === 0) {
    return;
  }
  // Images never notify: the text names everyone, the image only the first
  // ones, and only the first message carries it.
  const [first, ...others] = memberMentionMessages(
    config.t,
    celebrated.map(({ member }) => member.id)
  );
  const posted = await postCard(
    logger,
    `the member anniversaries | guildId = ${guild.id}`,
    () => seniorityCard(config, celebrated, today),
    (card) =>
      send(
        config,
        guild.id,
        { content: first!.content, files: [card] },
        first!.userIds
      )
  );
  const messages = posted
    ? others
    : memberAnniversaryMessages(
        config.t,
        celebrated.map(({ member, years }) => ({ userId: member.id, years }))
      );
  for (const { content, userIds } of messages) {
    await send(config, guild.id, { content }, userIds);
  }
}

async function announceServer(
  guild: Guild,
  config: Config,
  members: Collection<string, GuildMember> | null,
  years: number
): Promise<void> {
  const posted = await postCard(
    logger,
    `the server anniversary | guildId = ${guild.id}`,
    () => serverCard(guild, config, members?.values() ?? [], years),
    (card) =>
      send(
        config,
        guild.id,
        {
          content: config.t("serverCard.content", { count: years }),
          files: [card],
        },
        []
      )
  );
  if (!posted) {
    await send(
      config,
      guild.id,
      {
        content: serverAnniversaryMessage(config.t, {
          years,
          members: guild.memberCount,
        }),
      },
      []
    );
  }
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
  // the next hour tries again instead of losing the day. The server's card
  // needs them too, for its longest-standing member.
  const guild = await client.guilds.fetch(guildId);
  const today = localTime(now, timeZone);
  const serverYears = config.get("serverAnniversary")
    ? anniversaryYears(guild.createdAt, today, timeZone)
    : null;
  const members =
    config.get("memberAnniversaries") || serverYears !== null
      ? await allMembers(guild)
      : null;
  await state.claimDay(guildId, day);
  if (members && config.get("memberAnniversaries")) {
    await attempt(guildId, "member anniversaries", () =>
      announceMembers(guild, config, members, today)
    );
  }
  if (serverYears !== null) {
    await attempt(guildId, "the server anniversary", () =>
      announceServer(guild, config, members, serverYears)
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
