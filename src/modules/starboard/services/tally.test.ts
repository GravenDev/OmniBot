import { Collection, type Message, ReactionType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { tallyReactions, upperBound } from "./tally.js";

interface FakeUser {
  id: string;
  bot: boolean;
}

function fakeReaction(emoji: string, users: FakeUser[], count = users.length) {
  const custom = emoji.match(/^<a?:(\w+):(\d+)>$/);
  return {
    emoji: {
      id: custom?.[2] ?? null,
      name: custom?.[1] ?? emoji,
      toString: () => emoji,
    },
    count,
    users: {
      fetch: vi.fn(
        async ({ limit, after }: { limit: number; after?: string }) => {
          const start = after
            ? users.findIndex((user) => user.id === after) + 1
            : 0;
          return new Collection(
            users.slice(start, start + limit).map((user) => [user.id, user])
          );
        }
      ),
    },
  };
}

function fakeMessage(reactions: ReturnType<typeof fakeReaction>[]) {
  return {
    author: { id: "author" },
    reactions: {
      cache: new Collection(
        reactions.map((reaction, i) => [String(i), reaction])
      ),
    },
  } as unknown as Message;
}

const user = (id: string, bot = false): FakeUser => ({ id, bot });

describe("upperBound", () => {
  it("sums the raw counts of the counted emojis only", () => {
    const message = fakeMessage([
      fakeReaction("⭐", [], 3),
      fakeReaction("🌟", [], 2),
      fakeReaction("👍", [], 10),
    ]);

    expect(upperBound(message, ["⭐", "🌟"])).toBe(5);
  });
});

describe("tallyReactions", () => {
  it("counts each member once across emojis", async () => {
    const message = fakeMessage([
      fakeReaction("⭐", [user("a"), user("b")]),
      fakeReaction("<:gold:123456789012345678>", [user("b"), user("c")]),
    ]);

    const tally = await tallyReactions(
      message,
      ["⭐", "<:gold:123456789012345678>"],
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

  it("ignores bots and, unless self-star is on, the author", async () => {
    const reactors = [user("a"), user("bot", true), user("author")];

    const without = await tallyReactions(
      fakeMessage([fakeReaction("⭐", reactors)]),
      ["⭐"],
      false
    );
    const withSelf = await tallyReactions(
      fakeMessage([fakeReaction("⭐", reactors)]),
      ["⭐"],
      true
    );

    expect(without.total).toBe(1);
    expect(withSelf.total).toBe(2);
  });

  it("drops an emoji nobody counted reacted with", async () => {
    const tally = await tallyReactions(
      fakeMessage([fakeReaction("⭐", [user("author")])]),
      ["⭐"],
      false
    );

    expect(tally).toEqual({ reactions: [], total: 0 });
  });

  it("pages through more than a hundred reactors", async () => {
    const reactors = Array.from({ length: 150 }, (_, i) => user(`u${i}`));
    const reaction = fakeReaction("⭐", reactors);

    const tally = await tallyReactions(fakeMessage([reaction]), ["⭐"], false);

    expect(tally.total).toBe(150);
    expect(reaction.users.fetch).toHaveBeenCalledTimes(2);
  });

  it("counts super reactions too", async () => {
    const normal = [user("a")];
    const burst = [user("a"), user("b")];
    const reaction = {
      emoji: { id: null, name: "⭐", toString: () => "⭐" },
      count: 3,
      countDetails: { normal: 1, burst: 2 },
      users: {
        fetch: vi.fn(
          async ({ type }: { type: ReactionType }) =>
            new Collection(
              (type === ReactionType.Burst ? burst : normal).map((u) => [
                u.id,
                u,
              ])
            )
        ),
      },
    };

    const tally = await tallyReactions(
      fakeMessage([reaction as never]),
      ["⭐"],
      false
    );

    expect(tally).toEqual({ reactions: [{ emoji: "⭐", count: 2 }], total: 2 });
  });
});
