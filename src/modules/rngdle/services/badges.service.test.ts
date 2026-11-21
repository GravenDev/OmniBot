import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/logger.js", () => {
  const logger = { warn: vi.fn() };
  return { loggerMaker: () => logger };
});

import rollBadges from "./badges.service.js";

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

describe("fetchRollBadges", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the calculator once per number", async () => {
    const fetch = vi.fn(async () => Response.json(body(4242)));
    vi.stubGlobal("fetch", fetch);

    await rollBadges.fetchRollBadges(4242);
    const badges = await rollBadges.fetchRollBadges(4242);

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
      rollBadges.fetchRollBadges(5151),
      rollBadges.fetchRollBadges(5151),
    ]);

    expect(first).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up without caching when the calculator fails", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetch);

    expect(await rollBadges.fetchRollBadges(777)).toBeNull();
    expect(await rollBadges.fetchRollBadges(777)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
