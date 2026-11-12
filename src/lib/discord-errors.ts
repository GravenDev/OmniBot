import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";

// Whether Discord's API refused the call, whatever the reason: as opposed to
// a network failure or a bug, which deserve to be rethrown.
export function isDiscordApiError(err: unknown): err is DiscordAPIError {
  // oxlint-disable-next-line omnibot/discord-error-codes -- the helper itself
  return err instanceof DiscordAPIError;
}

// Whether Discord refused the call with one of `codes`. At least one code:
// "any Discord error" is isDiscordApiError, not an empty list.
export function isApiError(
  err: unknown,
  code: number,
  ...codes: number[]
): boolean {
  const actual = apiErrorCode(err);
  return actual !== undefined && (actual === code || codes.includes(actual));
}

// The JSON error code of an error Discord's API returned, undefined for any
// other error (a network failure, a bug) and for an OAuth error, whose code
// is a string.
export function apiErrorCode(err: unknown): number | undefined {
  return isDiscordApiError(err) && typeof err.code === "number"
    ? err.code
    : undefined;
}

// Discord refusing an action because of how the guild is set up: a permission
// withdrawn, a channel or a role deleted. Worth a warning in a daily task,
// not an error every day.
export function isGuildSetupError(err: unknown): boolean {
  return isApiError(
    err,
    RESTJSONErrorCodes.MissingAccess,
    RESTJSONErrorCodes.MissingPermissions,
    RESTJSONErrorCodes.UnknownChannel,
    RESTJSONErrorCodes.UnknownRole
  );
}
