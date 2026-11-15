import type { Image } from "@napi-rs/canvas";
import type { Client } from "discord.js";
import { fetchImage } from "#lib/imaging.js";
import { resolvePlayers } from "#lib/players.js";
import { declareService, type Service } from "#lib/service.js";
import { avatarUrl } from "#modules/clash-of-code/api.js";
import type { StoredPlayer } from "#modules/clash-of-code/stats.js";

/** The images the cards show, from Discord and CodinGame. */
class AvatarsService implements Service {
  async guildIcon(client: Client, guildId: string): Promise<Image | null> {
    const guild =
      client.guilds.cache.get(guildId) ??
      (await client.guilds.fetch(guildId).catch(() => null));
    return fetchImage(guild?.iconURL({ extension: "png", size: 128 }) ?? null);
  }

  codingameAvatar(avatarId: bigint | null): Promise<Image | null> {
    return fetchImage(avatarId === null ? null : avatarUrl(avatarId));
  }

  /** The CodinGame avatar, or the Discord one of a linked member who has none. */
  async playerAvatars(
    client: Client,
    guildId: string,
    players: StoredPlayer[]
  ): Promise<Map<number, Image | null>> {
    const discordIds = players
      .filter((player) => player.avatarId === null && player.userId)
      .map((player) => player.userId!);
    const discord = await resolvePlayers(client, guildId, discordIds);
    const avatars = await Promise.all(
      players.map(async (player) => {
        const avatar =
          player.avatarId !== null
            ? await this.codingameAvatar(player.avatarId)
            : (discord.get(player.userId ?? "")?.avatar ?? null);
        return [player.codingamerId, avatar] as const;
      })
    );
    return new Map(avatars);
  }
}

export default declareService(new AvatarsService());
