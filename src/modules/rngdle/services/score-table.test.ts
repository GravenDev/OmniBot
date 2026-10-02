import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compressScoreTable,
  extractScoreTable,
  formatPercent,
  isPlausibleTable,
  ScoreTable,
  type CompressedTable,
} from "./score-table.js";

function bigTable(size: number) {
  const entries: string[] = [];
  for (let i = 0; i < size; i++) {
    const key = 100_000 + i;
    const rendered =
      i === 0 ? "1e5" : i === 1 ? `0x${key.toString(16)}` : String(key);
    const value = i === 2 ? ".0083" : "0.5";
    entries.push(`${rendered}:${value}`);
  }
  return `{${entries.join(",")}}`;
}

describe("extractScoreTable", () => {
  it("finds the table inside a larger blob and parses exotic notations", () => {
    const source = `var a=function(){return 1};const t=${bigTable(1200)};export{t};`;

    const table = extractScoreTable(source);

    expect(table).not.toBeNull();
    expect(table!.size).toBe(1200);
    expect(table!.get(100_000)).toBe(0.5);
    expect(table!.get(100_001)).toBe(0.5);
    expect(table!.get(100_002)).toBe(0.0083);
  });

  it("ignores small dict-like objects", () => {
    expect(
      extractScoreTable("var a={1:2,3:4,5:6};var b={0x10:1.5}")
    ).toBeNull();
  });

  it("returns null when there is no table", () => {
    expect(extractScoreTable("console.log('hello')")).toBeNull();
    expect(extractScoreTable("")).toBeNull();
  });

  it("ignores a table that is never closed", () => {
    const unclosed = bigTable(1200).slice(0, -1);

    expect(extractScoreTable(`var a=${unclosed}`)).toBeNull();
  });

  it("keeps the biggest valid table", () => {
    const source = `var a=${bigTable(1100)};var b=${bigTable(1500)};var c=${bigTable(1050)};var d={1:2}`;

    expect(extractScoreTable(source)!.size).toBe(1500);
  });
});

