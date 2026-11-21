import { describe, expect, it } from "vitest";
import type { StoredRoll } from "./services/store.service.js";
import { computeHighlights } from "./share-cards.js";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

function roll(
  userId: string,
  score: number,
  rolledAt = new Date("2026-10-22T11:00:00Z")
): StoredRoll {
  return { userId, number: score, score, badgeCount: 3, rolledAt };
}

describe("computeHighlights", () => {
  const today = roll("me", 5000);

  it("celebrates a personal best above every previous roll", () => {
    const highlights = computeHighlights(
      t,
      today,
      [roll("me", 4000)],
      [],
      "fr"
    );
    expect(highlights.map((h) => h.text)).toEqual(["card.personalBest"]);
  });

  it("does not call the first roll a personal best", () => {
    expect(computeHighlights(t, today, [], [], "fr")).toEqual([]);
  });

  it("ranks the roll among the other players of the day", () => {
    const highlights = computeHighlights(
      t,
      today,
      [],
      [today, roll("a", 9000), roll("b", 100)],
      "fr"
    );
    expect(highlights).toEqual([
      expect.objectContaining({
        icon: "🥈",
        text: 'card.rank {"rank":2,"count":3}',
      }),
    ]);
  });

  it("compares with the average once there are enough rolls", () => {
    const previous = [1000, 2000, 3000, 4000, 5000].map((score) =>
      roll("me", score)
    );
    const below = computeHighlights(t, roll("me", 2000), previous, [], "fr");
    expect(below.at(-1)?.text).toBe('card.vsAverage {"delta":"−1 000"}');
    expect(
      computeHighlights(t, today, previous.slice(1), [], "fr").map(
        (h) => h.text
      )
    ).not.toContain(expect.stringContaining("vsAverage"));
  });
});
