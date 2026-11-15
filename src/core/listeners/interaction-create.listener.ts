import type { Interaction } from "discord.js";
import { createT } from "#lib/i18n.js";
import { declareEventListener } from "#lib/listener.js";
import logger from "#lib/logger.js";
import { replyEphemeral } from "#lib/reply.js";
import { handleComplete } from "./interaction-create/autocomplete.js";
import { handleCommand } from "./interaction-create/commands.js";
import { handleInteraction } from "./interaction-create/components.js";

// Each kind of interaction has its handler in interaction-create/: find what
// it targets, stop outside a guild or for a disabled module, check access,
// load the module's config, then run it and answer an error if it throws.
async function dispatch(interaction: Interaction) {
  if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
    await handleCommand(interaction);
    return;
  }

  if (interaction.isAutocomplete()) {
    await handleComplete(interaction);
    return;
  }

  if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
    await handleInteraction(interaction);
  }
}

// Last resort when dispatch itself fails (database, config loading…): the
// guild locale may be unreachable, so the user's own locale is used.
async function replyDispatchFailure(interaction: Interaction) {
  if (interaction.isAutocomplete()) {
    if (!interaction.responded) await interaction.respond([]);
    return;
  }

  if (!interaction.isRepliable()) return;

  await replyEphemeral(
    interaction,
    createT(interaction.locale, "core")("interaction.failed")
  );
}

export default declareEventListener({
  eventType: "interactionCreate",
  execute: async (interaction) => {
    try {
      await dispatch(interaction);
    } catch (err) {
      logger.error(
        { err },
        `Interaction dispatch failed | type = ${interaction.type} | guildId = ${interaction.guildId} | userId = ${interaction.user.id}`
      );
      try {
        await replyDispatchFailure(interaction);
      } catch {
        logger.debug("Dispatch failure reply failed");
      }
    }
  },
});
