import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";

const MISSING_PERMISSION_CODES: ReadonlySet<number | string> = new Set([
  RESTJSONErrorCodes.MissingPermissions,
  RESTJSONErrorCodes.MissingAccess,
]);

export function errorMessageKey<Fallback extends string>(
  err: unknown,
  fallback: Fallback
): Fallback | "interaction.missingPermissions" {
  if (
    err instanceof DiscordAPIError &&
    MISSING_PERMISSION_CODES.has(err.code)
  ) {
    return "interaction.missingPermissions";
  }
  return fallback;
}
