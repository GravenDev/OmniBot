import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  type AnySelectMenuInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { ConfigType } from "../../lib/config.js";
import type { CompatibleInteraction } from "../../lib/interaction.js";
import { EntitySelectConfigHandler } from "./entity-select.config-handler.js";

export default class ChannelConfigHandler extends EntitySelectConfigHandler<ConfigType.CHANNEL> {
  protected override readonly selectCustomId = "set-channel-config";

  constructor() {
    super(ConfigType.CHANNEL);
  }

  protected override buildSelectRow(
    customId: string,
    currentIds: string[],
    minValues: number,
    maxValues: number
  ): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(
        maxValues > 1 ? "Sélectionnez des salons" : "Sélectionnez un salon"
      )
      .setChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice
      )
      .setMinValues(minValues)
      .setMaxValues(maxValues);

    if (currentIds.length > 0) {
      menu.setDefaultChannels(...currentIds);
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
