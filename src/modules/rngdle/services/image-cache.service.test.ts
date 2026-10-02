import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revisions = vi.hoisted(() => new Map<string, number>());
vi.mock("./rngdle.service.js", () => ({
  default: { getRevision: (guildId: string) => revisions.get(guildId) ?? 0 },
}));

const { default: cache } = await import("./image-cache.service.js");

let guild = 0;
let guildId = "";

beforeEach(() => {
  guildId = `guild-${++guild}`;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ImageCacheService", () => {
  it("renders once for repeated and concurrent requests", async () => {
    const render = vi.fn(async () => Buffer.from("png"));

    await Promise.all([
      cache.get(guildId, "daily", render),
      cache.get(guildId, "daily", render),
    ]);
    await cache.get(guildId, "daily", render);

    expect(render).toHaveBeenCalledTimes(1);
  });

  it("renders again once the guild data has changed", async () => {
    const render = vi.fn(async () => Buffer.from("png"));

    await cache.get(guildId, "daily", render);
    revisions.set(guildId, 1);
    await cache.get(guildId, "daily", render);

    expect(render).toHaveBeenCalledTimes(2);
  });

  it("renders again after the cache lifetime", async () => {
    const render = vi.fn(async () => Buffer.from("png"));

    await cache.get(guildId, "daily", render);
    vi.advanceTimersByTime(14_000);
    await cache.get(guildId, "daily", render);
    expect(render).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000);
    await cache.get(guildId, "daily", render);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("keeps one image per key and per guild", async () => {
    const render = vi.fn(async () => Buffer.from("png"));

    await cache.get(guildId, "a", render);
    await cache.get(guildId, "b", render);
    await cache.get(`${guildId}-other`, "a", render);

    expect(render).toHaveBeenCalledTimes(3);
  });

  it("does not keep a failed render", async () => {
    const failing = vi.fn(async () => {
      throw new Error("render failed");
    });
    const render = vi.fn(async () => Buffer.from("png"));

    await expect(cache.get(guildId, "daily", failing)).rejects.toThrow();
    await expect(cache.get(guildId, "daily", render)).resolves.toBeInstanceOf(
      Buffer
    );
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("returns the rendered value", async () => {
    const buffer = Buffer.from("png");

    await expect(cache.get(guildId, "daily", async () => buffer)).resolves.toBe(
      buffer
    );
  });
});
