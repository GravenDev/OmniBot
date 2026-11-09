import { AttachmentBuilder, type Guild, type GuildMember } from "discord.js";
import {
  anniversaryYears,
  formatDate,
  formatDayOfYear,
  type CalendarDay,
  type DayOfYear,
} from "#lib/calendar.js";
import {
  renderCelebrationImage,
  SHOWN_PORTRAITS,
  type CelebrationCard,
} from "#lib/celebration-card.js";
import type { ConfigProvider } from "#lib/config.js";
import { formatInteger } from "#lib/format.js";
import type { TFunction } from "#lib/i18n.js";
import { fetchAvatar, fetchImage } from "#lib/imaging.js";
import { truncate } from "#lib/text.js";
import { ACCENT, CONFETTI } from "../rendering/theme.js";
import type { SeniorityConfigSchema } from "../seniority.config.js";

type Config = ConfigProvider<SeniorityConfigSchema>;

const ALT_TEXT_LIMIT = 1024;

export interface Celebrated {
  member: GuildMember;
  years: number;
}

/** Members whose arrival anniversary is `today`, longest-standing first; bots excluded. */
export function celebratedMembers(
  members: Iterable<GuildMember>,
  today: CalendarDay,
  timeZone: string
): Celebrated[] {
  const celebrated: Celebrated[] = [];
  for (const member of members) {
    if (member.user.bot || !member.joinedAt) {
      continue;
    }
    const years = anniversaryYears(member.joinedAt, today, timeZone);
    if (years !== null) {
      celebrated.push({ member, years });
    }
  }
  return celebrated.sort(
    (a, b) => a.member.joinedAt!.getTime() - b.member.joinedAt!.getTime()
  );
}

/** A card's text, its portraits aside, and its alternative text. */
export interface CardText {
  card: Omit<CelebrationCard, "avatars">;
  alt: string;
}

/**
 * What the day's card says: up to `SHOWN_PORTRAITS` members, each with their
 * years; past that, how many members per years, since the portraits already
 * end on "+N" and names cut short help no one. The text mentions everyone,
 * and the alternative text names them all.
 */
export function membersCardText(
  t: TFunction,
  locale: string,
  people: { name: string; years: number }[],
  day: DayOfYear
): CardText {
  const yearsText = (count: number) => t("membersCard.years", { count });
  const named = ({ name, years }: { name: string; years: number }) =>
    t("membersCard.entry", { name, years: yearsText(years) });
  return {
    card: {
      accent: ACCENT,
      confetti: CONFETTI,
      kicker: t("membersCard.kicker"),
      title: t("membersCard.title", { count: people.length }),
      names:
        people.length <= SHOWN_PORTRAITS
          ? people.map(named).join(" · ")
          : yearsSummary(t, byYears(people), yearsText),
      footer: `📅  ${formatDayOfYear(day, locale)}`,
    },
    alt: truncate(
      t("membersCard.alt", { names: people.map(named).join(", ") }),
      ALT_TEXT_LIMIT
    ),
  };
}

/** Years groups the card names before gathering the rest under "others". */
const SHOWN_GROUPS = 3;

/**
 * "5 ans : 3 · 4 ans : 8", the longest-standing first. Past `SHOWN_GROUPS`
 * groups the rest are counted together: the line holds about seven groups,
 * and a server old enough to have more would see a count cut in half.
 */
function yearsSummary(
  t: TFunction,
  groups: [number, number][],
  yearsText: (count: number) => string
): string {
  const shown =
    groups.length > SHOWN_GROUPS ? groups.slice(0, SHOWN_GROUPS) : groups;
  const others = groups
    .slice(shown.length)
    .reduce((sum, [, count]) => sum + count, 0);
  return shown
    .map(([years, count]) =>
      t("membersCard.group", { count, years: yearsText(years) })
    )
    .concat(others > 0 ? [t("membersCard.others", { count: others })] : [])
    .join(" · ");
}

/** How many people per years, longest-standing first. */
function byYears(people: { years: number }[]): [number, number][] {
  const counts = new Map<number, number>();
  for (const { years } of people) {
    counts.set(years, (counts.get(years) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => b - a);
}

/** The day's card of the members celebrated, longest-standing first. */
export async function seniorityCard(
  config: Config,
  celebrated: readonly Celebrated[],
  day: DayOfYear
): Promise<AttachmentBuilder> {
  const { card, alt } = membersCardText(
    config.t,
    config.locale,
    celebrated.map(({ member, years }) => ({
      name: member.displayName,
      years,
    })),
    day
  );
  const avatars = await Promise.all(
    celebrated.map(({ member }, index) =>
      // Only the first ones are drawn.
      index < SHOWN_PORTRAITS ? fetchAvatar(member, 256) : null
    )
  );
  const image = await renderCelebrationImage(
    { ...card, avatars },
    { loop: config.get("loopCard") }
  );
  return new AttachmentBuilder(image.data, {
    name: `seniority.${image.extension}`,
    description: alt,
  });
}

export interface ServerFacts {
  years: number;
  createdOn: string;
  members: number;
  /** The longest-standing member, bots excluded; none on a server of bots only. */
  eldest: { name: string; since: string } | null;
}

export function serverCardText(
  t: TFunction,
  locale: string,
  { years, createdOn, members, eldest }: ServerFacts
): CardText {
  const memberCount = t("serverCard.members", {
    count: members,
    formatted: formatInteger(members, locale),
  });
  const eldestLine =
    eldest && t("serverCard.eldest", { name: eldest.name, date: eldest.since });
  return {
    card: {
      accent: ACCENT,
      confetti: CONFETTI,
      kicker: t("serverCard.kicker"),
      title: t("serverCard.title", { count: years }),
      names: t("serverCard.subtitle"),
      details: [memberCount, ...(eldestLine ? [eldestLine] : [])],
      footer: `📅  ${t("serverCard.created", { date: createdOn })}`,
    },
    alt: truncate(
      [
        t("serverCard.alt", { count: years, created: createdOn, memberCount }),
        ...(eldestLine ? [`${eldestLine}.`] : []),
      ].join(" "),
      ALT_TEXT_LIMIT
    ),
  };
}

/** The server's anniversary card, with its longest-standing member (bots excluded). */
export async function serverCard(
  guild: Guild,
  config: Config,
  members: Iterable<GuildMember>,
  years: number
): Promise<AttachmentBuilder> {
  const timeZone = config.get("timeZone");
  let eldest: GuildMember | null = null;
  for (const member of members) {
    if (
      !member.user.bot &&
      member.joinedAt &&
      (!eldest || member.joinedAt < eldest.joinedAt!)
    ) {
      eldest = member;
    }
  }
  const { card, alt } = serverCardText(config.t, config.locale, {
    years,
    createdOn: formatDate(guild.createdAt, config.locale, timeZone),
    members: guild.memberCount,
    eldest: eldest && {
      name: eldest.displayName,
      since: formatDate(eldest.joinedAt!, config.locale, timeZone),
    },
  });
  const icon = await fetchImage(guild.iconURL({ extension: "png", size: 256 }));
  const image = await renderCelebrationImage(
    { ...card, avatars: [icon] },
    { loop: config.get("loopCard") }
  );
  return new AttachmentBuilder(image.data, {
    name: `server-anniversary.${image.extension}`,
    description: alt,
  });
}
