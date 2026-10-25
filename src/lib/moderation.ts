import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type Guild,
  type GuildMember,
} from "discord.js";

export const MAX_BAN_PURGE_SECONDS = 7 * 24 * 60 * 60;

export async function fetchMember(
  guild: Guild,
  userId: string
): Promise<GuildMember | null> {
  try {
    return await guild.members.fetch(userId);
  } catch (error) {
    if (
      error instanceof DiscordAPIError &&
      error.code === RESTJSONErrorCodes.UnknownMember
    ) {
      return null;
    }
    throw error;
  }
}
