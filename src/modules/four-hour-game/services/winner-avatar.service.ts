import type { Guild } from "discord.js";
import { declareService, type Service } from "#lib/service.js";

class WinnerAvatarService implements Service {
  async fetchWinnerAvatar(
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
}

export default declareService(new WinnerAvatarService());
