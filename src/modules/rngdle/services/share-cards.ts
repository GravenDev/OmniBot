import {
  AttachmentBuilder,
  MessageFlags,
  type Client,
  type Message,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { formatInteger, formatPercentage } from "#lib/format.js";
import type { TFunction } from "#lib/i18n.js";
import { PALETTE } from "#lib/imaging.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS_REPLY } from "#lib/mentions.js";
import { canReplyWithFile } from "#lib/permissions.js";
import { resolvePlayers } from "#lib/players.js";
import { TREND_COLORS } from "#lib/stat-card.js";
import {
  renderRollCard,
  type CardBadge,
  type CardHighlight,
} from "#modules/rngdle/rendering/roll-card.js";
import { ACCENT } from "#modules/rngdle/rendering/theme.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";
import { fetchRollBadges } from "./badges.js";
import { DAY_MS, nextUtcMidnight, startOfUtcDay } from "./days.js";
import { formatPercent, TIERS, type Tier } from "./scoring.js";
import { parseShare, type Placement, type SharedRoll } from "./share.js";
import store, { type Account, type StoredRoll } from "./store.js";
import sync from "./sync.js";

const logger = loggerMaker("rngdle");

const AVERAGE_MIN_ROLLS = 5;
const RANK_ICONS = ["🥇", "🥈", "🥉"];
const CARD_NAME = "rngdle-roll.png";
const CHECK_WINDOW_MS = 10 * 60 * 1000;
// Checks of rngdle.com a member may trigger in a window, back to back: a roll
// made logged out, maybe another, then the recorded one. The calculator gets
// one, as an unlinked member's result is checked only before the day's card.
const CHECKS_PER_WINDOW = { rngdle: 3, calculator: 1 } as const;

/**
 * Each member's current window of checks, per source: when it started, how
 * many checks it allowed, and the rolls rngdle.com was asked for in vain.
 */
const checkWindows = new Map<
  string,
  { start: number; count: number; missed: Set<number> }
>();

type Config = ConfigProvider<RngdleConfigSchema>;

interface CardContext {
  client: Client;
  guildId: string;
  t: TFunction;
  locale: string;
}

// Where the data of a card comes from: a roll rngdle.com recorded for a
// linked member, a result the calculator confirmed, or the pasted text alone.
type CardSource = "linked" | "calculator" | "pasted";

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
  shared: SharedRoll | null,
  source: CardSource
): Promise<{ badges: CardBadge[]; badgeCount: number }> {
  const remote =
    source === "pasted" ? null : await fetchRollBadges(roll.number);
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
  today: StoredRoll[],
  locale: string
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
        delta: `${delta >= 0 ? "+" : "−"}${formatInteger(Math.abs(delta), locale)}`,
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
  return computeHighlights(context.t, roll, previous, today, context.locale);
}

function placementText(
  t: TFunction,
  placement: Placement,
  locale: string
): string {
  return t(placement.top ? "card.top" : "card.bottom", {
    percent: formatPercentage(placement.percent, locale, 2),
  });
}

