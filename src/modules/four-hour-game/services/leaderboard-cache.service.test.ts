import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revisions = vi.hoisted(() => new Map<string, number>());
vi.mock("./four-hour-game.service.js", () => ({
  default: { getRevision: (guildId: string) => revisions.get(guildId) ?? 0 },
}));

const { default: cache } = await import("./leaderboard-cache.service.js");

let guild = 0;
let guildId = "";

beforeEach(() => {
  guildId = `guild-${++guild}`;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LeaderboardCacheService", () => {
  it("renders once for repeated and concurrent requests", async () => {
    const render = vi.fn(async () => Buffer.from("png"));

    await Promise.all([
      cache.get(guildId, "fr", render),
      cache.get(guildId, "fr", render),
    ]);
    await cache.get(guildId, "fr", render);

    expect(render).toHaveBeenCalledTimes(1);
  });

  it("renders again once a score has changed", async () => {
    const render = vi.fn(async () => Buffer.from("png"));

    await cache.get(guildId, "fr", render);
    revisions.set(guildId, 1);
    await cache.get(guildId, "fr", render);

    expect(render).toHaveBeenCalledTimes(2);
  });

  it("renders again after the cache lifetime", async () => {
    const render = vi.fn(async () => Buffer.from("png"));

    await cache.get(guildId, "fr", render);
    vi.advanceTimersByTime(16_000);
    await cache.get(guildId, "fr", render);

    expect(render).toHaveBeenCalledTimes(2);
  });

  it("keeps one image per locale", async () => {
    const render = vi.fn(async () => Buffer.from("png"));

    await cache.get(guildId, "fr", render);
    await cache.get(guildId, "en", render);

    expect(render).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed render", async () => {
    const failing = vi.fn(async () => {
      throw new Error("render failed");
    });
    const render = vi.fn(async () => Buffer.from("png"));

    await expect(cache.get(guildId, "fr", failing)).rejects.toThrow();
    await expect(cache.get(guildId, "fr", render)).resolves.toBeInstanceOf(
      Buffer
    );
  });
});
