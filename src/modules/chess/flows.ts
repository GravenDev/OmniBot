import type { ChatInputCommandInteraction } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import type { ChessSession } from "./types.js";
import { editable, listMessage } from "./views.js";

/** Called once the interaction has been deferred as ephemeral. */
export async function startListFlow(
  interaction: ChatInputCommandInteraction,
  session: ChessSession,
  config: ConfigProvider<{}>
): Promise<void> {
  await interaction.editReply(
    editable(listMessage(session, config.t, config.locale))
  );
}
