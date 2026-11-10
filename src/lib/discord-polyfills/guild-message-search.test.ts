import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import {
  DiscordAPIError,
  Guild,
  RESTJSONErrorCodes,
  type REST,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  isSearchDenied,
  SearchNotReadyError,
  searchGuildMessagesPage,
} from "./guild-message-search.js";

// The waits for the index resolve at once, each one recorded.
const sleep = vi.hoisted(() => vi.fn(async (_ms: number) => undefined));
vi.mock("node:timers/promises", () => ({ setTimeout: sleep }));

const notReady = (retryAfter: number) => ({
  message: "Index not yet available",
  code: 110000,
  documents_indexed: 0,
  retry_after: retryAfter,
});

const page = { messages: [[{ id: "1", channel_id: "c" }]], total_results: 1 };

/** The `.js` files under `dir` whose source contains `needle`. */
function filesMentioning(dir: string, needle: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".js"))
    .filter((file) =>
      fs.readFileSync(path.join(dir, file), "utf8").includes(needle)
    );
}

describe("guild message search polyfill", () => {
  // discord.js's sources, wherever its search ends up and whatever its name.
  const discordJs = path.dirname(
    createRequire(import.meta.url).resolve("discord.js")
  );

  it("is still needed: discord.js does not call the search route yet", () => {
    // Failing? discord.js now ships the search (discordjs/discord.js#11459,
    // as Guild#searchMessages there): move the callers to it and delete this
    // polyfill. Its sources are read rather than a method name checked, so a
    // renamed or moved method fails this too.
    expect(filesMentioning(discordJs, "guildMessagesSearch")).toEqual([]);
    expect("searchMessages" in Guild.prototype).toBe(false);
  });

  it("reads discord.js's sources, so the check above can fail", () => {
    expect(filesMentioning(discordJs, "Routes.").length).toBeGreaterThan(10);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omnibot-sentinel-"));
    try {
      fs.mkdirSync(path.join(dir, "structures"));
      fs.writeFileSync(
        path.join(dir, "structures", "Guild.js"),
        "this.client.rest.get(Routes.guildMessagesSearch(this.id));"
      );
      expect(filesMentioning(dir, "guildMessagesSearch")).toEqual([
        path.join("structures", "Guild.js"),
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("searchGuildMessagesPage", () => {
  const rest = (get: ReturnType<typeof vi.fn>) => ({ get }) as unknown as REST;

  it("waits while Discord indexes the guild, within 2 to 30 s", async () => {
    sleep.mockClear();
    const get = vi
      .fn()
      .mockResolvedValueOnce(notReady(0.5))
      .mockResolvedValueOnce(notReady(120))
      .mockResolvedValueOnce(page);
    const result = await searchGuildMessagesPage(
      rest(get),
      "g",
      new URLSearchParams()
    );
    expect(result?.messages).toEqual([{ id: "1", channel_id: "c" }]);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2_000, 30_000]);
  });

  it("gives up after ten waits", async () => {
    sleep.mockClear();
    const get = vi.fn().mockResolvedValue(notReady(1));
    await expect(
      searchGuildMessagesPage(rest(get), "g", new URLSearchParams())
    ).rejects.toBeInstanceOf(SearchNotReadyError);
    expect(get).toHaveBeenCalledTimes(11);
    expect(sleep).toHaveBeenCalledTimes(10);
  });

  it("stops before a wait that would end past the deadline", async () => {
    sleep.mockClear();
    const get = vi.fn().mockResolvedValue(notReady(10));
    expect(
      await searchGuildMessagesPage(
        rest(get),
        "g",
        new URLSearchParams(),
        Date.now() + 5_000
      )
    ).toBeNull();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("takes a body without results for one not ready yet", async () => {
    // Another 202 code than 110000: no page to read, so no firm answer.
    const get = vi.fn().mockResolvedValue({ code: 110001, retry_after: 60 });
    expect(
      await searchGuildMessagesPage(
        { get } as unknown as REST,
        "g",
        new URLSearchParams(),
        Date.now() + 1000
      )
    ).toBeNull();
  });

  it("refuses a body that is not a page rather than reading no result", async () => {
    for (const body of [{}, { total_results: 0 }, new ArrayBuffer(0)]) {
      const get = vi.fn().mockResolvedValue(body);
      await expect(
        searchGuildMessagesPage(rest(get), "g", new URLSearchParams())
      ).rejects.toThrow("not a page of results");
    }
  });

  it("tells a page read while Discord indexes old history", async () => {
    const get = vi.fn().mockResolvedValue({
      ...page,
      doing_deep_historical_index: true,
    });
    const result = await searchGuildMessagesPage(
      { get } as unknown as REST,
      "g",
      new URLSearchParams()
    );
    expect(result).toEqual({
      messages: [{ id: "1", channel_id: "c" }],
      deepIndexing: true,
    });
  });
});

describe("isSearchDenied", () => {
  const apiError = (code: number) =>
    new DiscordAPIError({ code, message: "" }, code, 403, "GET", "/", {});

  it("tells a refusal, which no retry fixes, from another failure", () => {
    expect(isSearchDenied(apiError(RESTJSONErrorCodes.MissingAccess))).toBe(
      true
    );
    expect(
      isSearchDenied(apiError(RESTJSONErrorCodes.MissingPermissions))
    ).toBe(true);
    expect(isSearchDenied(apiError(RESTJSONErrorCodes.UnknownGuild))).toBe(
      false
    );
    expect(isSearchDenied(new Error("network"))).toBe(false);
  });
});
