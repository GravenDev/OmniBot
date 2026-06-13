import {
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  type AnySelectMenuInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { ConfigType } from "../../lib/config.js";
import type { CompatibleInteraction } from "../../lib/interaction.js";
import { EntitySelectConfigHandler } from "./entity-select.config-handler.js";

export default class RoleConfigHandler extends EntitySelectConfigHandler<ConfigType.ROLE> {
  protected override readonly selectCustomId = "set-role-config";

  constructor() {
    super(ConfigType.ROLE);
  }

  protected override buildSelectRow(
    customId: string,
    currentIds: string[],
    minValues: number,
    maxValues: number
  ): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const menu = new RoleSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(
        maxValues > 1 ? "Sélectionnez des rôles" : "Sélectionnez un rôle"
      )
      .setMinValues(minValues)
      .setMaxValues(maxValues);

    if (currentIds.length > 0) {
      menu.setDefaultRoles(...currentIds);
    }

    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      menu
    );
  }

  protected override isMatchingSelect(
    interaction: CompatibleInteraction
  ): interaction is AnySelectMenuInteraction {
    return interaction.isRoleSelectMenu();
  }
}
