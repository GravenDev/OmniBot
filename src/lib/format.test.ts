import { describe, expect, it } from "vitest";
import { decimalSeparator, formatInteger, formatPercentage } from "./format.js";

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

describe("formatPercentage", () => {
  it.each([
    [4, "fr", 0, "4 %"],
    [4, "en", 0, "4%"],
    [4.5, "fr", 2, "4,5 %"],
    [4.5, "en", 2, "4.5%"],
  ])("formats %s in %s (%s decimals) as %s", (value, locale, digits, text) => {
    expect(formatPercentage(value, locale, digits)).toBe(text);
  });
});

describe("decimalSeparator", () => {
  it("is a comma in French and a point in English", () => {
    expect(decimalSeparator("fr")).toBe(",");
    expect(decimalSeparator("en")).toBe(".");
  });
});
