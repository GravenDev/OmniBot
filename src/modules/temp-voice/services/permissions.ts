import {
  PermissionFlagsBits,
  type GuildMember,
  type PermissionsString,
  type VoiceBasedChannel,
} from "discord.js";

export const REQUIRED_PERMISSIONS: PermissionsString[] = [
  "ViewChannel",
  "Connect",
  "ManageChannels",
  "ManageRoles",
  "MoveMembers",
  "SendMessages",
];

export function isModerator(
  member: GuildMember,
  channel: VoiceBasedChannel
): boolean {
  return member.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels);
}

export function isProtected(
  member: GuildMember,
  channel: VoiceBasedChannel
): boolean {
  return (
    member.id === member.client.user.id ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissionsIn(channel).has(PermissionFlagsBits.MoveMembers) ||
    isModerator(member, channel)
  );
}
