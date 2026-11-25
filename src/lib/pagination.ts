import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { TFunction } from "./i18n.js";

function pageButton(customId: string, label: string, disabled: boolean) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);
}

export interface PageRowOptions {
  /** Label of the previous button; defaults to the shared "Previous" text. */
  previousLabel?: string;
  /** Label of the next button; defaults to the shared "Next" text. */
  nextLabel?: string;
  /** Set to false to drop the disabled page indicator button. */
  indicator?: boolean;
}

/**
 * Previous / "Page x/y" / Next buttons. `id` builds each button's custom id
 * from the page it leads to ("indicator" for the middle one, when shown);
 * `indicatorKey` is the module's key for the "Page x/y" label, given
 * `current` and `total`.
 */
export function pageRow(
  t: TFunction,
  id: (target: number | string) => string,
  page: number,
  pageCount: number,
  indicatorKey: string,
  options: PageRowOptions = {}
) {
  const previous = pageButton(
    id(page - 1),
    options.previousLabel ?? t("config.previous"),
    page <= 1
  );
  const next = pageButton(
    id(page + 1),
    options.nextLabel ?? t("config.next"),
    page >= pageCount
  );
  if (options.indicator === false) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(previous, next);
  }
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    previous,
    pageButton(
      id("indicator"),
      t(indicatorKey, { current: page, total: pageCount }),
      true
    ).setStyle(ButtonStyle.Success),
    next
  );
}