describe("compressScoreTable", () => {
  it("truncates to 0.5% steps and keeps the lowest score per step", () => {
    const table = new Map<number, number>([
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

  it("returns an empty object for an empty table", () => {
    expect(compressScoreTable(new Map())).toEqual({});
  });
});

describe("ScoreTable", () => {
  const table = new ScoreTable({ "100": 10, "200": 50, "300": 90 });

  it("throws on an empty table", () => {
    expect(() => new ScoreTable({})).toThrow("empty");
  });

  describe("percentOf", () => {
    it("returns the percent of an exact key", () => {
      expect(table.percentOf(200)).toBe(50);
    });

    it("returns the percent of the closest lower key between keys", () => {
      expect(table.percentOf(250)).toBe(50);
      expect(table.percentOf(101)).toBe(10);
    });

    it("returns the lowest percent below the lowest key", () => {
      expect(table.percentOf(5)).toBe(10);
      expect(table.percentOf(-50)).toBe(10);
    });

    it("returns the highest percent above the highest key", () => {
      expect(table.percentOf(10_000)).toBe(90);
    });

    it("sorts keys numerically", () => {
      const unsorted = new ScoreTable({ "1000": 80, "9": 5, "100": 40 });

      expect(unsorted.percentOf(500)).toBe(40);
      expect(unsorted.percentOf(1000)).toBe(80);
    });
  });

  describe("tierOf", () => {
    const tierAt = (percent: number) =>
      new ScoreTable({ "0": percent }).tierOf(0);

    it.each([
      [0, "TRASH"],
      [0.99, "TRASH"],
      [1, "COMMON"],
      [49.5, "COMMON"],
      [50, "UNCOMMON"],
      [74.5, "UNCOMMON"],
      [75, "RARE"],
      [89.5, "RARE"],
      [90, "EPIC"],
      [94.5, "EPIC"],
      [95, "ANOMALY"],
      [98.5, "ANOMALY"],
      [99, "MYTHIC"],
      [99.5, "MYTHIC"],
      [100, "ERROR"],
      [-1, "ERROR"],
    ])("maps %s%% to %s", (percent, tier) => {
      expect(tierAt(percent)).toBe(tier);
    });

    it("returns ERROR for a negative score", () => {
      expect(table.tierOf(-1)).toBe("ERROR");
    });

    it("returns ERROR for a negative score even when the percent is valid", () => {
      expect(new ScoreTable({ "-5": 50 }).tierOf(-1)).toBe("ERROR");
    });
  });

  describe("equals", () => {
    it("is true for the same content", () => {
      expect(table.equals({ "300": 90, "100": 10, "200": 50 })).toBe(true);
    });

    it("is false for a different value", () => {
      expect(table.equals({ "100": 10, "200": 51, "300": 90 })).toBe(false);
    });

    it("is false for a different size", () => {
      expect(table.equals({ "100": 10, "200": 50 })).toBe(false);
      expect(table.equals({ "100": 10, "200": 50, "300": 90, "400": 95 })).toBe(
        false
      );
    });

    it("is false for different keys with the same size", () => {
      expect(table.equals({ "100": 10, "200": 50, "301": 90 })).toBe(false);
    });
  });
});

describe("formatPercent", () => {
  it.each([
    [99.5, "0%"],
    [99, "1%"],
    [90.5, "9%"],
    [50.5, "49%"],
    [50, "50%"],
    [49.5, "50%"],
    [0.5, "1%"],
    [0, "0%"],
  ])("formats %s as %s", (percent, text) => {
    expect(formatPercent(percent)).toBe(text);
  });
});

describe("real score table snapshot", () => {
  const snapshot = JSON.parse(
    readFileSync(new URL("../assets/score-table.json", import.meta.url), "utf8")
  ) as CompressedTable;
  const table = new ScoreTable(snapshot);

  it("maps a very high score to MYTHIC", () => {
    expect(table.tierOf(131_081_274)).toBe("MYTHIC");
  });

  it("maps a zero score to TRASH", () => {
    expect(table.tierOf(0)).toBe("TRASH");
  });

  it("never lowers the percent as the score grows", () => {
    let previous = -1;
    for (const score of [0, 2_000, 10_000, 50_000, 162_292, 1_000_000]) {
      const percent = table.percentOf(score);
      expect(percent).toBeGreaterThanOrEqual(previous);
      previous = percent;
    }
  });

  it("round-trips through equals", () => {
    expect(table.equals(snapshot)).toBe(true);
  });
});

describe("isPlausibleTable", () => {
  const build = (size: number, percent = (i: number) => i * 2) =>
    Object.fromEntries(
      Array.from({ length: size }, (_, i) => [String(i * 100), percent(i)])
    ) as CompressedTable;

  it("accepts a monotonic table of 20 entries", () => {
    expect(isPlausibleTable(build(20))).toBe(true);
  });

  it("accepts equal consecutive percents", () => {
    expect(isPlausibleTable(build(30, () => 50))).toBe(true);
  });

  it("accepts the bounds 0 and 100", () => {
    expect(isPlausibleTable(build(21, (i) => (i * 100) / 20))).toBe(true);
  });

  it("rejects fewer than 20 entries", () => {
    expect(isPlausibleTable(build(19))).toBe(false);
    expect(isPlausibleTable({})).toBe(false);
  });

  it("rejects a percent above 100", () => {
    expect(isPlausibleTable(build(25, (i) => (i === 24 ? 100.5 : i)))).toBe(
      false
    );
  });

  it("rejects a negative percent", () => {
    expect(isPlausibleTable(build(25, (i) => (i === 0 ? -1 : i)))).toBe(false);
  });

  it("rejects percents decreasing as the score increases", () => {
    expect(isPlausibleTable(build(25, (i) => (i === 10 ? 1 : i * 2)))).toBe(
      false
    );
  });

  it("accepts the real snapshot", () => {
    const snapshot = JSON.parse(
      readFileSync(
        new URL("../assets/score-table.json", import.meta.url),
        "utf8"
      )
    ) as CompressedTable;

    expect(isPlausibleTable(snapshot)).toBe(true);
  });
});
