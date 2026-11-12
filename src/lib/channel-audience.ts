import { type GuildBasedChannel, PermissionFlagsBits } from "discord.js";

export const READ_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
];

export function isNsfw(channel: GuildBasedChannel): boolean {
  const base = channel.isThread() ? channel.parent : channel;
  return !!base && "nsfw" in base && base.nsfw;
}

// The ids of the channels and categories a module's config excludes.
export function excludedIdsOf(
  ...lists: readonly ({ id: string }[] | null | undefined)[]
): Set<string> {
  return new Set(lists.flatMap((list) => list ?? []).map(({ id }) => id));
}

// Whether a channel is excluded: itself, its category, or for a thread its
// parent channel and that channel's category.
export function isExcluded(
  channel: GuildBasedChannel,
  excludedIds: ReadonlySet<string>
): boolean {
  const ids = [channel.id, channel.parentId];
  if (channel.isThread()) {
    ids.push(channel.parent?.parentId ?? null);
  }
  return ids.some((id) => id !== null && excludedIds.has(id));
}
