import type { TFunction } from "#lib/i18n.js";
import birthdayService from "./birthday.service.js";

/**
 * Disabling the module deletes the guild's birthdays, which only their
 * members can register again: `/modules` asks for confirmation first, unless
 * there is nothing to lose.
 */
export async function uninstallWarning(
  guildId: string,
  t: TFunction
): Promise<string | null> {
  const count = await birthdayService.count(guildId);
  return count === 0 ? null : t("uninstall.warning", { count });
}
