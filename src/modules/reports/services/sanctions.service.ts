import type { Guild, GuildMember } from "discord.js";
import { MAX_BAN_PURGE_SECONDS } from "#lib/moderation.js";
import { declareService, type Service } from "#lib/service.js";
import type { Sanction } from "./moderation.js";

export const AUDIT_REASON_LIMIT = 512;

export interface SanctionInput {
  reason: string | null;
  duration: number | null;
  purgeSeconds: number | null;
  auditReason: string;
  warnMessage: string;
}

/** Applies a moderator's sanction to the reported author on Discord. */
class SanctionsService implements Service {
  async apply(
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
}

export default declareService(new SanctionsService());
