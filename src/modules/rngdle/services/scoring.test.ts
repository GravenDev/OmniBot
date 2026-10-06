import { describe, expect, it } from "vitest";
import {
  compressScoreTable,
  extractScoreTable,
  formatPercent,
  isPlausibleTable,
  ScoreTable,
  type CompressedTable,
} from "./scoring.js";

function bigTable(size: number) {
  const entries = Array.from({ length: size }, (_, i) => {
    const key = 100_000 + i;
    const rendered =
      i === 0 ? "1e5" : i === 1 ? `0x${key.toString(16)}` : String(key);
    return `${rendered}:${i === 2 ? ".0083" : "0.5"}`;
  });
  return `{${entries.join(",")}}`;
}

describe("extractScoreTable", () => {
  it("finds the table in a larger blob, parses exotic notations and keeps the biggest", () => {
    const source = `var a=${bigTable(1100)};var b=${bigTable(1500)};var d={1:2}`;

    const table = extractScoreTable(source)!;

    expect(table.size).toBe(1500);
    expect(table.get(100_000)).toBe(0.5);
    expect(table.get(100_001)).toBe(0.5);
    expect(table.get(100_002)).toBe(0.0083);
  });

  it("ignores small objects, unclosed tables and sources without a table", () => {
    expect(extractScoreTable("var a={1:2,3:4};var b={0x10:1.5}")).toBeNull();
    expect(
      extractScoreTable(`var a=${bigTable(1200).slice(0, -1)}`)
    ).toBeNull();
    expect(extractScoreTable("console.log('hello')")).toBeNull();
  });
});

describe("compressScoreTable", () => {
  it("truncates to 0.5% steps and keeps the lowest score per step", () => {
    const table = new Map([
      [100, 0.1],
      [200, 0.4],
      [50, 0.7],
      [300, 0.6],
      [400, 1.2],
      [500, 99.99],
    ]);

    expect(compressScoreTable(table)).toEqual({
      "100": 0,
      "50": 0.5,
      "400": 1,
      "500": 99.5,
    });
  });
});

describe("ScoreTable", () => {
  const table = new ScoreTable({ "100": 10, "200": 50, "300": 90 });

  it("throws on an empty table", () => {
    expect(() => new ScoreTable({})).toThrow("empty");
  });

  it("percentOf uses the closest lower key, clamping at both ends, with numeric key order", () => {
    expect(table.percentOf(200)).toBe(50);
    expect(table.percentOf(250)).toBe(50);
    expect(table.percentOf(-50)).toBe(10);
    expect(table.percentOf(10_000)).toBe(90);
    expect(
      new ScoreTable({ "1000": 80, "9": 5, "100": 40 }).percentOf(500)
    ).toBe(40);
  });

  it.each([
    [0.99, "TRASH"],
    [1, "COMMON"],
    [50, "UNCOMMON"],
    [75, "RARE"],
    [90, "EPIC"],
    [95, "ANOMALY"],
    [99, "MYTHIC"],
    [100, "ERROR"],
    [-1, "ERROR"],
  ])("tierOf maps %s%% to %s", (percent, tier) => {
    expect(new ScoreTable({ "0": percent }).tierOf(0)).toBe(tier);
  });

  it("tierOf returns ERROR for a negative score even when the percent is valid", () => {
    expect(new ScoreTable({ "-5": 50 }).tierOf(-1)).toBe("ERROR");
  });

  it("equals compares keys and values", () => {
    expect(table.equals({ "300": 90, "100": 10, "200": 50 })).toBe(true);
    expect(table.equals({ "100": 10, "200": 51, "300": 90 })).toBe(false);
    expect(table.equals({ "100": 10, "200": 50 })).toBe(false);
    expect(table.equals({ "100": 10, "200": 50, "301": 90 })).toBe(false);
  });
});

describe("formatPercent", () => {
  it.each([
    [90.5, "9%"],
    [50.5, "49%"],
    [50, "50%"],
    [49.5, "50%"],
    [0.5, "1%"],
  ])("formats %s as %s", (percent, text) => {
    expect(formatPercent(percent)).toBe(text);
  });
});

describe("isPlausibleTable", () => {
  const build = (size: number, percent = (i: number) => i * 2) =>
    Object.fromEntries(
      Array.from({ length: size }, (_, i) => [String(i * 100), percent(i)])
    ) as CompressedTable;

  it("accepts monotonic tables of 20+ entries, equal percents and the 0 and 100 bounds", () => {
    expect(isPlausibleTable(build(20))).toBe(true);
    expect(isPlausibleTable(build(30, () => 50))).toBe(true);
    expect(isPlausibleTable(build(21, (i) => (i * 100) / 20))).toBe(true);
  });

  it("rejects short, out-of-range and decreasing tables", () => {
    expect(isPlausibleTable(build(19))).toBe(false);
    expect(isPlausibleTable(build(25, (i) => (i === 24 ? 100.5 : i)))).toBe(
      false
    );
    expect(isPlausibleTable(build(25, (i) => (i === 0 ? -1 : i)))).toBe(false);
    expect(isPlausibleTable(build(25, (i) => (i === 10 ? 1 : i * 2)))).toBe(
      false
    );
  });
});
