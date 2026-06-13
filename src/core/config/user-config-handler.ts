import {
  ActionRowBuilder,
  UserSelectMenuBuilder,
  type AnySelectMenuInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { ConfigType } from "../../lib/config.js";
import type { CompatibleInteraction } from "../../lib/interaction.js";
import { EntitySelectConfigHandler } from "./entity-select-config-handler.js";

export default class UserConfigHandler extends EntitySelectConfigHandler<ConfigType.USER> {
  protected override readonly selectCustomId = "set-user-config";

  constructor() {
    super(ConfigType.USER);
  }

  protected override buildSelectRow(
    customId: string,
    currentIds: string[],
    minValues: number,
    maxValues: number
  ): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const menu = new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(
        maxValues > 1
          ? "Sélectionnez des utilisateurs"
          : "Sélectionnez un utilisateur"
      )
      .setMinValues(minValues)
      .setMaxValues(maxValues);

    if (currentIds.length > 0) {
      menu.setDefaultUsers(...currentIds);
    }

    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      menu
    );
  }

  protected override isMatchingSelect(
    interaction: CompatibleInteraction
  ): interaction is AnySelectMenuInteraction {
    return interaction.isUserSelectMenu();
  }
}
