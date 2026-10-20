import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import store, { type Account } from "#modules/rngdle/services/store.js";
import sync from "#modules/rngdle/services/sync.js";
import {
  historyCard,
  profileCard,
  timelineCard,
  TREND_DEFAULT_DAYS,
  trendCard,
  type ViewContext,
} from "#modules/rngdle/services/views.js";
import {
  overallPageMessage,
  pageRow,
  type Visibility,
} from "./overall-page.button.js";

const CUSTOM_ID = "rngdle-nav";
export const HISTORY_PAGE_ID = "rngdle-history";
const DAY_MS = 24 * 60 * 60 * 1000;

export const NAV_TARGETS = [
  "profile",
  "history",
  "trend",
  "timeline",
  "overall",
] as const;

export type NavTarget = (typeof NAV_TARGETS)[number];

export function navigationRow(t: TFunction, targets: readonly NavTarget[]) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    targets.map((target) =>
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_ID}:${target}`)
        .setLabel(t(`nav.${target}`))
        .setStyle(ButtonStyle.Secondary)
    )
  );
}

function notRegistered(context: ViewContext, self: boolean) {
  return {
    content: context.t(
      self ? "profile.notRegisteredSelf" : "profile.notRegistered"
    ),
  };
}

export async function profileMessage(
  context: ViewContext,
  account: Account | null,
  self: boolean
) {
  if (!account) {
    return notRegistered(context, self);
  }
  const image = await profileCard(context, account);
  return image
    ? {
        files: [
          new AttachmentBuilder(image, {
            name: `profile-${account.username}.png`,
          }),
        ],
        components: [
          navigationRow(context.t, ["history", "trend", "timeline", "overall"]),
        ],
      }
    : {
        content: context.t("profile.noRolls", { username: account.username }),
      };
}

export async function historyMessage(
  context: ViewContext,
  account: Account | null,
  self: boolean,
  count?: number,
  page = 1,
  visibility: Visibility = "public",
  now: Date = new Date()
) {
  if (!account) {
    return notRegistered(context, self);
  }
  const result = await historyCard(context, account, count, now, page);
  if (!result) {
    return {
      content: context.t("profile.noRolls", { username: account.username }),
    };
  }
  const anchor = Math.floor(now.getTime() / DAY_MS);
  const id = (target: number | string) =>
    `${HISTORY_PAGE_ID}:${target}:${account.userId}:${count ?? ""}:${visibility}:${anchor}`;
  return {
    files: [
      new AttachmentBuilder(result.image, {
        name: `history-${account.username}.png`,
      }),
    ],
    components: [
      ...(result.pageCount > 1
        ? [pageRow(context.t, id, result.page, result.pageCount)]
        : []),
      navigationRow(context.t, ["profile", "trend", "timeline", "overall"]),
    ],
  };
}

export async function timelineMessage(
  context: ViewContext,
  account: Account | null,
  self: boolean
) {
  if (!account) {
    return notRegistered(context, self);
  }
  const image = await timelineCard(context, account);
  return image
    ? {
        files: [
          new AttachmentBuilder(image, {
            name: `timeline-${account.username}.png`,
          }),
        ],
        components: [navigationRow(context.t, ["profile", "history", "trend"])],
      }
    : {
        content: context.t("profile.noRolls", { username: account.username }),
      };
}

export async function trendMessage(
  context: ViewContext,
  account: Account | null,
  self: boolean,
  days?: number
) {
  if (!account) {
    return notRegistered(context, self);
  }
  const image = await trendCard(context, account, days);
  return image
    ? {
        files: [
          new AttachmentBuilder(image, {
            name: `trend-${account.username}.png`,
          }),
        ],
        components: [
          navigationRow(context.t, ["profile", "history", "timeline"]),
        ],
      }
    : {
        content: context.t("trend.noRolls", {
          username: account.username,
          count: days ?? TREND_DEFAULT_DAYS,
        }),
      };
}

const MESSAGES = {
  profile: profileMessage,
  history: (context: ViewContext, account: Account | null, self: boolean) =>
    historyMessage(context, account, self, undefined, 1, "private"),
  trend: trendMessage,
  timeline: timelineMessage,
};

export default declareInteractionHandler<ButtonInteraction>({
  customId: CUSTOM_ID,
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [target], config) {
    if (
      !interaction.inGuild() ||
      !NAV_TARGETS.some((known) => known === target)
    ) {
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await sync.refreshIfStale(interaction.guildId);
    const context: ViewContext = {
      client: interaction.client,
      guildId: interaction.guildId,
      t: config.t,
      locale: config.locale,
    };
    if (target === "overall") {
      await interaction.editReply(
        await overallPageMessage(context, 1, interaction.user.id, "private")
      );
      return;
    }
    const account = await store.account(
      interaction.guildId,
      interaction.user.id
    );
    await interaction.editReply(
      await MESSAGES[target as Exclude<NavTarget, "overall">](
        context,
        account,
        true
      )
    );
  },
});
