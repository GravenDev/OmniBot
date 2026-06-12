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
    currentId: string | undefined
  ): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const menu = new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Sélectionnez un utilisateur")
      .setMinValues(1)
      .setMaxValues(1);

    if (currentId) {
      menu.setDefaultUsers(currentId);
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
