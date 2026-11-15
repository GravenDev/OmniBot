import type { Guild } from "discord.js";

export async function fetchWinnerAvatar(
  guild: Guild,
  userId: string
): Promise<string | null> {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    const owner = member ?? (await guild.client.users.fetch(userId));
    return owner.displayAvatarURL({ size: 128 });
  } catch {
    return null;
  }
}
