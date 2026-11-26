import { PermissionFlagsBits, type ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { replyEphemeral } from "#lib/reply.js";
import store from "../services/live-store.service.js";
import watcher from "../services/watcher.service.js";
import { editable } from "../views.js";
import { liveMessage } from "./views.js";

/**
 * Stops a public watch. The member who started it may, and so may a member
 * who manages messages: the board is theirs to moderate like any message.
 */
export default declareInteractionHandler<ButtonInteraction>({
  customId: "chess-live-stop",
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [id], config) {
    const game = await store.get(id ?? "");
    if (!game) {
      await replyEphemeral(interaction, config.t("error.expired"));
      return;
    }
    const allowed =
      interaction.user.id === game.ownerId ||
      (interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ??
        false);
    if (!allowed) {
      await replyEphemeral(interaction, config.t("live.stopNotAllowed"));
      return;
    }

    // Acknowledge first: redrawing the board must not eat Discord's 3 s.
    await interaction.deferUpdate();
    await store.unwatch(game.id);
    watcher.forget(game.id);
    await interaction.editReply(
      editable(await liveMessage(game, config.t, game.ply, false, true))
    );
  },
});
