import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  type AnySelectMenuInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { ConfigType } from "#lib/config.js";
import type { CompatibleInteraction } from "#lib/interaction.js";
import { EntitySelectConfigHandler } from "./entity-select.config-handler.js";
import type { SelectRowContext } from "./select.config-handler.js";

export default class CategoryConfigHandler extends EntitySelectConfigHandler<ConfigType.CATEGORY> {
  protected override readonly selectCustomId = "set-category-config";

  constructor() {
    super(ConfigType.CATEGORY);
  }

  protected override buildSelectRow({
    customId,
    current,
    minValues,
    maxValues,
    t,
  }: SelectRowContext): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(
        maxValues > 1
          ? t("select.category.selectMultiple")
          : t("select.category.selectSingle")
      )
      .setChannelTypes(ChannelType.GuildCategory)
      .setMinValues(minValues)
      .setMaxValues(maxValues);

    if (current.length > 0) {
      menu.setDefaultChannels(...current);
    }

    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      menu
    );
  }

  protected override isMatchingSelect(
    interaction: CompatibleInteraction
  ): interaction is AnySelectMenuInteraction {
    return interaction.isChannelSelectMenu();
  }
}
