import { Collection, type Message } from "discord.js";
import { describe, expect, it } from "vitest";
import { countedReactions, tallyOf, upperBound } from "./tally.js";

function fakeReaction(emoji: string, count: number) {
  const custom = emoji.match(/^<a?:(\w+):(\d+)>$/);
  return {
    emoji: { id: custom?.[2] ?? null, name: custom?.[1] ?? emoji },
    count,
  };
}

function fakeMessage(reactions: ReturnType<typeof fakeReaction>[]) {
  return {
    reactions: {
      cache: new Collection(
        reactions.map((reaction, i) => [String(i), reaction])
      ),
    },
  } as unknown as Message;
}

const user = (id: string, bot = false) => ({ id, bot });

describe("countedReactions", () => {
  it("keeps the reactions of the counted emojis, custom ones included", () => {
    const star = fakeReaction("⭐", 1);
    const gold = fakeReaction("<:gold:123456789012345678>", 1);
    const message = fakeMessage([star, fakeReaction("👍", 1), gold]);

    expect(
      countedReactions(message, ["⭐", "<:gold:123456789012345678>"])
    ).toEqual([star, gold]);
  });
});

describe("upperBound", () => {
  it("sums the raw counts of the counted emojis only", () => {
    const message = fakeMessage([
      fakeReaction("⭐", 3),
      fakeReaction("🌟", 2),
      fakeReaction("👍", 10),
    ]);

    expect(upperBound(message, ["⭐", "🌟"])).toBe(5);
  });
});

describe("tallyOf", () => {
  it("counts each member once across emojis", () => {
    const tally = tallyOf(
      [
        { emoji: "⭐", users: [user("a"), user("b")] },
        { emoji: "<:gold:123456789012345678>", users: [user("b"), user("c")] },
      ],
      "author",
      false
    );

    expect(tally).toEqual({
      reactions: [
        { emoji: "⭐", count: 2 },
        { emoji: "<:gold:123456789012345678>", count: 2 },
      ],
      total: 3,
    });
  });

  it("ignores bots and, unless self-star is on, the author", () => {
    const reactors = [
      { emoji: "⭐", users: [user("a"), user("bot", true), user("author")] },
    ];

    expect(tallyOf(reactors, "author", false)).toEqual({
      reactions: [{ emoji: "⭐", count: 1 }],
      total: 1,
    });
    expect(tallyOf(reactors, "author", true)).toEqual({
      reactions: [{ emoji: "⭐", count: 2 }],
      total: 2,
    });
  });

  it("drops an emoji nobody counted reacted with", () => {
    const tally = tallyOf(
      [{ emoji: "⭐", users: [user("author"), user("bot", true)] }],
      "author",
      false
    );

    expect(tally).toEqual({ reactions: [], total: 0 });
  });
});
