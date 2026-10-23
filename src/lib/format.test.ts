import { describe, expect, it } from "vitest";
import { formatInteger } from "./format.js";

describe("formatInteger", () => {
  it.each([
    [0, "fr", "0"],
    [999, "fr", "999"],
    [1000, "fr", "1 000"],
    [1_234_567, "fr", "1 234 567"],
    [-1_234_567, "fr", "-1 234 567"],
    [1234.9, "fr", "1 234"],
    [1_234_567, "en", "1,234,567"],
    [-1234.9, "en", "-1,234"],
  ])("formats %s in %s as %s", (value, locale, text) => {
    expect(formatInteger(value, locale)).toBe(text);
  });
});
