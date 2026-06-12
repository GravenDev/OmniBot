import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  type AnySelectMenuInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { ConfigType } from "../../lib/config.js";
import type { CompatibleInteraction } from "../../lib/interaction.js";
import { EntitySelectConfigHandler } from "./entity-select-config-handler.js";

export default class CategoryConfigHandler extends EntitySelectConfigHandler<ConfigType.CATEGORY> {
  protected override readonly selectCustomId = "set-category-config";

  constructor() {
    super(ConfigType.CATEGORY);
  }

  protected override buildSelectRow(
    customId: string,
    currentId: string | undefined
  ): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Sélectionnez une catégorie")
      .setChannelTypes(ChannelType.GuildCategory)
      .setMinValues(1)
      .setMaxValues(1);

    if (currentId) {
      menu.setDefaultChannels(currentId);
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
