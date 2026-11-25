import type { ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { replyEphemeral } from "#lib/reply.js";
import store from "../services/session.service.js";
import { listMessage } from "../views.js";
import { ownedSession } from "./common.js";
import { respondToButton } from "./response.js";

export default declareInteractionHandler<ButtonInteraction>({
  customId: "chess-list",
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [sessionId, target], config) {
    const session = await ownedSession(interaction, sessionId!, config.t);
    if (!session) return;

    const page = Number(target);
    if (!Number.isInteger(page) || page < 1) {
      await replyEphemeral(interaction, config.t("error.invalid"));
      return;
    }

    store.update(session.id, { page });
    await respondToButton(
      interaction,
      listMessage(session, config.t, config.locale, page),
      true
    );
  },
});
