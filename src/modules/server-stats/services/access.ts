import { PermissionFlagsBits, type Interaction } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";

/** Administrators, and members with one of the `allowedRoles`. */
export function canSeeStats(
  interaction: Interaction,
  config: ConfigProvider<ServerStatsConfigSchema>
): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  const allowed = new Set(
    (config.get("allowedRoles") ?? []).map((role) => role.id)
  );
  // A cached member holds a role manager, an uncached one the role ids.
  const roles = interaction.member?.roles;
  const ids = Array.isArray(roles) ? roles : [...(roles?.cache.keys() ?? [])];
  return ids.some((id) => allowed.has(id));
}
