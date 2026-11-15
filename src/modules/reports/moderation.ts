import type { GuildMember } from "discord.js";

export type Sanction = "warn" | "timeout" | "kick" | "ban" | "softban";

export type SanctionBlock =
  | "targetLeft"
  | "targetIsSelf"
  | "targetIsOwner"
  | "moderatorBelow"
  | "botBelow"
  | "alreadyBanned";

export const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;

export interface Rank {
  id: string;
  isOwner: boolean;
  position: number;
}

export interface TargetRank extends Rank {
  botCan: { timeout: boolean; kick: boolean; ban: boolean };
}

export function sanctionBlock(
  sanction: Sanction,
  moderator: Rank,
  target: TargetRank | null
): SanctionBlock | null {
  if (!target) {
    return sanction === "ban" || sanction === "softban" ? null : "targetLeft";
  }
  if (target.id === moderator.id) {
    return "targetIsSelf";
  }
  if (target.isOwner) {
    return "targetIsOwner";
  }
  if (!moderator.isOwner && moderator.position <= target.position) {
    return "moderatorBelow";
  }
  const power = sanction === "softban" ? "ban" : sanction;
  if (power !== "warn" && !target.botCan[power]) {
    return "botBelow";
  }
  return null;
}

export function rankOf(member: GuildMember): Rank {
  return {
    id: member.id,
    isOwner: member.guild.ownerId === member.id,
    position: member.roles.highest.position,
  };
}

export function targetRankOf(member: GuildMember): TargetRank {
  return {
    ...rankOf(member),
    botCan: {
      timeout: member.moderatable,
      kick: member.kickable,
      ban: member.bannable,
    },
  };
}
