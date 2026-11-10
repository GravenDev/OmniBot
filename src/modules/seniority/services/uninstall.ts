import type { TFunction } from "#lib/i18n.js";
import { count } from "./overrides.js";

/**
 * Disabling the module deletes the recomputed seniorities, which an
 * administrator must then recompute one member at a time: `/modules` asks
 * for confirmation first, unless there is nothing to lose.
 */
export async function uninstallWarning(
  guildId: string,
  t: TFunction
): Promise<string | null> {
  const recomputed = await count(guildId);
  return recomputed === 0
    ? null
    : t("uninstall.warning", { count: recomputed });
}
