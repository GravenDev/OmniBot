import { RESTJSONErrorCodes } from "discord.js";
import { isApiError } from "#lib/discord-errors.js";

const MISSING_PERMISSION_CODES = [
  RESTJSONErrorCodes.MissingPermissions,
  RESTJSONErrorCodes.MissingAccess,
] as const;

export function errorMessageKey<Fallback extends string>(
  err: unknown,
  fallback: Fallback
): Fallback | "interaction.missingPermissions" {
  if (isApiError(err, ...MISSING_PERMISSION_CODES)) {
    return "interaction.missingPermissions";
  }
  return fallback;
}
