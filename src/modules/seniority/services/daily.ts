import type {
  Client,
  Collection,
  Guild,
  GuildMember,
  MessageCreateOptions,
  SendableChannels,
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
import { celebrationMessage, postCard } from "#lib/post-card.js";
import type { SeniorityConfigSchema } from "../seniority.config.js";
import {
  memberAnniversaryMessages,
  serverAnniversaryMessage,
} from "./announcements.js";
import {
  celebratedMembers,
  seniorityCard,
  serverCard,
  serverFacts,
} from "./cards.js";
import { overrides } from "./overrides.js";
import * as state from "./state.js";

const logger = loggerMaker("seniority");

type Config = ConfigProvider<SeniorityConfigSchema>;

/** Where the member anniversaries go, and the setting that names it. */
const membersTarget = (config: Config) =>
  ({ channel: config.get("channel"), setting: "channel" }) as const;

/** Where the server's anniversary goes: its own channel, or the members'. */
function serverTarget(config: Config) {
  const own = config.get("serverChannel");
  return own
    ? ({ channel: own, setting: "serverChannel" } as const)
    : membersTarget(config);
}

/**
 * The channel an announcement can be posted in, or null, logged with the
 * setting to fix: checked before the members are fetched, which would be for
 * nothing.
 */
function postable(
  { channel, setting }: ReturnType<typeof serverTarget>,
  guildId: string,
  what: string
): SendableChannels | null {
  if (channel?.isSendable()) {
    return channel;
  }
  logger[channel ? "warn" : "debug"](
    `Announcement skipped | what = ${what} | reason = ${channel ? "channel not sendable" : "no channel"} | setting = ${setting} | channelId = ${channel?.id ?? "none"} | guildId = ${guildId}`
  );
  return null;
}

async function send(
  channel: SendableChannels,
  guildId: string,
  message: MessageCreateOptions,
  userIds: string[]
): Promise<void> {
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
  channel: SendableChannels,
  members: Collection<string, GuildMember>,
  recomputed: ReadonlyMap<string, Date>,
  today: CalendarDay
): Promise<void> {
  const celebrated = celebratedMembers(
    members.values(),
    today,
    config.get("timeZone"),
    recomputed
  );
  if (celebrated.length === 0) {
    return;
  }
  // The heading, the card, then the members grouped by years; more messages
  // carry the groups only. Mentioned without a push notification: nobody
  // signed up for it, and a large server celebrates dozens a day.
  const [first, ...others] = memberAnniversaryMessages(
    config.t,
    celebrated.map(({ member, years }) => ({ userId: member.id, years }))
  );
  const heading = config.t("members.heading");
  const posted = await postCard(
    logger,
    `the member anniversaries | guildId = ${guild.id}`,
    () => seniorityCard(config, celebrated, today),
    (card) =>
      send(
        channel,
        guild.id,
        celebrationMessage({
          heading,
          card,
          text: first!.content,
          silent: true,
        }),
        first!.userIds
      )
  );
  if (!posted) {
    await send(
      channel,
      guild.id,
      celebrationMessage({ heading, text: first!.content, silent: true }),
      first!.userIds
    );
  }
  for (const { content, userIds } of others) {
    await send(
      channel,
      guild.id,
      celebrationMessage({ text: content, silent: true }),
      userIds
    );
  }
  logger.info(
    `Member anniversaries announced | guildId = ${guild.id} | count = ${celebrated.length} | card = ${posted}`
  );
}

async function announceServer(
  guild: Guild,
  config: Config,
  channel: SendableChannels,
  members: Collection<string, GuildMember> | null,
  recomputed: ReadonlyMap<string, Date>,
  years: number
): Promise<void> {
  const posted = await postCard(
    logger,
    `the server anniversary | guildId = ${guild.id}`,
    () => serverCard(guild, config, members?.values() ?? [], years, recomputed),
    (card) =>
      send(
        channel,
        guild.id,
        celebrationMessage({
          heading: config.t("serverCard.content", { count: years }),
          card,
        }),
        []
      )
  );
  if (!posted) {
    await send(
      channel,
      guild.id,
      {
        content: serverAnniversaryMessage(
          config.t,
          config.locale,
          serverFacts(guild, config, members?.values() ?? [], years, recomputed)
        ),
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
  // Checked first: members fetched for an announcement that can go nowhere
  // would be for nothing.
  const membersChannel = config.get("memberAnniversaries")
    ? postable(membersTarget(config), guildId, "member anniversaries")
    : null;
  const serverChannel =
    serverYears !== null
      ? postable(serverTarget(config), guildId, "the server anniversary")
      : null;
  const members =
    membersChannel || serverChannel ? await allMembers(guild) : null;
  const recomputed = members
    ? await overrides(guildId)
    : new Map<string, Date>();
  await state.claimDay(guildId, day);
  if (members && membersChannel) {
    await attempt(guildId, "member anniversaries", () =>
      announceMembers(guild, config, membersChannel, members, recomputed, today)
    );
  }
  if (serverYears !== null && serverChannel) {
    await attempt(guildId, "the server anniversary", () =>
      announceServer(
        guild,
        config,
        serverChannel,
        members,
        recomputed,
        serverYears
      )
    );
  }
  logger.info(
    `Day announced | guildId = ${guildId} | day = ${day} | memberAnniversaries = ${config.get("memberAnniversaries")} | serverYears = ${serverYears ?? "none"}`
  );
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
