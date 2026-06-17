import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import type { TFunction } from "#lib/i18n.js";

export async function getCoreT(guildId: string): Promise<TFunction> {
  const config = await configService.getConfigForModuleIn(coreModule, guildId);
  return config.t;
}

export async function replyWithCoreT(
  interaction: {
    guildId: string | null;
    reply(opts: InteractionReplyOptions): unknown;
  },
  key: string,
  options?: Record<string, unknown>
): Promise<void> {
  const t = await getCoreT(interaction.guildId!);
  await interaction.reply({
    content: t(key, options),
    flags: MessageFlags.Ephemeral,
  });
}
