import { afterEach, describe, expect, it, vi } from "vitest";
import { withDeadline } from "./deadline.js";

describe("withDeadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves to the value of a promise that settles in time", async () => {
    await expect(withDeadline(Promise.resolve(42), 1_000)).resolves.toBe(42);
  });

  it("resolves to null when the promise rejects", async () => {
    await expect(
      withDeadline(Promise.reject(new Error("boom")), 1_000)
    ).resolves.toBeNull();
  });

  it("resolves to null when the promise takes longer than the wait", async () => {
    vi.useFakeTimers();
    const result = withDeadline(new Promise(() => {}), 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBeNull();
  });
});
