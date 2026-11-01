import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";

export function isApiError(err: unknown, ...codes: number[]): boolean {
  return err instanceof DiscordAPIError && codes.includes(err.code as number);
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
