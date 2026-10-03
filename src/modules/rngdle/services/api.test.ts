import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sleep = vi.hoisted(() => vi.fn(async (_ms: number) => undefined));
vi.mock("node:timers/promises", () => ({ setTimeout: sleep }));

import {
  fetchScoreTable,
  fetchUserRolls,
  RngdleApiError,
  RngdleUserNotFoundError,
} from "./api.js";

const fetchMock = vi.fn();

function reply(body: unknown, init: ResponseInit = {}) {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    init
  );
}

function apiRoll(index: number, extra: Record<string, unknown> = {}) {
  return {
    id: `r${index}`,
    number: index,
    totalScore: index * 10,
    rolledAt: new Date(Date.UTC(2026, 0, 30 - index)).toISOString(),
    ...extra,
  };
}

function page(rolls: unknown[], hasMore = true) {
  return reply({ rolls, hasMore });
}

function requestedQueries() {
  return fetchMock.mock.calls.map(([url]) => new URL(url as string).search);
}

beforeEach(() => {
  fetchMock.mockReset();
  sleep.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchUserRolls", () => {
  it("paginates 10 then 100 rolls with the running offset and stops on hasMore=false", async () => {
    fetchMock
      .mockResolvedValueOnce(page([apiRoll(1), apiRoll(2)]))
      .mockResolvedValueOnce(page([apiRoll(3)]))
      .mockResolvedValueOnce(page([apiRoll(4)], false));

    const rolls = await fetchUserRolls("Some User", null);

    expect(rolls.map((roll) => roll.id)).toEqual(["r1", "r2", "r3", "r4"]);
    expect(requestedQueries()).toEqual([
      "?limit=10&offset=0",
      "?limit=100&offset=2",
      "?limit=100&offset=3",
    ]);
    expect(fetchMock.mock.calls[0]![0]).toContain("/users/Some%20User/rolls");
    expect(fetchMock.mock.calls[0]![1].headers["User-Agent"]).toContain(
      "OmniBot"
    );
  });

  it("stops on an empty page", async () => {
    fetchMock.mockResolvedValueOnce(page([]));

    expect(await fetchUserRolls("u", null)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops once the oldest roll of a page is not newer than since", async () => {
    fetchMock.mockResolvedValue(page([apiRoll(1), apiRoll(2)]));

    const rolls = await fetchUserRolls("u", new Date(Date.UTC(2026, 0, 28)));

    expect(rolls).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps paginating while rolls are newer than since", async () => {
    fetchMock
      .mockResolvedValueOnce(page([apiRoll(1)]))
      .mockResolvedValueOnce(page([apiRoll(2)], false));

    await fetchUserRolls("u", new Date(Date.UTC(2026, 0, 1)));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps the fields and defaults badgeCount to 0", async () => {
    fetchMock.mockResolvedValueOnce(
      page(
        [apiRoll(1, { badgeCount: 3 }), apiRoll(2, { badgeCount: "x" })],
        false
      )
    );

    const rolls = await fetchUserRolls("u", null);

    expect(rolls[0]).toEqual({
      id: "r1",
      number: 1,
      score: 10,
      badgeCount: 3,
      rolledAt: new Date(Date.UTC(2026, 0, 29)),
    });
    expect(rolls[1]!.badgeCount).toBe(0);
  });

  it("throws RngdleUserNotFoundError on 404", async () => {
    fetchMock.mockResolvedValueOnce(reply("", { status: 404 }));

    await expect(fetchUserRolls("ghost", null)).rejects.toThrow(
      RngdleUserNotFoundError
    );
  });

  it("throws RngdleApiError on other client errors without retrying", async () => {
    fetchMock.mockResolvedValue(reply("", { status: 403 }));

    await expect(fetchUserRolls("u", null)).rejects.toThrow(RngdleApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[]],
    [{ rolls: 1 }],
    [{ rolls: [null] }],
    [{ rolls: [apiRoll(1, { id: 5 })] }],
    [{ rolls: [apiRoll(1, { totalScore: 1.5 })] }],
    [{ rolls: [apiRoll(1, { number: undefined })] }],
    [{ rolls: [apiRoll(1, { rolledAt: "nope" })] }],
  ])("rejects the unexpected payload %j", async (body) => {
    fetchMock.mockResolvedValueOnce(reply(body));

    await expect(fetchUserRolls("u", null)).rejects.toThrow(RngdleApiError);
  });

  describe("retries", () => {
    it("gives up after 3 attempts with an exponential backoff", async () => {
      fetchMock.mockImplementation(async () => reply("", { status: 503 }));

      await expect(fetchUserRolls("u", null)).rejects.toThrow("503");
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    });

    it("honors Retry-After capped at 30 seconds and recovers", async () => {
      const limited = (seconds: string) =>
        reply("", { status: 429, headers: { "retry-after": seconds } });
      fetchMock
        .mockResolvedValueOnce(limited("7"))
        .mockResolvedValueOnce(limited("999"))
        .mockResolvedValueOnce(page([apiRoll(1)], false));

      expect(await fetchUserRolls("u", null)).toHaveLength(1);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([7000, 30_000]);
    });
  });
});

describe("fetchScoreTable", () => {
  function tableSource(size: number, percent: (i: number) => number) {
    const entries = Array.from(
      { length: size },
      (_, i) => `${1000 + i}:${percent(i)}`
    );
    return `var t={${entries.join(",")}};`;
  }

  function mockSite(scripts: Record<string, string>) {
    const html = Object.keys(scripts)
      .map((src) => `<script type="module" src="${src}"></script>`)
      .join("");
    fetchMock.mockImplementation(async (url: string) => {
      const path = new URL(url).pathname;
      return path === "/"
        ? reply(html)
        : reply(scripts[path] ?? "", { status: path in scripts ? 200 : 404 });
    });
  }

  it("keeps the biggest table found in the page scripts, compressed", async () => {
    mockSite({
      "/a.js": tableSource(1100, () => 10),
      "/b.js": tableSource(1500, (i) => (i * 100) / 1500),
      "/c.js": "console.log(1)",
    });

    const table = await fetchScoreTable();

    expect(table).not.toBeNull();
    expect(Object.keys(table!).length).toBeGreaterThanOrEqual(20);
    expect(table!["1000"]).toBe(0);
  });

  it("returns null when no script has a plausible table", async () => {
    mockSite({ "/a.js": "var x=1", "/b.js": tableSource(1200, () => 10) });

    expect(await fetchScoreTable()).toBeNull();
  });

  it("throws when the home page is unavailable", async () => {
    fetchMock.mockResolvedValue(reply("", { status: 404 }));

    await expect(fetchScoreTable()).rejects.toThrow(RngdleApiError);
  });
});
