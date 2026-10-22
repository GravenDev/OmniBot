import {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type Client,
  type Message,
} from "discord.js";
import configService from "#core/services/config.service.js";
import mentionService from "#core/services/mention.service.js";
import moduleService from "#core/services/module.service.js";
import type { ConfigProvider } from "#lib/config.js";
import type { TFunction } from "#lib/i18n.js";
import { PALETTE } from "#lib/imaging.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { resolvePlayers } from "#lib/players.js";
import { TREND_COLORS } from "#lib/stat-card.js";
import { formatSpaced } from "#modules/rngdle/rendering/format.js";
import {
  renderRollCard,
  type CardBadge,
  type CardHighlight,
} from "#modules/rngdle/rendering/roll-card.js";
import { ACCENT } from "#modules/rngdle/rendering/theme.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";
import { fetchRollBadges } from "./badges.js";
import { nextUtcMidnight, startOfUtcDay } from "./reminders.js";
import { formatPercent, TIERS, type Tier } from "./scoring.js";
import { parseShare, type Placement, type SharedRoll } from "./share.js";
import store, { type StoredRoll } from "./store.js";
import sync from "./sync.js";

const logger = loggerMaker("rngdle");

const DAY_MS = 24 * 60 * 60 * 1000;
const ANNOUNCE_WINDOW_MS = 3 * 60 * 60 * 1000;
const AVERAGE_MIN_ROLLS = 5;
const RANK_ICONS = ["🥇", "🥈", "🥉"];
const CARD_NAME = "rngdle-roll.png";

type Config = ConfigProvider<RngdleConfigSchema>;

interface CardContext {
  client: Client;
  guildId: string;
  t: TFunction;
  locale: string;
}

interface CardRoll {
  userId: string;
  number: number;
  score: number;
  badgeCount: number;
  rolledAt: Date;
}

function tierOf(rarity: string): Tier | null {
  return TIERS.find((tier) => tier === rarity.toUpperCase()) ?? null;
}

async function cardBadges(
  roll: CardRoll,
  shared: SharedRoll | null
): Promise<{ badges: CardBadge[]; badgeCount: number }> {
  const remote = await fetchRollBadges(roll.number);
  if (remote) {
    return {
      badges: remote.badges.map((badge) => ({
        emoji: badge.emoji,
        label: badge.label,
        tier: tierOf(badge.rarity),
        ep: badge.ep,
        probability: Number.isFinite(badge.probability)
          ? badge.probability
          : null,
      })),
      badgeCount: remote.badges.length,
    };
  }
  if (shared) {
    return {
      badges: shared.badges.map((badge) => ({
        ...badge,
        ep: null,
        probability: null,
      })),
      badgeCount: shared.badges.length + shared.hiddenBadges,
    };
  }
  return { badges: [], badgeCount: roll.badgeCount };
}

function averageOf(rolls: StoredRoll[]): number {
  return rolls.reduce((sum, roll) => sum + roll.score, 0) / rolls.length;
}

export function computeHighlights(
  t: TFunction,
  roll: CardRoll,
  previous: StoredRoll[],
  today: StoredRoll[]
): CardHighlight[] {
  const highlights: CardHighlight[] = [];
  if (
    previous.length > 0 &&
    previous.every((earlier) => roll.score > earlier.score)
  ) {
    highlights.push({
      icon: "🏆",
      text: t("card.personalBest"),
      color: ACCENT,
    });
  }

  const others = today.filter((other) => other.userId !== roll.userId);
  if (others.length > 0) {
    const rank = 1 + others.filter((other) => other.score > roll.score).length;
    highlights.push({
      icon: RANK_ICONS[rank - 1] ?? "🎯",
      text: t("card.rank", { rank, count: others.length + 1 }),
      color: rank === 1 ? ACCENT : PALETTE.title,
    });
  }

  if (previous.length >= AVERAGE_MIN_ROLLS) {
    const delta = Math.round(roll.score - averageOf(previous));
    highlights.push({
      icon: delta >= 0 ? "📈" : "📉",
      text: t("card.vsAverage", {
        delta: `${delta >= 0 ? "+" : "−"}${formatSpaced(Math.abs(delta))}`,
      }),
      color: delta >= 0 ? TREND_COLORS.up : TREND_COLORS.down,
    });
  }
  return highlights;
}

async function linkedHighlights(
  context: CardContext,
  roll: CardRoll
): Promise<CardHighlight[]> {
  const day = startOfUtcDay(roll.rolledAt);
  const [previous, today] = await Promise.all([
    store.rolls(context.guildId, { userId: roll.userId, to: day }),
    store.rolls(context.guildId, { from: day, to: nextUtcMidnight(day) }),
  ]);
  return computeHighlights(context.t, roll, previous, today);
}

function placementText(t: TFunction, placement: Placement): string {
  return t(placement.top ? "card.top" : "card.bottom", {
    percent: `${placement.percent}%`,
  });
}

