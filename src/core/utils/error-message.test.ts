import { DiscordAPIError } from "discord.js";
import { describe, expect, it } from "vitest";
import { errorMessageKey } from "./error-message.js";

function apiError(code: number) {
  return new DiscordAPIError(
    { code, message: "error" },
    code,
    403,
    "POST",
    "https://discord.com/api/v10/channels/1/messages",
    {}
  );
}

describe("errorMessageKey", () => {
  it.each([50013, 50001])(
    "points to the bot permissions for Discord error %i",
    (code) => {
      expect(errorMessageKey(apiError(code), "command.failed")).toBe(
        "interaction.missingPermissions"
      );
    }
  );

  it("keeps the fallback for other Discord errors", () => {
    expect(errorMessageKey(apiError(10008), "interaction.failed")).toBe(
      "interaction.failed"
    );
  });

  it("keeps the fallback for non-Discord errors", () => {
    expect(
      errorMessageKey(
        Object.assign(new Error("boom"), { code: 50013 }),
        "command.failed"
      )
    ).toBe("command.failed");
    expect(errorMessageKey("boom", "command.failed")).toBe("command.failed");
  });
});
