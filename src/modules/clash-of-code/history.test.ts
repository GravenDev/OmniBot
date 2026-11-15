import { describe, expect, it } from "vitest";
import { newSearchState, recordPage } from "./history.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const link = (handle: string) =>
  `https://www.codingame.com/clashofcode/clash/${handle}`;

function message(id: string, content: string | null, bot = false) {
  return { id, channel_id: "chan", content, author: { bot } } as never;
}

describe("recordPage", () => {
  it("keeps the first message of each game and counts every message", () => {
    const state = newSearchState();
    recordPage(state, [
      message("1", link(A)),
      message("2", `${link(A)} ${link(B)}`),
      message("3", null),
    ]);
    expect([...state.found.values()]).toEqual([
      { handle: A, channelId: "chan", messageId: "1" },
      { handle: B, channelId: "chan", messageId: "2" },
    ]);
    expect(state.messages).toBe(3);
    expect(state.after).toBeUndefined();
  });

  it("skips the links posted by bots", () => {
    const state = newSearchState();
    recordPage(state, [message("1", link(A), true)]);
    expect(state.found.size).toBe(0);
    expect(state.messages).toBe(1);
  });
});
