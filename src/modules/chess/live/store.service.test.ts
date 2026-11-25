import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveGame } from "./types.js";

const upsert = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const del = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());
vi.mock("#lib/database.js", () => ({
  default: {
    chessLiveGame: { upsert, update, delete: del, findUnique, findMany },
  },
}));

const { default: store } = await import("./store.service.js");

const row = {
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
  moves: "d2d4",
  finished: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue(row);
  update.mockResolvedValue(row);
  del.mockResolvedValue(row);
  findUnique.mockResolvedValue(row);
  findMany.mockResolvedValue([row]);
});

describe("live game store", () => {
  it("writes only database columns, not the view's ply", async () => {
    // The command passes a whole LiveGame, whose extra fields are allowed
    // because it is a variable rather than an inline object literal.
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
      moves: ["d2d4"],
      ply: 1,
      finished: true,
      result: "white",
    };
    await store.watch(game);

    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call["create"]).not.toHaveProperty("ply");
    expect(call["update"]).not.toHaveProperty("ply");
    expect(call["create"]).not.toHaveProperty("result");
    expect(call["create"]).toMatchObject({
      id: "watch-id",
      moves: "d2d4",
      flipped: false,
      startFen: null,
    });
    expect(call["update"]).toMatchObject({ moves: "d2d4", finished: false });
  });

  it("rebuilds the view model from the stored row", async () => {
    const game = await store.watch({
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
      moves: ["d2d4"],
    });

    expect(game).toMatchObject({
      id: "watch-id",
      ply: 1,
      moves: ["d2d4"],
      result: "unknown",
    });
  });

  it("persists and restores a custom starting FEN", async () => {
    const fen = "4k3/8/8/8/8/4P3/8/4K3 w - - 0 1";
    upsert.mockResolvedValue({ ...row, startFen: fen });

    const stored = await store.watch({
      source: "lichess",
      gameId: "I1hZ2msL",
      url: "https://lichess.org/I1hZ2msL",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      ownerId: "owner",
      white: "Alice",
      black: "Bob",
      timeControl: "180+0",
      flipped: false,
      moves: ["e3e4"],
      startFen: fen,
    });

    expect(stored.startFen).toBe(fen);
    const call = upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call["create"]).toMatchObject({ startFen: fen });
  });

  it("only updates moves for ongoing games and deletes finished ones", async () => {
    await store.setMoves("watch-id", ["d2d4", "e7e5"]);
    expect(update).toHaveBeenCalledWith({
      where: { id: "watch-id" },
      data: { moves: "d2d4 e7e5" },
    });

    await store.unwatch("watch-id");
    expect(del).toHaveBeenCalledWith({ where: { id: "watch-id" } });
  });

  it("reads a watch and returns null when it is gone", async () => {
    expect(await store.get("watch-id")).toMatchObject({
      id: "watch-id",
      moves: ["d2d4"],
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "watch-id" } });

    findUnique.mockResolvedValueOnce(null);
    expect(await store.get("missing")).toBeNull();
  });

  it("lists active watches, optionally limited to a guild", async () => {
    expect(await store.active()).toMatchObject([{ id: "watch-id" }]);
    expect(findMany).toHaveBeenLastCalledWith({
      where: { finished: false },
      orderBy: { createdAt: "desc" },
    });

    await store.active(["guild", "other"]);
    expect(findMany).toHaveBeenLastCalledWith({
      where: { finished: false, guildId: { in: ["guild", "other"] } },
      orderBy: { createdAt: "desc" },
    });
  });
});
