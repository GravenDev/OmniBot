import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sleep = vi.hoisted(() => vi.fn(async (_ms: number) => undefined));
vi.mock("node:timers/promises", () => ({ setTimeout: sleep }));

import {
  avatarUrl,
  ClashApiError,
  ClashNotFoundError,
  fetchClashReport,
  parseReport,
} from "./api.js";

const HANDLE = "41140793b2b34c8b62ebcb650e8b45c24694f07";

/** Trimmed from a real response of the CodinGame API (April 2025). */
const REPORT = {
  nbPlayersMin: 2,
  nbPlayersMax: 100,
  publicHandle: HANDLE,
  clashDurationTypeId: "SHORT",
  mode: "FASTEST",
  startTimestamp: 1744479040445,
  finished: true,
  started: true,
  players: [
    {
      codingamerId: 1234567,
      codingamerNickname: "Idefa",
      codingamerAvatarId: 143295282580552,
      score: 100,
      duration: 254295,
      status: "STANDARD",
      testSessionStatus: "COMPLETED",
      languageId: "Python3",
      rank: 2,
      position: 2,
    },
    {
      codingamerId: 5458918,
      codingamerNickname: "lody_gives_teacup",
      codingamerAvatarId: 104005247704147,
      score: 100,
      duration: 146704,
      status: "OWNER",
      testSessionStatus: "COMPLETED",
      languageId: "Python3",
      rank: 1,
      position: 1,
    },
    {
      codingamerId: 7654321,
      codingamerNickname: "Thorin_56",
      duration: 360412,
      status: "STANDARD",
      rank: 3,
      position: 4,
    },
  ],
  programmingLanguages: [],
  modes: ["FASTEST", "REVERSE", "SHORTEST"],
  type: "PRIVATE",
};

const fetchMock = vi.fn();

function reply(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), init);
}

beforeEach(() => {
  fetchMock.mockReset();
  sleep.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseReport", () => {
  it("reads the game and sorts the players by rank", () => {
    const report = parseReport(REPORT);
    expect(report).toMatchObject({
      handle: HANDLE,
      mode: "FASTEST",
      started: true,
      finished: true,
      startedAt: new Date(1744479040445),
    });
    expect(report.players.map((player) => player.nickname)).toEqual([
      "lody_gives_teacup",
      "Idefa",
      "Thorin_56",
    ]);
    expect(report.players[0]).toEqual({
      codingamerId: 5458918,
      nickname: "lody_gives_teacup",
      avatarId: 104005247704147n,
      rank: 1,
      score: 100,
      durationMs: 146704,
      criterion: null,
      language: "Python3",
    });
  });

  it("defaults the missing fields of a player who did not submit", () => {
    expect(parseReport(REPORT).players[2]).toMatchObject({
      avatarId: null,
      score: 0,
      language: null,
    });
  });

  it("keeps an unknown mode as null instead of failing", () => {
    expect(parseReport({ ...REPORT, mode: null }).mode).toBeNull();
    expect(parseReport({ ...REPORT, mode: "CODEGOLF" }).mode).toBeNull();
  });

  it("rejects a malformed response", () => {
    expect(() => parseReport({ ...REPORT, players: null })).toThrow(
      ClashApiError
    );
    expect(() =>
      parseReport({ ...REPORT, players: [{ codingamerNickname: "x" }] })
    ).toThrow(ClashApiError);
  });
});

describe("fetchClashReport", () => {
  it("posts the handle as a one-item JSON array", async () => {
    fetchMock.mockResolvedValue(reply(REPORT));
    await fetchClashReport(HANDLE);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("findClashReportInfoByHandle");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify([HANDLE]));
  });

  it("turns CodinGame's 422 into a not-found error", async () => {
    fetchMock.mockResolvedValue(
      reply({ id: 502, message: "Clash not found" }, { status: 422 })
    );
    await expect(fetchClashReport(HANDLE)).rejects.toBeInstanceOf(
      ClashNotFoundError
    );
  });

  it("retries a server error, then gives up", async () => {
    fetchMock.mockResolvedValue(reply({}, { status: 503 }));
    await expect(fetchClashReport(HANDLE)).rejects.toBeInstanceOf(
      ClashApiError
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("recovers when a retry succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(reply({}, { status: 429 }))
      .mockResolvedValueOnce(reply(REPORT));
    await expect(fetchClashReport(HANDLE)).resolves.toMatchObject({
      handle: HANDLE,
    });
  });
});

describe("avatarUrl", () => {
  it("points at CodinGame's file servlet", () => {
    expect(avatarUrl(104005247704147n)).toBe(
      "https://static.codingame.com/servlet/fileservlet?id=104005247704147&format=profile_avatar"
    );
  });
});
