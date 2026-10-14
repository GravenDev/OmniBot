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
import store, { type Account } from "#modules/rngdle/services/store.service.js";
import sync from "#modules/rngdle/services/sync.service.js";
import views, {
  type ViewContext,
} from "#modules/rngdle/services/views.service.js";
import { overallPageMessage } from "./overall-page.button.js";

const CUSTOM_ID = "rngdle-nav";

export const NAV_TARGETS = ["profile", "overall"] as const;

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

export async function profileMessage(
  context: ViewContext,
  account: Account | null,
  self: boolean
) {
  if (!account) {
    return {
      content: context.t(
        self ? "profile.notRegisteredSelf" : "profile.notRegistered"
      ),
    };
  }
  const image = await views.profileCard(context, account);
  return image
    ? {
        files: [
          new AttachmentBuilder(image, {
            name: `profile-${account.username}.png`,
          }),
        ],
        components: [navigationRow(context.t, ["overall"])],
      }
    : {
        content: context.t("profile.noRolls", { username: account.username }),
      };
}

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
    await interaction.editReply(
      target === "profile"
        ? await profileMessage(
            context,
            await store.account(interaction.guildId, interaction.user.id),
            true
          )
        : await overallPageMessage(context, 1, interaction.user.id, "private")
    );
  },
});
