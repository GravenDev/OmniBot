import type { Collection, Guild, GuildMember } from "discord.js";
import { loadAllMembers } from "#lib/guild-members.js";

/** Part of the server the paradox can be computed for, instead of all of it. */
export type GroupSelection =
  | { kind: "role"; id: string }
  | { kind: "channel"; id: string };

export interface BirthdayGroup {
  kind: GroupSelection["kind"];
  /** Role or channel mention, sent without notifying anyone. */
  mention: string;
  /** Its plain name, for the card, which cannot show a mention. */
  name: string;
  /** The group's members, bots left out: they register no birthday. */
  memberIds: Set<string>;
}

/** Whether the member cache holds the whole server, without fetching it. */
export function membersCacheComplete(guild: Guild): boolean {
  return guild.members.cache.size >= guild.memberCount;
}

function humans(members: Collection<string, GuildMember>): Set<string> {
  return new Set(
    members.filter((member) => !member.user.bot).map((member) => member.id)
  );
}

/**
 * The members of a role, or the people connected to a voice channel; null
 * when the role or channel no longer exists. Role members are fetched first
 * when the cache does not hold the whole server.
 */
export async function resolveGroup(
  guild: Guild,
  selection: GroupSelection
): Promise<BirthdayGroup | null> {
  if (selection.kind === "role") {
    if (!membersCacheComplete(guild)) {
      await loadAllMembers(guild);
    }
    const role = guild.roles.cache.get(selection.id);
    return role
      ? {
          kind: "role",
          mention: `<@&${role.id}>`,
          name: `@${role.name}`,
          memberIds: humans(role.members),
        }
      : null;
  }

  // Voice states arrive with the server (GuildVoiceStates intent): the
  // channel's members are always up to date in the cache.
  const channel = guild.channels.cache.get(selection.id);
  return channel?.isVoiceBased()
    ? {
        kind: "channel",
        mention: `<#${channel.id}>`,
        name: channel.name,
        memberIds: humans(channel.members),
      }
    : null;
}
