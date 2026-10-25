import { describe, expect, it } from "vitest";
import { truncate } from "./text.js";

describe("truncate", () => {
  it("keeps a short text", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  it("never splits an emoji", () => {
    expect(truncate("ab😀c", 4)).toBe("ab…");
    expect(truncate("😀😀😀😀", 5)).toBe("😀😀…");
  });

  it("stays within the limit counted the way Discord counts it", () => {
    const truncated = truncate("😀".repeat(600), 1024);
    expect(truncated.length).toBeLessThanOrEqual(1024);
    expect(truncated.endsWith("😀…")).toBe(true);
  });
});
