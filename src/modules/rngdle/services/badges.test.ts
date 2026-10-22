import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/logger.js", () => {
  const logger = { warn: vi.fn() };
  return { loggerMaker: () => logger };
});

import { fetchRollBadges, parseRollBadges } from "./badges.js";

const BADGE = {
  id: "CONTIGUOUS_BOAT",
  label: "Contiguous Full House",
  emoji: "🏰",
  ep: 30111,
  rarity: "Rare",
  prob: 0.3321,
};

function body(number: number) {
  return { number, totalEP: 41731, count: 1, badges: [BADGE] };
}

describe("parseRollBadges", () => {
  it("reads the badges of a number", () => {
    expect(parseRollBadges(111883, body(111883))).toEqual({
      number: 111883,
      score: 41731,
      badges: [
        {
          id: "CONTIGUOUS_BOAT",
          label: "Contiguous Full House",
          emoji: "🏰",
          ep: 30111,
          rarity: "Rare",
          probability: 0.3321,
        },
      ],
    });
  });

  it("refuses the answer for another number", () => {
    expect(parseRollBadges(111884, body(111883))).toBeNull();
  });

  it("refuses a malformed badge", () => {
    expect(
      parseRollBadges(111883, { ...body(111883), badges: [{ id: "X" }] })
    ).toBeNull();
  });
});

describe("fetchRollBadges", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the calculator once per number", async () => {
    const fetch = vi.fn(async () => Response.json(body(4242)));
    vi.stubGlobal("fetch", fetch);

    await fetchRollBadges(4242);
    const badges = await fetchRollBadges(4242);

    expect(badges?.badges).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe(
      "https://rng.cubityfir.st/api?n=4242"
    );
  });

  it("shares one request between simultaneous lookups", async () => {
    const fetch = vi.fn(async () => Response.json(body(5151)));
    vi.stubGlobal("fetch", fetch);

    const [first, second] = await Promise.all([
      fetchRollBadges(5151),
      fetchRollBadges(5151),
    ]);

    expect(first).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up without caching when the calculator fails", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetch);

    expect(await fetchRollBadges(777)).toBeNull();
    expect(await fetchRollBadges(777)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