export async function buildCard(
  context: CardContext,
  roll: CardRoll,
  shared: SharedRoll | null,
  linked: boolean
): Promise<Buffer> {
  const { t } = context;
  const [table, { badges, badgeCount }, players, highlights] =
    await Promise.all([
      store.scoreTable(),
      cardBadges(roll, shared),
      resolvePlayers(context.client, context.guildId, [roll.userId]),
      linked ? linkedHighlights(context, roll) : Promise.resolve([]),
    ]);
  const percent = table.percentOf(roll.score);
  const player = players.get(roll.userId);

  return renderRollCard(
    {
      name: player?.name ?? "?",
      avatar: player?.avatar ?? null,
      subtitle: t("leaderboard.subtitle", {
        date: new Intl.DateTimeFormat(context.locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(roll.rolledAt),
      }),
      number: roll.number,
      score: roll.score,
      tier: table.tierOf(roll.score),
      placement: shared?.placement
        ? placementText(t, shared.placement)
        : t(percent > 50 ? "card.top" : "card.bottom", {
            percent: formatPercent(percent),
          }),
      badges,
      badgeCount,
      highlights,
    },
    {
      number: t("card.number"),
      score: t("card.score"),
      badges: t("card.badges"),
      badgeCount: t("card.badgeCount", { count: badgeCount }),
      included: t("card.included"),
      more: (count) => t("card.more", { count }),
      probability: (value) =>
        t("card.probability", {
          percent: value.toLocaleString(context.locale, {
            maximumSignificantDigits: value < 1 ? 2 : 3,
          }),
        }),
    }
  );
}

async function announce(
  client: Client<true>,
  config: Config,
  guildId: string,
  roll: StoredRoll
): Promise<void> {
  const channel = config.get("leaderboardChannel");
  if (!channel?.isSendable()) {
    return;
  }
  const day = startOfUtcDay(roll.rolledAt);
  if (
    !(await store.claimAnnouncement(guildId, roll.userId, day, roll.number))
  ) {
    return;
  }
  try {
    const image = await buildCard(
      { client, guildId, t: config.t, locale: config.locale },
      roll,
      null,
      true
    );
    const mentionable = await mentionService.mentionable(guildId, [
      roll.userId,
    ]);
    await channel.send({
      content: config.t("announce.message", { user: `<@${roll.userId}>` }),
      files: [new AttachmentBuilder(image, { name: CARD_NAME })],
      flags: MessageFlags.SuppressNotifications,
      allowedMentions: { users: mentionable },
    });
  } catch (err) {
    await store.releaseAnnouncement(guildId, roll.userId, day);
    throw err;
  }
}

async function announceGuild(
  client: Client<true>,
  module: Module<RngdleConfigSchema>,
  guildId: string,
  now: Date
): Promise<void> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  if (!config.get("leaderboardChannel")?.isSendable()) {
    return;
  }
  await sync.syncGuild(guildId);

  const day = startOfUtcDay(now);
  const since = new Date(
    Math.max(day.getTime(), now.getTime() - ANNOUNCE_WINDOW_MS)
  );
  const [rolls, announced, optOuts] = await Promise.all([
    store.rolls(guildId, { from: since }),
    store.announcedUsers(guildId, day),
    store.announcementOptOuts(guildId),
  ]);
  for (const roll of rolls) {
    if (announced.has(roll.userId) || optOuts.has(roll.userId)) {
      continue;
    }
    announced.add(roll.userId);
    await announce(client, config, guildId, roll).catch((err: unknown) =>
      logger.error(
        { err },
        `Failed to announce a roll | guildId = ${guildId} | userId = ${roll.userId}`
      )
    );
  }
}

export async function announceRolls(
  client: Client<true>,
  module: Module<RngdleConfigSchema>,
  now = new Date()
): Promise<void> {
  await store.pruneAnnouncements(
    new Date(startOfUtcDay(now).getTime() - DAY_MS)
  );
  for (const guildId of await moduleService.getActivatedGuildIds(module.id)) {
    await announceGuild(client, module, guildId, now).catch((err: unknown) =>
      logger.error(
        { err },
        `Failed to announce the rolls | guildId = ${guildId}`
      )
    );
  }
}

function canReply(message: Message<true>): boolean {
  const permissions = message.channel.permissionsFor(message.client.user);
  return (
    permissions?.has([
      PermissionFlagsBits.ViewChannel,
      message.channel.isThread()
        ? PermissionFlagsBits.SendMessagesInThreads
        : PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
    ]) ?? false
  );
}

async function linkedRoll(
  guildId: string,
  pasted: CardRoll
): Promise<CardRoll | null> {
  const today = startOfUtcDay(pasted.rolledAt);
  const recent = await store.rolls(guildId, {
    userId: pasted.userId,
    from: new Date(today.getTime() - DAY_MS),
  });
  const stored = recent.find((roll) => roll.number === pasted.number);
  if (stored) {
    return stored;
  }
  return recent.some((roll) => roll.rolledAt >= today) ? null : pasted;
}

export async function answerShare(
  message: Message,
  config: Config | undefined
): Promise<void> {
  if (!config?.get("shareCards") || message.author.bot || !message.inGuild()) {
    return;
  }
  const shared = parseShare(message.content);
  if (!shared || !canReply(message)) {
    return;
  }

  const { guildId } = message;
  const userId = message.author.id;
  const pasted: CardRoll = {
    userId,
    number: shared.number,
    score: shared.score,
    badgeCount: shared.badges.length + shared.hiddenBadges,
    rolledAt: message.createdAt,
  };
  const linked = (await store.account(guildId, userId)) !== null;
  const roll = linked ? await linkedRoll(guildId, pasted) : pasted;
  if (!roll) {
    return;
  }
  const day = startOfUtcDay(roll.rolledAt);
  if (!(await store.claimAnnouncement(guildId, userId, day, roll.number))) {
    return;
  }
  try {
    const image = await buildCard(
      { client: message.client, guildId, t: config.t, locale: config.locale },
      roll,
      shared,
      linked
    );
    await message.reply({
      files: [new AttachmentBuilder(image, { name: CARD_NAME })],
      allowedMentions: { parse: [], repliedUser: false },
    });
  } catch (err) {
    await store.releaseAnnouncement(guildId, userId, day);
    throw err;
  }
}
