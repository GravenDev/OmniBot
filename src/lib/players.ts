import type { Image } from "@napi-rs/canvas";
import type { Client, Guild } from "discord.js";
import { fetchAvatar } from "./imaging.js";

export interface Player {
  name: string;
  avatar: Image | null;
}

async function fetchGuild(
  client: Client,
  guildId: string
): Promise<Guild | null> {
  return (
    client.guilds.cache.get(guildId) ??
    (await client.guilds.fetch(guildId).catch(() => null))
  );
}

async function resolvePlayer(
  client: Client,
  guild: Guild | null,
  userId: string
): Promise<Player | null> {
  const member = await guild?.members.fetch(userId).catch(() => null);
  if (member) {
    return { name: member.displayName, avatar: await fetchAvatar(member) };
  }
  const user = await client.users.fetch(userId).catch(() => null);
  if (user) {
    return { name: user.displayName, avatar: await fetchAvatar(user) };
  }
  return null;
}

export async function resolvePlayers(
  client: Client,
  guildId: string,
  userIds: Iterable<string>
): Promise<Map<string, Player>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) {
    return new Map();
  }
  const guild = await fetchGuild(client, guildId);
  const entries = await Promise.all(
    ids.map(
      async (userId) =>
        [userId, await resolvePlayer(client, guild, userId)] as const
    )
  );
  return new Map(
    entries.filter((entry): entry is [string, Player] => entry[1] !== null)
  );
}
