import { describe, expect, it } from "vitest";
import { RenameLimiter } from "./renames.service.js";

describe("RenameLimiter", () => {
  it("allows two renames per 10 minutes", () => {
    const limiter = new RenameLimiter();
    limiter.record("c", 0);
    expect(limiter.retryAt("c", 1)).toBeNull();
    limiter.record("c", 1_000);
    expect(limiter.retryAt("c", 2_000)).toBe(600_000);
    expect(limiter.retryAt("c", 600_001)).toBeNull();
  });

  it("forgets a channel", () => {
    const limiter = new RenameLimiter();
    limiter.record("c", 0);
    limiter.record("c", 0);
    limiter.forget("c");
    expect(limiter.retryAt("c", 1)).toBeNull();
  });
});
