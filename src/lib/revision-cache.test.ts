import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevisionCache } from "./revision-cache.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RevisionCache", () => {
  it("loads once for repeated and concurrent reads of the same revision", async () => {
    const cache = new RevisionCache(1_000);
    const load = vi.fn(async () => "value");

    await Promise.all([cache.get("k", 0, load), cache.get("k", 0, load)]);
    await cache.get("k", 0, load);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads again when the revision changes or the entry expires", async () => {
    const cache = new RevisionCache(1_000);
    const load = vi.fn(async () => "value");

    await cache.get("k", 0, load);
    await cache.get("k", 1, load);
    vi.advanceTimersByTime(1_001);
    await cache.get("k", 1, load);

    expect(load).toHaveBeenCalledTimes(3);
  });

  it("keeps keys apart and forgets failed loads", async () => {
    const cache = new RevisionCache(1_000);
    const load = vi.fn(async () => "value");

    await cache.get("a", 0, load);
    await cache.get("b", 0, load);
    await expect(
      cache.get("c", 0, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await cache.get("c", 0, load);

    expect(load).toHaveBeenCalledTimes(3);
  });
});