export async function buildCard(
  context: CardContext,
  roll: CardRoll,
  shared: SharedRoll | null,
  source: CardSource
): Promise<Buffer> {
  const { t } = context;
  const [table, { badges, badgeCount }, players, highlights] =
    await Promise.all([
      store.scoreTable(),
      cardBadges(roll, shared, source),
      resolvePlayers(context.client, context.guildId, [roll.userId]),
      source === "linked"
        ? linkedHighlights(context, roll)
        : Promise.resolve([]),
    ]);
  const percent = table.percentOf(roll.score);
  const player = players.get(roll.userId);

  return renderRollCard(
    {
      name: player?.name ?? "?",
      avatar: player?.avatar ?? null,
      subtitle: [
        t("leaderboard.subtitle", {
          date: new Intl.DateTimeFormat(context.locale, {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(roll.rolledAt),
        }),
        // Only a linked member's recorded roll comes from rngdle.com itself.
        ...(source === "linked" ? [] : [t("card.notLinked")]),
      ].join(" · "),
      number: roll.number,
      score: roll.score,
      tier: table.tierOf(roll.score),
      // A verified card ranks the recorded score, never the pasted text.
      placement:
        source === "pasted" && shared?.placement
          ? placementText(t, shared.placement, context.locale)
          : t(percent > 50 ? "card.top" : "card.bottom", {
              percent: formatPercent(percent, context.locale),
            }),
      badges,
      badgeCount,
      highlights,
    },
    {
      locale: context.locale,
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

export async function pruneCards(now = new Date()): Promise<void> {
  await store.pruneCardClaims(new Date(startOfUtcDay(now).getTime() - DAY_MS));
}

interface Verified {
  roll: CardRoll;
  linked: boolean;
}

type Source = keyof typeof CHECKS_PER_WINDOW;

const checkKey = (guildId: string, userId: string, source: Source) =>
  `${guildId}:${userId}:${source}`;

function windowOf(guildId: string, userId: string, source: Source) {
  const key = checkKey(guildId, userId, source);
  const now = Date.now();
  let current = checkWindows.get(key);
  if (!current || now - current.start >= CHECK_WINDOW_MS) {
    current = { start: now, count: 0, missed: new Set() };
    checkWindows.set(key, current);
  }
  return current;
}

// The windows are kept per source: a member who links their account is
// checked on rngdle.com at once, even if the calculator checked a result a
// minute before.
function mayCheck(guildId: string, userId: string, source: Source): boolean {
  const current = windowOf(guildId, userId, source);
  if (current.count >= CHECKS_PER_WINDOW[source]) {
    return false;
  }
  current.count++;
  return true;
}

/**
 * rngdle.com answered without the pasted roll: pasted again by mistake, it is
 * not asked for again, and the window's other checks are kept for the
 * member's recorded roll.
 */
function rememberMiss(guildId: string, userId: string, number: number): void {
  windowOf(guildId, userId, "rngdle").missed.add(number);
}

function alreadyMissed(guildId: string, userId: string, number: number) {
  return windowOf(guildId, userId, "rngdle").missed.has(number);
}

/** rngdle.com did not answer: not asked again before the window ends. */
function closeWindow(guildId: string, userId: string): void {
  windowOf(guildId, userId, "rngdle").count = CHECKS_PER_WINDOW.rngdle;
}

// The member's rolls of the pasted result's day and of the day before.
function recentRolls(account: Account, today: Date): Promise<StoredRoll[]> {
  return store.rolls(account.guildId, {
    userId: account.userId,
    from: new Date(today.getTime() - DAY_MS),
  });
}

function findPasted(
  recent: StoredRoll[],
  pasted: CardRoll
): StoredRoll | undefined {
  return recent.find((roll) => roll.number === pasted.number);
}

// The pasted roll once the member's rolls are downloaded, null when
// rngdle.com did not record it, undefined when it could not be asked.
async function refreshedRoll(
  account: Account,
  pasted: CardRoll,
  today: Date
): Promise<StoredRoll | null | undefined> {
  try {
    await sync.refreshAccount(account);
  } catch (err) {
    logger.warn(
      { err },
      `Could not check a shared roll | guildId = ${account.guildId} | username = ${account.username}`
    );
    return undefined;
  }
  return findPasted(await recentRolls(account, today), pasted) ?? null;
}

async function calculatorRoll(pasted: CardRoll): Promise<CardRoll | null> {
  const remote = await fetchRollBadges(pasted.number);
  return remote?.score === pasted.score ? pasted : null;
}

// Checks a pasted result against the rolls rngdle.com recorded (linked
// member), up to 3 times in 10 minutes, or against the calculator (unlinked
// member), once in 10 minutes. A roll rngdle.com was just asked for in vain
// is not asked for again, and a request that fails closes the window. An
// unlinked member's result is checked only before the day's card; a linked
// member's, until the day's roll is downloaded: rngdle.com records one a
// day, so another number cannot be found there. A card drawn before linking
// does not count, the member's roll is still to be downloaded. Any other
// result gets an unverified card, drawn without a single request.
async function verify(
  guildId: string,
  userId: string,
  pasted: CardRoll
): Promise<Verified | null> {
  const account = await store.account(guildId, userId);
  const today = startOfUtcDay(pasted.rolledAt);
  const recent = account ? await recentRolls(account, today) : [];
  const known = findPasted(recent, pasted);
  if (known) {
    return { roll: known, linked: true };
  }
  const settled = account
    ? recent.some((roll) => roll.rolledAt >= today)
    : await store.hasCard(guildId, userId, today);
  if (
    settled ||
    (account && alreadyMissed(guildId, userId, pasted.number)) ||
    !mayCheck(guildId, userId, account ? "rngdle" : "calculator")
  ) {
    return null;
  }
  if (account) {
    const roll = await refreshedRoll(account, pasted, today);
    if (roll === null) {
      rememberMiss(guildId, userId, pasted.number);
    } else if (roll === undefined) {
      closeWindow(guildId, userId);
    }
    return roll ? { roll, linked: true } : null;
  }
  const roll = await calculatorRoll(pasted);
  return roll && { roll, linked: false };
}

export async function answerShare(
  message: Message,
  config: Config | undefined
): Promise<void> {
  if (
    !config?.get("shareCards") ||
    message.author.bot ||
    !message.inGuild() ||
    message.channelId !== config.get("leaderboardChannel")?.id
  ) {
    return;
  }
  const shared = parseShare(message.content);
  if (!shared || !canReplyWithFile(message)) {
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
  const verified = await verify(guildId, userId, pasted);
  const day = verified && startOfUtcDay(verified.roll.rolledAt);
  const claimed =
    verified !== null &&
    day !== null &&
    (await store.claimCard(guildId, userId, day));
  // A linked member who pastes again a roll already shown keeps its real
  // data, as long as the text matches what rngdle.com recorded.
  const genuine =
    verified !== null &&
    (claimed || (verified.linked && verified.roll.score === pasted.score));
  try {
    const image = await buildCard(
      { client: message.client, guildId, t: config.t, locale: config.locale },
      genuine ? verified.roll : pasted,
      // Only the badges of the pasted text may reach a verified card, when the
      // calculator does not answer: nothing else lists them.
      shared,
      genuine ? (verified.linked ? "linked" : "calculator") : "pasted"
    );
    await message.reply({
      files: [new AttachmentBuilder(image, { name: CARD_NAME })],
      allowedMentions: NO_MENTIONS_REPLY,
      // The pasted result already notified the channel: no second push.
      flags: MessageFlags.SuppressNotifications,
    });
  } catch (err) {
    if (claimed) {
      await store.releaseCard(guildId, userId, day);
    }
    throw err;
  }
}
