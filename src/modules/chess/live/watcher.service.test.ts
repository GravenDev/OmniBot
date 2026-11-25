import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveGame } from "./types.js";

const refreshGame = vi.hoisted(() => vi.fn());
const setMoves = vi.hoisted(() => vi.fn());
const unwatch = vi.hoisted(() => vi.fn());
const getConfig = vi.hoisted(() => vi.fn());
const liveMessage = vi.hoisted(() => vi.fn());
const edit = vi.hoisted(() => vi.fn());

vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn: getConfig },
}));
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds: vi.fn() },
}));
vi.mock("#lib/guild-loop.js", () => ({ presentGuilds: vi.fn(() => []) }));
vi.mock("#lib/logger.js", () => ({
  loggerMaker: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("../views.js", () => ({ editable: (message: unknown) => message }));
vi.mock("./sources.js", () => ({ refreshGame }));
vi.mock("./store.service.js", () => ({
  default: { setMoves, unwatch, active: vi.fn() },
}));
vi.mock("./views.js", () => ({ liveMessage }));

const { default: watcher } = await import("./watcher.service.js");

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
  finished: false,
  result: "unknown",
};

async function poll(current: LiveGame): Promise<void> {
  await (
    watcher as unknown as { poll: (game: LiveGame) => Promise<void> }
  ).poll(current);
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshGame.mockReset();
  getConfig.mockResolvedValue({ t: (key: string) => key });
  liveMessage.mockResolvedValue({
    components: [],
    flags: 8_192,
    allowedMentions: { parse: [] },
  });
  edit.mockResolvedValue(undefined);
  setMoves.mockResolvedValue(undefined);
  unwatch.mockResolvedValue(undefined);
  watcher.attach(
    {
      channels: {
        fetch: vi.fn(async () => ({
          isTextBased: () => true,
          messages: { fetch: vi.fn(async () => ({ edit })) },
        })),
      },
    } as never,
    { id: "chess" } as never
  );
});

afterEach(() => {
  watcher.stopAll();
});

describe("live watcher", () => {
  it("shows the result once, then removes the finished game from the database", async () => {
    refreshGame.mockResolvedValue({
      ...game,
      moves: ["d2d4", "e7e5"],
      ply: 2,
      finished: true,
      result: "white",
    });

    await poll(game);

    expect(edit).toHaveBeenCalledTimes(1);
    expect(liveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ finished: true, result: "white" }),
      expect.anything(),
      2,
      false
    );
    expect(unwatch).toHaveBeenCalledWith("watch-id");
    expect(setMoves).not.toHaveBeenCalled();
  });

  it("only updates the moves while the game is in progress", async () => {
    refreshGame.mockResolvedValue({
      ...game,
      moves: ["d2d4", "e7e5"],
      ply: 2,
      finished: false,
      result: "unknown",
    });

    await poll(game);

    expect(setMoves).toHaveBeenCalledWith("watch-id", ["d2d4", "e7e5"]);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(unwatch).not.toHaveBeenCalled();
  });

  it("retries a failed move edit without persisting moves it did not show", async () => {
    refreshGame.mockResolvedValue({
      ...game,
      moves: ["d2d4", "e7e5"],
      ply: 2,
    });
    edit.mockRejectedValueOnce(new Error("Discord 5xx"));

    await poll(game);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(setMoves).not.toHaveBeenCalled();

    // No new move: the stored state is still the one on the public message.
    await poll(game);
    expect(edit).toHaveBeenCalledTimes(2);
    expect(setMoves).toHaveBeenCalledWith("watch-id", ["d2d4", "e7e5"]);
  });

  it("does not delete the watch when the final edit fails", async () => {
    refreshGame.mockResolvedValue({
      ...game,
      moves: ["d2d4", "e7e5"],
      ply: 2,
      finished: true,
      result: "white",
    });
    edit.mockRejectedValueOnce(new Error("Discord 5xx"));

    await poll(game);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(unwatch).not.toHaveBeenCalled();

    await poll(game);
    expect(edit).toHaveBeenCalledTimes(2);
    expect(unwatch).toHaveBeenCalledWith("watch-id");
  });

  it("keeps polling after repeated feed failures", async () => {
    vi.useFakeTimers();
    try {
      refreshGame.mockRejectedValue(new Error("network down"));
      watcher.track(game);
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      expect(refreshGame.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
