import { EmbedBuilder, MessageFlags } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { formatRank } from "#modules/four-hour-game/services/formatting.js";
import type { PlayerRank } from "#modules/four-hour-game/services/four-hour-game.service.js";
import { Colors } from "#utils/colors.js";

// Announcements credit the winner by name without pinging anyone.
export const ANNOUNCEMENT_OPTIONS = {
  allowedMentions: { parse: [] },
  flags: MessageFlags.SuppressNotifications,
} as const;

export interface Announcement {
  title: string;
  headline: string;
  total: string;
  rank: PlayerRank | null;
  avatarUrl: string | null;
}

// The embed shared by the point and daily point announcements.
export function buildAnnouncementEmbed(
  { title, headline, total, rank, avatarUrl }: Announcement,
  t: TFunction
): EmbedBuilder {
  const summary = rank ? `${total} · ${formatRank(rank, t)}` : total;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`${headline}\n${summary}`)
    .setColor(Colors.FullGreen);
  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }
  return embed;
}
