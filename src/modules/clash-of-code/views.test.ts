import { describe, expect, it } from "vitest";
import { modeLabel, PAGE_SIZE, standingsPage } from "./views.js";

describe("modeLabel", () => {
  const t = (key: string) => key;

  it("names the mode, or says it is unknown", () => {
    expect(modeLabel(t as never, "REVERSE")).toBe("mode.REVERSE");
    expect(modeLabel(t as never, null)).toBe("mode.unknown");
  });
});

describe("standingsPage", () => {
  const standings = Array.from({ length: 25 }, (_, index) => ({
    codingamerId: index + 1,
    rank: index + 1,
    wins: 25 - index,
    games: 30,
  }));
  const ids = (rows: { codingamerId: number }[]) =>
    rows.map(({ codingamerId }) => codingamerId);

  it("is null when nobody played", () => {
    expect(standingsPage([], 1, null)).toBeNull();
  });

  it("keeps the page asked for within the pages there are", () => {
    expect(standingsPage(standings, 0, null)).toMatchObject({
      page: 1,
      pageCount: 3,
    });
    const last = standingsPage(standings, 9, null);
    expect(last?.page).toBe(3);
    expect(ids(last!.shown)).toEqual([21, 22, 23, 24, 25]);
    expect(standingsPage(standings, 2.7, null)?.page).toBe(2);
  });

  it("adds the caller's standing only when it is on another page", () => {
    expect(standingsPage(standings, 1, 3)?.callerStanding).toBeUndefined();
    expect(standingsPage(standings, 1, 22)?.callerStanding?.codingamerId).toBe(
      22
    );
    expect(standingsPage(standings, 1, 99)?.callerStanding).toBeUndefined();
    expect(standingsPage(standings, 1, null)?.shown).toHaveLength(PAGE_SIZE);
  });
});
