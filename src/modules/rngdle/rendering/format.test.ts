import { describe, expect, it } from "vitest";
import {
  formatCompact,
  formatExpected,
  formatIndex,
  formatShort,
  formatSpaced,
} from "./format.js";

describe("formatSpaced", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1 000"],
    [1_234_567, "1 234 567"],
    [-1_234_567, "-1 234 567"],
    [1234.9, "1 234"],
  ])("formats %s as %s", (value, text) => {
    expect(formatSpaced(value)).toBe(text);
  });
});

describe("formatCompact", () => {
  it.each([
    [999, "999"],
    [1000, "1.0k"],
    [999_999, "1000.0k"],
    [2_000_000, "2.0M"],
    [1_234_567_890, "1.2B"],
  ])("formats %s as %s", (value, text) => {
    expect(formatCompact(value)).toBe(text);
  });
});

describe("formatIndex", () => {
  it.each([
    [5802 / 21, "276"],
    [1.75, "2"],
    [999.6, "1.0k"],
    [12_345.4, "12.3k"],
  ])("formats %s as %s", (value, text) => {
    expect(formatIndex(value)).toBe(text);
  });
});

describe("formatShort", () => {
  it.each([
    [999, "en", "999"],
    [1000, "en", "1k"],
    [1500, "en", "1.5k"],
    [2_500_000, "fr", "2.5M"],
    [1_234_567_890, "en", "1.2B"],
    [1_234_567_890, "fr", "1.2Md"],
    [3_000_000_000, "fr", "3Md"],
  ])("formats %s in %s as %s", (value, locale, text) => {
    expect(formatShort(value, locale)).toBe(text);
  });
});

describe("formatExpected", () => {
  it.each([
    ["fr", 1.25, "1,3"],
    ["en", 1.25, "1.3"],
    ["fr", 0, "0,0"],
    ["en", 9.94, "9.9"],
    ["fr", 9.96, "10"],
    ["en", 61.25, "61"],
    ["fr", 61_728, "61 728"],
    ["fr", 3_086_400, "3.1M"],
  ])("formats %s %s as %s", (locale, value, text) => {
    expect(formatExpected(locale, value)).toBe(text);
  });
});
