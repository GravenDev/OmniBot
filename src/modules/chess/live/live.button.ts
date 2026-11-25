import type { ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { replyEphemeral } from "#lib/reply.js";
import {
  editButtonMessage,
  respondToButton,
} from "../interactions/response.js";
import snapshots from "./snapshot.service.js";
import store from "./store.service.js";
import { livePly, type LiveAction } from "./types.js";
import { liveMessage } from "./views.js";

const ACTIONS = new Set<LiveAction>(["first", "prev", "next", "last"]);

/**
 * The public message belongs to the watcher, not to the member clicking it:
 * every navigation opens an in-memory snapshot, so one member cannot move the
 * board for everyone else and later clicks browse that snapshot, not the live
 * game. The copy's own buttons only edit that copy.
 */
export default declareInteractionHandler<ButtonInteraction>({
  customId: "chess-live",
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [ref, action, scope, rawPly], config) {
    if (!ACTIONS.has(action as LiveAction)) {
      await replyEphemeral(interaction, config.t("error.invalid"));
      return;
    }

    const privateCopy = scope === "e";
    const source = privateCopy
      ? snapshots.get(ref ?? "")
      : await store.get(ref ?? "");
    if (!source) {
      await replyEphemeral(interaction, config.t("error.expired"));
      return;
    }

    const current = Number(rawPly);
    const ply = livePly(
      source.moves.length,
      Number.isInteger(current) ? current : source.ply,
      action as LiveAction
    );
    const game = privateCopy ? source : snapshots.create(source);
    const message = await liveMessage(game, config.t, ply, true);

    if (privateCopy) {
      // The copy's buttons edit that copy only; a failed edit still deserves an
      // answer, so fall back to a fresh ephemeral board.
      try {
        await editButtonMessage(interaction, message);
      } catch {
        await interaction.followUp(message);
      }
      return;
    }
    await respondToButton(interaction, message, false);
  },
});
