import { EmbedBuilder } from "discord.js";
import type { TFunction } from "#lib/i18n.js";

const HONEY_COLOR = 0xf5a623;

export function counterEmbed(
  t: TFunction,
  count: number,
  lastAt: Date
): EmbedBuilder {
  const when = `<t:${Math.floor(lastAt.getTime() / 1000)}:R>`;
  return new EmbedBuilder()
    .setColor(HONEY_COLOR)
    .setTitle(t("counter.title"))
    .setDescription(
      `${t("counter.count", { count })}\n${t("counter.last", { when })}`
    )
    .setFooter({ text: t("counter.footer") });
}
