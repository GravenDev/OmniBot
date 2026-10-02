import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchScoreTableFromSite,
  fetchUserRolls,
  RngdleUserNotFoundError,
} from "./rngdle-api.js";

const fetchMock =
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function remoteRoll(id: string, rolledAt: string, extra: object = {}) {
  return { id, number: 1, totalScore: 10, rolledAt, ...extra };
}

function urlOf(call: number) {
  return new URL(fetchMock.mock.calls[call]![0]);
}

describe("fetchUserRolls", () => {
  it("maps the API fields", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        rolls: [
          {
            id: "r1",
            number: 42,
            totalScore: 1234,
            badgeCount: 3,
            rolledAt: "2026-03-04T05:06:07.000Z",
          },
          remoteRoll("r2", "2026-03-03T00:00:00.000Z"),
        ],
        hasMore: false,
      })
    );

    const rolls = await fetchUserRolls("alice", null);

    expect(rolls).toEqual([
      {
        id: "r1",
        number: 42,
        score: 1234,
        badgeCount: 3,
        rolledAt: new Date("2026-03-04T05:06:07.000Z"),
      },
      {
        id: "r2",
        number: 1,
        score: 10,
        badgeCount: 0,
        rolledAt: new Date("2026-03-03T00:00:00.000Z"),
      },
    ]);
  });

  it("encodes the username and uses limit 10 on the first page", async () => {
    fetchMock.mockResolvedValueOnce(json({ rolls: [], hasMore: false }));

    await fetchUserRolls("a b/c", null);

    expect(urlOf(0).pathname).toBe("/api/users/a%20b%2Fc/rolls");
    expect(urlOf(0).origin).toBe("https://www.rngdle.com");
    expect(urlOf(0).searchParams.get("limit")).toBe("10");
    expect(urlOf(0).searchParams.get("offset")).toBe("0");
  });

  it("uses limit 100 and increasing offsets on later pages until hasMore is false", async () => {
    const page = (ids: string[], hasMore: boolean) =>
      json({
        rolls: ids.map((id) => remoteRoll(id, "2026-01-01T00:00:00.000Z")),
        hasMore,
      });
    fetchMock
      .mockResolvedValueOnce(page(["1", "2", "3"], true))
      .mockResolvedValueOnce(page(["4", "5"], true))
      .mockResolvedValueOnce(page(["6"], false));

    const rolls = await fetchUserRolls("alice", null);

    expect(rolls.map((roll) => roll.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      [0, 1, 2].map((call) => [
        urlOf(call).searchParams.get("limit"),
        urlOf(call).searchParams.get("offset"),
      ])
    ).toEqual([
      ["10", "0"],
      ["100", "3"],
      ["100", "5"],
    ]);
  });

  it("stops when the oldest roll of a page is at or before since", async () => {
    fetchMock.mockResolvedValue(
      json({
        rolls: [
          remoteRoll("new", "2026-02-02T00:00:00.000Z"),
          remoteRoll("old", "2026-02-01T00:00:00.000Z"),
        ],
        hasMore: true,
      })
    );

    const rolls = await fetchUserRolls(
      "alice",
      new Date("2026-02-01T00:00:00.000Z")
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rolls).toHaveLength(2);
  });

  it("keeps fetching while the oldest roll is newer than since", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          rolls: [remoteRoll("a", "2026-02-03T00:00:00.000Z")],
          hasMore: true,
        })
      )
      .mockResolvedValueOnce(
        json({
          rolls: [remoteRoll("b", "2026-02-01T00:00:00.000Z")],
          hasMore: true,
        })
      );

    const rolls = await fetchUserRolls(
      "alice",
      new Date("2026-02-02T00:00:00.000Z")
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rolls.map((roll) => roll.id)).toEqual(["a", "b"]);
  });

  it("stops on an empty page even if hasMore is true", async () => {
    fetchMock.mockResolvedValue(json({ rolls: [], hasMore: true }));

    const rolls = await fetchUserRolls("alice", null);

    expect(rolls).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws RngdleUserNotFoundError on 404", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));

    const error = await fetchUserRolls("ghost", null).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(RngdleUserNotFoundError);
    expect((error as RngdleUserNotFoundError).username).toBe("ghost");
  });

  it("throws on any other non-OK status", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    const error = await fetchUserRolls("alice", null).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RngdleUserNotFoundError);
    expect((error as Error).message).toContain("500");
  });

  it("sends an abort signal with every request", async () => {
    fetchMock.mockResolvedValueOnce(json({ rolls: [], hasMore: false }));

    await fetchUserRolls("alice", null);

    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

function table(size: number, firstKey: number) {
  const entries: string[] = [];
  for (let i = 0; i < size; i++) {
    entries.push(`${firstKey + i}:${((i / size) * 100).toFixed(4)}`);
  }
  return `{${entries.join(",")}}`;
}

describe("fetchScoreTableFromSite", () => {
  const home = `<html><head>
    <script src="/a.js"></script>
    <script defer type="module" src='/b.js'></script>
    <script>inline()</script>
  </head></html>`;

  function route(files: Record<string, Response>) {
    fetchMock.mockImplementation(async (url) => {
      const path = new URL(url).pathname;
      if (path === "/") return new Response(home);
      return files[path] ?? new Response("missing", { status: 404 });
    });
  }

  it("keeps the bigger valid table among the scripts", async () => {
    route({
      "/a.js": new Response(`var t=${table(1100, 1000)};`),
      "/b.js": new Response(`var t=${table(1500, 5000)};`),
    });

    const compressed = await fetchScoreTableFromSite();

    expect(compressed).not.toBeNull();
    expect(Object.keys(compressed!).every((key) => Number(key) >= 5000)).toBe(
      true
    );
    expect(Object.keys(compressed!).length).toBeGreaterThan(0);
  });

  it("resolves relative script urls against the site", async () => {
    route({
      "/a.js": new Response(`var t=${table(1100, 1000)};`),
      "/b.js": new Response("nothing"),
    });

    await fetchScoreTableFromSite();

    const requested = fetchMock.mock.calls.map(([url]) => url);
    expect(requested).toContain("https://www.rngdle.com/a.js");
    expect(requested).toContain("https://www.rngdle.com/b.js");
  });

  it("skips scripts that fail to load", async () => {
    route({ "/b.js": new Response(`var t=${table(1100, 1000)};`) });

    expect(await fetchScoreTableFromSite()).not.toBeNull();
  });

  it("returns null when no script contains a table", async () => {
    route({
      "/a.js": new Response("var a={1:2}"),
      "/b.js": new Response("console.log(1)"),
    });

    expect(await fetchScoreTableFromSite()).toBeNull();
  });

  it("throws when the home page fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }));

    await expect(fetchScoreTableFromSite()).rejects.toThrow("503");
  });
});

describe("fetchScoreTableFromSite plausibility", () => {
  it("returns null when the compressed table is not plausible", async () => {
    const entries: string[] = [];
    for (let i = 0; i < 1500; i++) {
      entries.push(`${1000 + i}:${(100 - (i / 1500) * 100).toFixed(4)}`);
    }
    fetchMock.mockImplementation(async (url) => {
      const path = new URL(url).pathname;
      if (path === "/") return new Response('<script src="/a.js"></script>');
      return new Response(`var t={${entries.join(",")}};`);
    });

    expect(await fetchScoreTableFromSite()).toBeNull();
  });

  it("returns null when the table has too few distinct steps", async () => {
    const entries: string[] = [];
    for (let i = 0; i < 1500; i++) {
      entries.push(`${1000 + i}:${i < 750 ? "10.1" : "10.2"}`);
    }
    fetchMock.mockImplementation(async (url) => {
      const path = new URL(url).pathname;
      if (path === "/") return new Response('<script src="/a.js"></script>');
      return new Response(`var t={${entries.join(",")}};`);
    });

    expect(await fetchScoreTableFromSite()).toBeNull();
  });
});
