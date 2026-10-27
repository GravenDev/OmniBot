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

  it("closes a spoiler the cut would leave open", () => {
    const truncated = truncate(`intro ||${"secret ".repeat(20)}||`, 30);
    expect(truncated).toBe(`intro ||${"secret ".repeat(2)}secre||…`);
    expect(truncated.length).toBeLessThanOrEqual(30);
    expect(truncate(`||a|| ${"b".repeat(40)}`, 20)).toBe(
      `||a|| ${"b".repeat(13)}…`
    );
  });

  it("keeps the text around a lone || such as code", () => {
    expect(truncate(`a || b ${"c".repeat(40)}`, 20)).toBe(
      `a || b ${"c".repeat(10)}||…`
    );
  });
});
