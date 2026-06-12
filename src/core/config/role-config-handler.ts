import {
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  type AnySelectMenuInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { ConfigType } from "../../lib/config.js";
import type { CompatibleInteraction } from "../../lib/interaction.js";
import { EntitySelectConfigHandler } from "./entity-select-config-handler.js";

export default class RoleConfigHandler extends EntitySelectConfigHandler<ConfigType.ROLE> {
  protected override readonly selectCustomId = "set-role-config";

  constructor() {
    super(ConfigType.ROLE);
  }

  protected override buildSelectRow(
    customId: string,
    currentId: string | undefined
  ): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const menu = new RoleSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Sélectionnez un rôle")
      .setMinValues(1)
      .setMaxValues(1);

    if (currentId) {
      menu.setDefaultRoles(currentId);
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
