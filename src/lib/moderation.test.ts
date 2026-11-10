import { DiscordAPIError, RESTJSONErrorCodes, type Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
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

  it("treats an id Discord knows no user for as gone", async () => {
    await expect(
      fetchMember(
        guildFailingWith(apiError(RESTJSONErrorCodes.UnknownUser)),
        "author"
      )
    ).resolves.toBeNull();
  });

  it("can ask Discord rather than the cache", async () => {
    const fetch = vi.fn(async () => ({ id: "author" }));
    const guild = { members: { fetch } } as unknown as Guild;
    await fetchMember(guild, "author", { force: true });
    expect(fetch).toHaveBeenCalledWith({ user: "author", force: true });
  });

  it("does not mistake another failure for a member who left", async () => {
    const error = new Error("network down");

    await expect(fetchMember(guildFailingWith(error), "author")).rejects.toBe(
      error
    );
  });
});
