import { DiscordAPIError, RESTJSONErrorCodes, type Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import { fetchMember } from "./moderation.js";

function apiError(code: number) {
  return new DiscordAPIError(
    { code, message: "error" },
    code,
    404,
    "GET",
    "/guilds/guild/members/author",
    {}
  );
}

function guildFailingWith(error: unknown) {
  return {
    members: { fetch: () => Promise.reject(error) },
  } as unknown as Guild;
}

describe("fetchMember", () => {
  it("treats an unknown member as gone", async () => {
    await expect(
      fetchMember(
        guildFailingWith(apiError(RESTJSONErrorCodes.UnknownMember)),
        "author"
      )
    ).resolves.toBeNull();
  });

  it("does not mistake another failure for a member who left", async () => {
    const error = new Error("network down");

    await expect(fetchMember(guildFailingWith(error), "author")).rejects.toBe(
      error
    );
  });
});
