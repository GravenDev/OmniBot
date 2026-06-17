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

export default class ChannelConfigHandler extends EntitySelectConfigHandler<ConfigType.CHANNEL> {
  protected override readonly selectCustomId = "set-channel-config";

  constructor() {
    super(ConfigType.CHANNEL);
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
          ? t("select.channel.selectMultiple")
          : t("select.channel.selectSingle")
      )
      .setChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice
      )
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
