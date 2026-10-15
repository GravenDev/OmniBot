import {
  ChannelType,
  type GuildBasedChannel,
  PermissionFlagsBits,
  PermissionsBitField,
  type Role,
} from "discord.js";

export const READ_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
];

function grants(
  channel: GuildBasedChannel,
  role: Role,
  required: bigint[]
): boolean {
  const base = channel.isThread() ? channel.parent : channel;
  if (!base) {
    return false;
  }
  const everyone = channel.guild.roles.everyone;
  const permissions = new PermissionsBitField([
    everyone.permissions,
    role.permissions,
  ]);
  for (const id of [everyone.id, role.id]) {
    const overwrite = base.permissionOverwrites.cache.get(id);
    if (overwrite) {
      permissions.remove(overwrite.deny).add(overwrite.allow);
    }
  }
  return permissions.has(required);
}

export function widensAudience(
  source: GuildBasedChannel,
  destination: GuildBasedChannel,
  ignoredRoleIds: ReadonlySet<string> = new Set()
): boolean {
  if (source.id === destination.id) {
    return false;
  }
  if (source.type === ChannelType.PrivateThread) {
    return true;
  }
  return source.guild.roles.cache.some(
    (role) =>
      !role.managed &&
      !ignoredRoleIds.has(role.id) &&
      grants(destination, role, [PermissionFlagsBits.ViewChannel]) &&
      !grants(source, role, READ_PERMISSIONS)
  );
}
