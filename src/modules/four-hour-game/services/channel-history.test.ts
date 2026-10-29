import type { TextBasedChannel } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  fetchPlayerMessagesSince,
  fetchStandingMessage,
} from "./channel-history.js";

function channelWith(
  messages: {
    id: string;
    author?: string;
    bot?: boolean;
    system?: boolean;
    at: number;
  }[]
) {
  const entries = messages.map((m) => [
    m.id,
    {
      id: m.id,
      author: { id: m.author ?? `author-${m.id}`, bot: m.bot ?? false },
      system: m.system ?? false,
      createdTimestamp: m.at,
      createdAt: new Date(m.at),
    },
  ]);
  return {
    messages: { fetch: async () => new Map(entries as [string, unknown][]) },
  } as unknown as TextBasedChannel;
}

describe("fetchStandingMessage", () => {
  it("returns the newest message written by a player", async () => {
    const channel = channelWith([
      { id: "old", at: 1_000 },
      { id: "bot", bot: true, at: 4_000 },
      { id: "join", system: true, at: 5_000 },
      { id: "recent", at: 3_000 },
    ]);

    expect(await fetchStandingMessage(channel)).toEqual({
      messageId: "recent",
      authorId: "author-recent",
      sentAt: new Date(3_000),
    });
  });

  it("returns the first of the last player's own run of messages", async () => {
    const channel = channelWith([
      { id: "alice-1", author: "alice", at: 1_000 },
      { id: "bob", author: "bob", at: 2_000 },
      { id: "alice-2", author: "alice", at: 3_000 },
      { id: "bot", bot: true, at: 3_500 },
      { id: "alice-3", author: "alice", at: 4_000 },
    ]);

    expect(await fetchStandingMessage(channel)).toEqual({
      messageId: "alice-2",
      authorId: "alice",
      sentAt: new Date(3_000),
    });
  });

  it("returns null when no player message is left", async () => {
    const channel = channelWith([{ id: "bot", bot: true, at: 1_000 }]);

    expect(await fetchStandingMessage(channel)).toBeNull();
  });
});

// A channel of `count` messages, one per second from t = 1 s, that pages like
// Discord: the newest first, `limit` at most, older than `before`.
function pagedChannel(count: number, author = (i: number) => `p${i % 3}`) {
  const all = Array.from({ length: count }, (_, i) => {
    const at = (i + 1) * 1000;
    return {
      id: String(at),
      author: { id: author(i), bot: false },
      system: false,
      createdTimestamp: at,
      createdAt: new Date(at),
    };
  });
  const fetch = vi.fn(
    async ({ limit, before }: { limit: number; before?: string }) => {
      const older = all.filter(
        (m) => !before || m.createdTimestamp < Number(before)
      );
      const page = older.slice(-limit).reverse();
      return new Map(page.map((m) => [m.id, m]));
    }
  );
  return {
    channel: { messages: { fetch } } as unknown as TextBasedChannel,
    fetch,
  };
}

describe("fetchPlayerMessagesSince", () => {
  it("pages back until it reads a message of that time or older", async () => {
    const { channel, fetch } = pagedChannel(250);

    const messages = await fetchPlayerMessagesSince(channel, new Date(120_000));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(messages[0]!.sentAt.getTime()).toBeLessThanOrEqual(120_000);
    expect(messages.at(-1)!.sentAt).toEqual(new Date(250_000));
    expect(messages.map((m) => m.sentAt.getTime())).toEqual(
      messages.map((m) => m.sentAt.getTime()).sort((a, b) => a - b)
    );
  });

  it("stops at the start of the channel", async () => {
    const { channel, fetch } = pagedChannel(30);

    const messages = await fetchPlayerMessagesSince(channel, new Date(0));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(messages).toHaveLength(30);
  });

  it("gives up after 50 pages", async () => {
    const { channel, fetch } = pagedChannel(6_000);

    const messages = await fetchPlayerMessagesSince(channel, new Date(0));

    expect(fetch).toHaveBeenCalledTimes(50);
    expect(messages).toHaveLength(5_000);
  });
});
