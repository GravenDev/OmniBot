import type { TextBasedChannel } from "discord.js";
import { describe, expect, it } from "vitest";
import { fetchStandingMessage } from "./channel-history.js";

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
