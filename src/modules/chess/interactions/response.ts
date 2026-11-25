import {
  MessageFlags,
  type ButtonInteraction,
  type InteractionResponse,
  type ModalSubmitInteraction,
} from "discord.js";
import { editable, type ChessMessage } from "../views.js";

interface StatusFlow {
  deferred: InteractionResponse<boolean>;
  statusId: string;
  originalEphemeral: boolean;
}

type StatusInteraction = ButtonInteraction | ModalSubmitInteraction;

function isEphemeral(message: ChessMessage): boolean {
  return (message.flags & MessageFlags.Ephemeral) === MessageFlags.Ephemeral;
}

function isOriginalEphemeral(interaction: ButtonInteraction): boolean {
  return interaction.message.flags.has(MessageFlags.Ephemeral);
}

/**
 * Ephemeral messages exist only for their member: `Message#edit` and
 * `Message#delete` go through the channel endpoint and Discord answers with
 * `Unknown Message`. The interaction's own webhook is the supported way to
 * change a message this interaction created.
 */
function editEphemeral(
  interaction: StatusInteraction,
  id: string,
  message: ChessMessage
): Promise<unknown> {
  return interaction.webhook.editMessage(id, editable(message));
}

function deleteEphemeral(
  interaction: StatusInteraction,
  id: string
): Promise<unknown> {
  return interaction.webhook.deleteMessage(id);
}

/** Replaces an ephemeral status (for example with an error) through the webhook. */
export function updateEphemeralStatus(
  interaction: StatusInteraction,
  flow: StatusFlow,
  message: ChessMessage
): Promise<unknown> {
  return editEphemeral(interaction, flow.statusId, message);
}

/** Acknowledge a button once, then allow several edits of its message. */
export async function beginButtonEdit(
  interaction: ButtonInteraction
): Promise<(message: ChessMessage) => Promise<void>> {
  const deferred = await interaction.deferUpdate();
  return async (message) => {
    await deferred.edit(editable(message));
  };
}

/** Edits the message a button came from, whatever its visibility. */
export async function editButtonMessage(
  interaction: ButtonInteraction,
  message: ChessMessage
): Promise<void> {
  const edit = await beginButtonEdit(interaction);
  await edit(message);
}

/**
 * Acknowledges a button without changing the original message, then chooses
 * between editing that message and following up. Only an already ephemeral
 * message can be replaced: a public one always gets an ephemeral response.
 */
export async function respondToButton(
  interaction: ButtonInteraction,
  message: ChessMessage,
  replaceSameMessage = false
): Promise<void> {
  if (replaceSameMessage) {
    await editButtonMessage(interaction, message);
    return;
  }

  await interaction.deferUpdate();
  await interaction.followUp(message);
}

/** Acknowledges the button and starts an ephemeral status next to it. */
export async function deferWithEphemeralStatus(
  interaction: ButtonInteraction,
  status: ChessMessage
): Promise<StatusFlow> {
  const deferred = await interaction.deferUpdate();
  const message = await interaction.followUp(status);
  return {
    deferred,
    statusId: message.id,
    originalEphemeral: isOriginalEphemeral(interaction),
  };
}

/**
 * Finishes a status: public results delete it (the list or board stays where
 * it is), same-context ephemeral results replace the original ephemeral message
 * when that message is still the only relevant output, and all other ephemeral
 * results replace the status itself.
 */
export async function finishButtonStatus(
  flow: StatusFlow,
  interaction: ButtonInteraction,
  result: ChessMessage,
  replaceOriginal = false
): Promise<void> {
  if (!isEphemeral(result)) {
    await deleteEphemeral(interaction, flow.statusId);
    await interaction.followUp(result);
    return;
  }

  if (replaceOriginal && flow.originalEphemeral) {
    await flow.deferred.edit(editable(result));
    await deleteEphemeral(interaction, flow.statusId);
    return;
  }

  await editEphemeral(interaction, flow.statusId, result);
}

/** Acknowledges a modal with an ephemeral status, then returns a public result. */
export async function startDirectFlow(
  interaction: ModalSubmitInteraction,
  status: ChessMessage
): Promise<{
  complete(result: ChessMessage): Promise<void>;
  fail(error: ChessMessage): Promise<void>;
}> {
  const statusMessage = await interaction.reply(status);
  return {
    async complete(result) {
      await deleteEphemeral(interaction, statusMessage.id);
      await interaction.followUp(result);
    },
    async fail(error) {
      await editEphemeral(interaction, statusMessage.id, error);
    },
  };
}
