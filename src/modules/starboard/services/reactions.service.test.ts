import { Collection, type Message, ReactionType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import reactions from "./reactions.service.js";

interface FakeUser {
  id: string;
  bot: boolean;
}

function fakeReaction(emoji: string, users: FakeUser[]) {
  const custom = emoji.match(/^<a?:(\w+):(\d+)>$/);
  return {
    emoji: {
      id: custom?.[2] ?? null,
      name: custom?.[1] ?? emoji,
      toString: () => emoji,
    },
    count: users.length,
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
    reactions: {
      cache: new Collection(
        reactions.map((reaction, i) => [String(i), reaction])
      ),
    },
  } as unknown as Message;
}

const user = (id: string, bot = false): FakeUser => ({ id, bot });

describe("ReactionsService.reactors", () => {
  it("reads the reactors of the counted emojis only", async () => {
    const message = fakeMessage([
      fakeReaction("⭐", [user("a"), user("bot", true)]),
      fakeReaction("👍", [user("b")]),
      fakeReaction("<:gold:123456789012345678>", [user("author")]),
    ]);

    expect(
      await reactions.reactors(message, ["⭐", "<:gold:123456789012345678>"])
    ).toEqual([
      { emoji: "⭐", users: [user("a"), user("bot", true)] },
      { emoji: "<:gold:123456789012345678>", users: [user("author")] },
    ]);
  });

  it("pages through more than a hundred reactors", async () => {
    const reactors = Array.from({ length: 150 }, (_, i) => user(`u${i}`));
    const reaction = fakeReaction("⭐", reactors);

    const [read] = await reactions.reactors(fakeMessage([reaction]), ["⭐"]);

    expect(read?.users).toHaveLength(150);
    expect(reaction.users.fetch).toHaveBeenCalledTimes(2);
  });

  it("stops after ten pages", async () => {
    const reactors = Array.from({ length: 1500 }, (_, i) => user(`u${i}`));
    const reaction = fakeReaction("⭐", reactors);

    const [read] = await reactions.reactors(fakeMessage([reaction]), ["⭐"]);

    expect(read?.users).toHaveLength(1000);
    expect(reaction.users.fetch).toHaveBeenCalledTimes(10);
  });

  it("reads super reactions too, each member once", async () => {
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

    expect(
      await reactions.reactors(fakeMessage([reaction as never]), ["⭐"])
    ).toEqual([{ emoji: "⭐", users: [user("a"), user("b")] }]);
  });
});
