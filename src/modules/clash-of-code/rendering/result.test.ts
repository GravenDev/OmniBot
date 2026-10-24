import { loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { renderResult, resultColumns, type ResultRow } from "./result.js";

const labels = {
  locale: "en",
  title: "Clash of Code",
  subtitle: "Shortest · 2 players",
  rank: "Rank",
  player: "Player",
  score: "Score",
  time: "Time",
  characters: "Chars",
};

const rows: ResultRow[] = [
  {
    rank: 1,
    name: "lody_gives_teacup",
    avatar: null,
    score: 100,
    durationMs: 146_704,
    criterion: 87,
  },
  {
    rank: 2,
    name: "Idefa",
    avatar: null,
    score: 50,
    durationMs: 254_295,
    criterion: null,
  },
];

describe("resultColumns", () => {
  it("adds a characters column in shortest mode only", () => {
    expect(resultColumns("SHORTEST", labels).map((c) => c.header)).toEqual([
      "Score",
      "Chars",
      "Time",
    ]);
    expect(resultColumns("FASTEST", labels).map((c) => c.header)).toEqual([
      "Score",
      "Time",
    ]);
    expect(resultColumns(null, labels).map((c) => c.header)).toEqual([
      "Score",
      "Time",
    ]);
  });

  it("formats the cells", () => {
    const [score, characters, time] = resultColumns("SHORTEST", labels);
    expect(score!.text(rows[0]!)).toBe("100%");
    expect(characters!.text(rows[0]!)).toBe("87");
    expect(characters!.text(rows[1]!)).toBe("—");
    expect(time!.text(rows[0]!)).toBe("2m 27s");
  });

  it("writes the numbers as the server's language does", () => {
    const [score, characters] = resultColumns("SHORTEST", {
      ...labels,
      locale: "fr",
    });
    const row = { ...rows[0]!, criterion: 1234 };
    expect(score!.text(row)).toBe("100 %");
    expect(characters!.text(row)).toBe("1 234");
  });
});

describe("renderResult", () => {
  it("draws a card that grows with the players", async () => {
    const two = await loadImage(
      await renderResult("SHORTEST", null, rows, labels)
    );
    const one = await loadImage(
      await renderResult("SHORTEST", null, rows.slice(0, 1), labels)
    );
    expect(two.width).toBe(800);
    expect(two.height).toBeGreaterThan(one.height);
  });

  it("keeps the same width without the characters column", async () => {
    const image = await loadImage(
      await renderResult("FASTEST", null, rows, labels)
    );
    expect(image.width).toBe(800);
  });
});
