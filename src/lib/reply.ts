import {
  MessageFlags,
  type CommandInteraction,
  type MessageComponentInteraction,
  type MessageMentionOptions,
  type ModalSubmitInteraction,
} from "discord.js";

// Answers only the member behind the interaction: a reply, or a follow-up
// once the interaction was answered or deferred (a second reply would throw).
export async function replyEphemeral(
  interaction:
    | CommandInteraction
    | MessageComponentInteraction
    | ModalSubmitInteraction,
  content: string,
  allowedMentions?: MessageMentionOptions
): Promise<void> {
  const payload = {
    content,
    flags: MessageFlags.Ephemeral,
    ...(allowedMentions ? { allowedMentions } : {}),
  } as const;
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}
