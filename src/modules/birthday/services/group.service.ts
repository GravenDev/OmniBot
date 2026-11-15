import type { Guild } from "discord.js";
import { loadAllMembers } from "#lib/guild-members.js";
import {
  cachedGroup,
  membersCacheComplete,
  type BirthdayGroup,
  type GroupSelection,
} from "#modules/birthday/group.js";

/**
 * The members of a role, or the people connected to a voice channel; null
 * when the role or channel no longer exists. Role members are fetched first
 * when the cache does not hold the whole server.
 */
export async function resolveGroup(
  guild: Guild,
  selection: GroupSelection
): Promise<BirthdayGroup | null> {
  if (selection.kind === "role" && !membersCacheComplete(guild)) {
    await loadAllMembers(guild);
  }
  return cachedGroup(guild, selection);
}
