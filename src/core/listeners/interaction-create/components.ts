import { MessageFlags } from "discord.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import { errorMessageKey } from "#core/utils/error-message.js";
import type { CompatibleInteraction } from "#lib/interaction.js";
import logger from "#lib/logger.js";
import { replyEphemeral } from "#lib/reply.js";
import { checkAccess } from "./access.js";
import { moduleEnabled } from "./gates.js";
import { findInteractionHandler } from "./routing.js";

export async function handleInteraction(interaction: CompatibleInteraction) {
  const [id, ...args] = interaction.customId.split(":");

  if (!id) {
    logger.warn(
      `Invalid interaction customId | customId = ${interaction.customId}`
    );
    return;
  }

  const handler = findInteractionHandler(id);

  if (!handler) {
    logger.warn(
      `Interaction handler not found | customId = ${interaction.customId}`
    );
    return;
  }

  logger.debug(
    `Interaction handler found | customId = ${interaction.customId} | module = ${handler.module.id}`
  );

  if (!interaction.guild || !interaction.guildId) {
    logger.warn(
      `Interaction outside guild | customId = ${interaction.customId}`
    );
    return;
  }

  const coreConfig = await configService.getConfigForModuleIn(
    coreModule,
    interaction.guildId
  );

  if (!(await moduleEnabled(handler.module, interaction.guild))) {
    logger.warn(
      `Interaction for disabled module | customId = ${interaction.customId} | module = ${handler.module.id} | guildId = ${interaction.guildId} | userId = ${interaction.user.id}`
    );
    await interaction.reply({
      content: coreConfig.t("interaction.moduleNotEnabled"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const config = await configService.getConfigForModuleIn(
    handler.module,
    interaction.guildId
  );

  // Read before check(): a rejecting type predicate narrows `interaction`
  // to never below.
  const checkedCustomId = interaction.customId;
  if (!handler.handler.check(interaction, config)) {
    logger.debug(`Interaction check rejected | customId = ${checkedCustomId}`);
    return;
  }

  if (!(await checkAccess(interaction, handler.handler.access, coreConfig.t))) {
    return;
  }

  try {
    logger.debug(`Executing interaction | customId = ${interaction.customId}`);
    await handler.handler.execute(interaction, args, config);
  } catch (err) {
    logger.error(
      { err },
      `Interaction handler failed | customId = ${interaction.customId} | module = ${handler.module.id} | guildId = ${interaction.guildId} | channelId = ${interaction.channelId} | userId = ${interaction.user.id}`
    );
    try {
      await replyEphemeral(
        interaction,
        coreConfig.t(errorMessageKey(err, "interaction.failed"))
      );
    } catch {
      logger.debug(`Error reply failed | customId = ${interaction.customId}`);
    }
  }
}
