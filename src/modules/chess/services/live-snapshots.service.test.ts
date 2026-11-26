import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveGame } from "../live/types.js";
import snapshots from "./live-snapshots.service.js";

const game: LiveGame = {
  id: "watch-id",
  source: "lichess",
  gameId: "I1hZ2msL",
  url: "https://lichess.org/game/I1hZ2msL",
  guildId: "guild",
  channelId: "channel",
  messageId: "message",
  ownerId: "owner",
  white: "Anonymous",
  black: "RedsTom",
  timeControl: "1800+0",
  flipped: false,
  moves: ["d2d4", "e7e5"],
  ply: 2,
  finished: false,
  result: "unknown",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("live snapshots", () => {
  it("gives a private copy its own id and keeps its moves", () => {
    const snapshot = snapshots.create(game);

    expect(snapshot.id).not.toBe(game.id);
    expect(snapshots.get(snapshot.id)).toMatchObject({
      id: snapshot.id,
      moves: ["d2d4", "e7e5"],
    });
  });

  it("forgets a snapshot that is no longer browsed", () => {
    vi.useFakeTimers();
    const snapshot = snapshots.create(game);

    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    expect(snapshots.get(snapshot.id)).toBeNull();
  });
});
