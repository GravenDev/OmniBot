import { RESTJSONErrorCodes } from "discord.js";
import { describe, expect, it } from "vitest";
import { creationFailure } from "./creation-failures.js";

describe("creationFailure", () => {
  it("names each expected refusal by its real cause", () => {
    expect(creationFailure(RESTJSONErrorCodes.UnknownMessage)).toEqual({
      reason: "message deleted",
      level: "debug",
    });
    expect(creationFailure(RESTJSONErrorCodes.UnknownChannel)).toEqual({
      reason: "channel deleted",
      level: "debug",
    });
    expect(
      creationFailure(RESTJSONErrorCodes.ThreadAlreadyCreatedForMessage)
    ).toEqual({ reason: "thread already exists", level: "debug" });
    expect(creationFailure(RESTJSONErrorCodes.MaximumActiveThreads)).toEqual({
      reason: "thread limit reached",
      level: "throttled",
    });
    for (const code of [
      RESTJSONErrorCodes.MissingPermissions,
      RESTJSONErrorCodes.MissingAccess,
    ]) {
      expect(creationFailure(code)).toEqual({
        reason: "missing permissions",
        level: "throttled",
      });
    }
  });

  it("leaves anything else to the error log", () => {
    expect(creationFailure(RESTJSONErrorCodes.ThreadLocked)).toBeNull();
    expect(creationFailure(undefined)).toBeNull();
  });
});
