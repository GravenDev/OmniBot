import { RESTJSONErrorCodes, type Guild, type GuildMember } from "discord.js";
import { isApiError } from "./discord-errors.js";

export const MAX_BAN_PURGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * The member, or null when they are not on the server, or when Discord knows no
 * user with that id (a deleted account still has one). `force` asks Discord rather than the cache, which can keep a
 * member whose departure the bot missed.
 */
export async function fetchMember(
  guild: Guild,
  userId: string,
  { force = false } = {}
): Promise<GuildMember | null> {
  try {
    return await guild.members.fetch(
      force ? { user: userId, force: true } : userId
    );
  } catch (error) {
    if (
      isApiError(
        error,
        RESTJSONErrorCodes.UnknownMember,
        RESTJSONErrorCodes.UnknownUser
      )
    ) {
      return null;
    }
    throw error;
  }
}

export async function isBanned(guild: Guild, userId: string): Promise<boolean> {
  try {
    await guild.bans.fetch({ user: userId, force: true });
    return true;
  } catch (error) {
    if (isApiError(error, RESTJSONErrorCodes.UnknownBan)) {
      return false;
    }
    throw error;
  }
}
