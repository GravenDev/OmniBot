import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  apiErrorCode,
  isApiError,
  isDiscordApiError,
} from "./discord-errors.js";

function apiError(code: unknown): DiscordAPIError {
  return new DiscordAPIError(
    { message: "refused" } as never,
    code as never,
    400,
    "POST",
    "/channels/chan/messages",
    {}
  );
}

describe("discord-errors", () => {
  it("recognises a Discord error, with or without a code", () => {
    expect(isDiscordApiError(apiError(50013))).toBe(true);
    expect(isDiscordApiError(apiError(undefined))).toBe(true);
    expect(isDiscordApiError(new Error("network"))).toBe(false);
  });

  it("reads a numeric code only", () => {
    expect(apiErrorCode(apiError(50013))).toBe(50013);
    // An OAuth error carries a string in place of the code.
    expect(apiErrorCode(apiError("invalid_grant"))).toBeUndefined();
    expect(apiErrorCode(new Error("network"))).toBeUndefined();
  });

  it("matches one of the codes given", () => {
    const err = apiError(RESTJSONErrorCodes.MissingPermissions);
    expect(
      isApiError(
        err,
        RESTJSONErrorCodes.MissingAccess,
        RESTJSONErrorCodes.MissingPermissions
      )
    ).toBe(true);
    expect(isApiError(err, RESTJSONErrorCodes.UnknownMessage)).toBe(false);
    expect(isApiError(new Error("x"), RESTJSONErrorCodes.UnknownMessage)).toBe(
      false
    );
    // A Discord error without a numeric code matches no code.
    expect(
      isApiError(apiError(undefined), RESTJSONErrorCodes.UnknownMessage)
    ).toBe(false);
    expect(
      isApiError(apiError("invalid_grant"), RESTJSONErrorCodes.UnknownMessage)
    ).toBe(false);
  });
});
