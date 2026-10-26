import { afterEach, describe, expect, it, vi } from "vitest";
// The fake timers do not patch node:timers/promises: route it to setTimeout.
vi.mock("node:timers/promises", () => ({
  setTimeout: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}));

import { findChannelClashes, SearchNotReadyError } from "./history.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);

function message(id: string, content: string, bot = false) {
  return { id, channel_id: "chan", content, author: { bot } };
}

// The search nests each message in its own array.
function page(...messages: ReturnType<typeof message>[]) {
  return { messages: messages.map((m) => [m]), total_results: messages.length };
}

function rest(...responses: unknown[]) {
  const get = vi.fn();
  for (const response of responses) {
    get.mockResolvedValueOnce(response);
  }
  get.mockResolvedValue({ messages: [] });
  return { get } as never as { get: ReturnType<typeof vi.fn> };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("findChannelClashes", () => {
  it("collects the clash links of every page, oldest first", async () => {
    const api = rest(
      page(
        message("1", `https://www.codingame.com/clashofcode/clash/${A}`),
        message(
          "2",
          `GG https://www.codingame.com/clashofcode/clash/report/${B}`
        )
      ),
      page(message("3", `https://codingame.com/clashofcode/clash/${C}`))
    );
    await expect(
      findChannelClashes(api as never, "g", "chan")
    ).resolves.toEqual([
      { handle: A, channelId: "chan", messageId: "1" },
      { handle: B, channelId: "chan", messageId: "2" },
      { handle: C, channelId: "chan", messageId: "3" },
    ]);

    const [route, { query }] = api.get.mock.calls[0]!;
    expect(route).toBe("/guilds/g/messages/search");
    expect(Object.fromEntries(query)).toMatchObject({
      channel_id: "chan",
      link_hostname: "codingame.com",
      sort_by: "timestamp",
      sort_order: "asc",
    });
    expect(api.get.mock.calls[1]![1].query.get("min_id")).toBe("2");
    expect(api.get.mock.calls[2]![1].query.get("min_id")).toBe("3");
  });

  it("keeps only clash links, once each, and skips bots", async () => {
    const api = rest(
      page(
        message("1", "https://www.codingame.com/ide/puzzle/onboarding"),
        message("2", `https://www.codingame.com/clashofcode/clash/${A}`),
        message("3", `again https://www.codingame.com/clashofcode/clash/${A}`),
        message("4", `https://www.codingame.com/clashofcode/clash/${B}`, true),
        message("5", `\`https://www.codingame.com/clashofcode/clash/${C}\``)
      )
    );
    await expect(
      findChannelClashes(api as never, "g", "chan")
    ).resolves.toEqual([{ handle: A, channelId: "chan", messageId: "2" }]);
  });

  it("waits while Discord indexes the guild", async () => {
    vi.useFakeTimers();
    const api = rest(
      { code: 110000, retry_after: 3 },
      page(message("1", `https://www.codingame.com/clashofcode/clash/${A}`))
    );
    const result = findChannelClashes(api as never, "g", "chan");
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toHaveLength(1);
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it("gives up when the index never becomes available", async () => {
    vi.useFakeTimers();
    const api = { get: vi.fn().mockResolvedValue({ code: 110000 }) };
    const result = findChannelClashes(api as never, "g", "chan");
    const outcome = expect(result).rejects.toBeInstanceOf(SearchNotReadyError);
    await vi.advanceTimersByTimeAsync(10 * 30_000);
    await outcome;
  });

  it("reports its progress after each page", async () => {
    const api = rest(
      page(
        message("1", `https://www.codingame.com/clashofcode/clash/${A}`),
        message("2", `https://www.codingame.com/clashofcode/clash/${A}`)
      ),
      page(message("3", `https://codingame.com/clashofcode/clash/${C}`))
    );
    const onProgress = vi.fn();
    await findChannelClashes(api as never, "g", "chan", onProgress);
    expect(onProgress.mock.calls).toEqual([
      [{ messages: 2, found: 1 }],
      [{ messages: 3, found: 2 }],
    ]);
  });
});
