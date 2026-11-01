import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { TFunction } from "./i18n.js";

function pageButton(customId: string, label: string, disabled: boolean) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);
}

/**
 * Previous / "Page x/y" / Next buttons. `id` builds each button's custom id
 * from the page it leads to ("indicator" for the middle one, always
 * disabled); `indicatorKey` is the module's key for the "Page x/y" label,
 * given `current` and `total`.
 */
export function pageRow(
  t: TFunction,
  id: (target: number | string) => string,
  page: number,
  pageCount: number,
  indicatorKey: string
) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    pageButton(id(page - 1), t("config.previous"), page <= 1),
    pageButton(
      id("indicator"),
      t(indicatorKey, { current: page, total: pageCount }),
      true
    ).setStyle(ButtonStyle.Success),
    pageButton(id(page + 1), t("config.next"), page >= pageCount)
  );
}
