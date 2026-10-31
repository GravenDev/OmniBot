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
  // Only a cached member: the dispatcher drops interactions of an uncached
  // guild.
  const ids = interaction.inCachedGuild()
    ? [...interaction.member.roles.cache.keys()]
    : [];
  return ids.some((id) => allowed.has(id));
}
