import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveGame } from "../live/types.js";

const upsert = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const del = vi.hoisted(() => vi.fn());
const deleteMany = vi.hoisted(() => vi.fn(async () => ({ count: 0 })));
const findUnique = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());
const count = vi.hoisted(() => vi.fn(async () => 2));
vi.mock("#lib/database.js", () => ({
  default: {
    chessLiveGame: {
      upsert,
      update,
      updateMany,
      delete: del,
      deleteMany,
      findUnique,
      findMany,
      count,
    },
  },
}));

const { default: store } = await import("./live-store.service.js");

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
    expect(await store.setMoves("watch-id", ["d2d4", "e7e5"])).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "watch-id" },
      data: { moves: "d2d4 e7e5" },
    });

    // A watch already removed (by a second poll or a deleted channel) is not
    // an error: deleteMany does not throw P2025 like delete.
    await store.unwatch("watch-id");
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "watch-id" } });
    expect(del).not.toHaveBeenCalled();
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

  it("removes every watch of a deleted channel and returns their ids", async () => {
    findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    expect(await store.removeChannel("guild", "channel")).toEqual(["a", "b"]);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
    });
  });

  it("removes a member's watches on a guild, for /privacy delete", async () => {
    findMany.mockResolvedValueOnce([{ id: "a" }]);
    expect(await store.removeMember("guild", "owner")).toEqual(["a"]);
    expect(findMany).toHaveBeenLastCalledWith({
      where: { guildId: "guild", ownerId: "owner" },
      select: { id: true },
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a"] } } });
  });

  it("removes every watch of a guild when the module is disabled", async () => {
    findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    expect(await store.removeGuild("guild")).toEqual(["a", "b"]);
    expect(findMany).toHaveBeenLastCalledWith({
      where: { guildId: "guild" },
      select: { id: true },
    });
  });

  it("counts the watches still running for a member or a guild", async () => {
    expect(await store.countActive({ guildId: "guild", ownerId: "o" })).toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: { guildId: "guild", ownerId: "o", finished: false },
    });
  });

  it("says when the moves had no watch left to update", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await store.setMoves("stopped", ["d2d4"])).toBe(false);
  });
});
