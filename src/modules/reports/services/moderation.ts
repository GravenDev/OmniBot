import type { Guild, GuildMember } from "discord.js";
import { MAX_BAN_PURGE_SECONDS } from "#lib/moderation.js";

export type Sanction = "warn" | "timeout" | "kick" | "ban" | "softban";

export type SanctionBlock =
  | "targetLeft"
  | "targetIsSelf"
  | "targetIsOwner"
  | "moderatorBelow"
  | "botBelow"
  | "alreadyBanned";

export const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;
export const AUDIT_REASON_LIMIT = 512;

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

export interface SanctionInput {
  reason: string | null;
  duration: number | null;
  purgeSeconds: number | null;
  auditReason: string;
  warnMessage: string;
}

export async function applySanction(
  guild: Guild,
  member: GuildMember | null,
  userId: string,
  sanction: Sanction,
  input: SanctionInput
): Promise<void> {
  const reason = input.auditReason.slice(0, AUDIT_REASON_LIMIT);
  switch (sanction) {
    case "warn":
      await member!.send(input.warnMessage);
      return;
    case "timeout":
      await member!.timeout(input.duration! * 1000, reason);
      return;
    case "kick":
      await member!.kick(reason);
      return;
    case "ban":
      await guild.bans.create(userId, {
        reason,
        deleteMessageSeconds: input.purgeSeconds ?? 0,
      });
      return;
    case "softban":
      await guild.bans.create(userId, {
        reason,
        deleteMessageSeconds: input.purgeSeconds ?? MAX_BAN_PURGE_SECONDS,
      });
      await guild.bans.remove(userId, reason);
      return;
  }
}
