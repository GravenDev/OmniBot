import moduleService from "#core/services/module.service.js";
import type { TFunction } from "#lib/i18n.js";
import { modulesMessage, modulesPageOf } from "./core-messages.js";

/**
 * The `/modules` panel of a guild, at a page number or at the page that lists
 * a module id (to stay on it after enabling or disabling that module).
 */
export async function modulesPanel(
  guildId: string,
  t: TFunction,
  at: number | string = 0
) {
  const [modulesState, unavailable] = await Promise.all([
    moduleService.getAllModulesStateIn(guildId),
    moduleService.getUnavailableModulesStateIn(guildId),
  ]);
  const page =
    typeof at === "string" ? modulesPageOf(at, modulesState, unavailable) : at;
  return modulesMessage(modulesState, t, unavailable, page);
}
