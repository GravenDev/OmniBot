import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveGame } from "../live/types.js";

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
  default: { getActivatedGuildIds: activatedGuildIds },
}));
const active = vi.hoisted(() => vi.fn());
const activatedGuildIds = vi.hoisted(() => vi.fn(async () => ["guild"]));

vi.mock("#lib/guild-loop.js", () => ({
  presentGuilds: vi.fn((_client: unknown, ids: string[]) =>
    ids.map((id) => ({ id }))
  ),
}));
vi.mock("#lib/logger.js", () => ({
  loggerMaker: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("../views.js", () => ({ editable: (message: unknown) => message }));
vi.mock("../live/sources.js", () => ({ refreshGame }));
vi.mock("./live-store.service.js", () => ({
  default: { setMoves, unwatch, active },
}));
vi.mock("../live/views.js", () => ({ liveMessage }));

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

function apiError(code: number): DiscordAPIError {
  return new DiscordAPIError(
    { code, message: "refused" },
    code,
    404,
    "GET",
    "/channels/channel/messages/message",
    {}
  );
}

async function poll(current: LiveGame): Promise<void> {
  // Only a watch the watcher owns is polled: track it first, as the command does.
  watcher.track(current);
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
  setMoves.mockResolvedValue(true);
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
      false,
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
  it.each([
    ["message", RESTJSONErrorCodes.UnknownMessage],
    ["channel", RESTJSONErrorCodes.UnknownChannel],
    ["access", RESTJSONErrorCodes.MissingAccess],
    ["permission to attach the board", RESTJSONErrorCodes.MissingPermissions],
    ["thread, archived,", RESTJSONErrorCodes.InvalidActionOnArchivedThread],
  ])("stops the watch for good once its %s is gone", async (_what, code) => {
    vi.useFakeTimers();
    try {
      refreshGame.mockResolvedValue({
        ...game,
        moves: ["d2d4", "e7e5"],
        ply: 2,
      });
      edit.mockRejectedValue(apiError(code));

      watcher.track(game);
      await vi.advanceTimersByTimeAsync(60 * 60_000);

      expect(unwatch).toHaveBeenCalledWith("watch-id");
      // Nothing left to show the game on: no further feed request.
      expect(refreshGame).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops a finished game whose message was deleted", async () => {
    refreshGame.mockResolvedValue({
      ...game,
      moves: ["d2d4", "e7e5"],
      ply: 2,
      finished: true,
      result: "white",
    });
    edit.mockRejectedValue(apiError(RESTJSONErrorCodes.UnknownMessage));

    await poll(game);

    expect(unwatch).toHaveBeenCalledWith("watch-id");
  });

  it("waits as long as a rate-limited site asks before polling again", async () => {
    vi.useFakeTimers();
    try {
      const { RateLimitedError } = await import("./site-requests.service.js");
      refreshGame.mockRejectedValueOnce(new RateLimitedError(120_000));
      refreshGame.mockResolvedValue(null);
      watcher.track(game);

      await vi.advanceTimersByTimeAsync(10_000); // first poll (30 min game)
      expect(refreshGame).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100_000);
      expect(refreshGame).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(refreshGame).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not bring back a watch stopped while its poll was waiting on the feed", async () => {
    vi.useFakeTimers();
    try {
      let answer!: (snapshot: unknown) => void;
      refreshGame.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      refreshGame.mockResolvedValue({ ...game, moves: ["d2d4", "e7e5"] });

      watcher.track(game);
      await vi.advanceTimersByTimeAsync(10_000); // the poll starts and waits
      expect(refreshGame).toHaveBeenCalledTimes(1);

      watcher.forget(game.id); // Stop button, /privacy delete, uninstall…
      answer({ ...game, moves: ["d2d4", "e7e5"], ply: 2 });
      await vi.advanceTimersByTimeAsync(60 * 60_000);

      expect(edit).not.toHaveBeenCalled();
      expect(setMoves).not.toHaveBeenCalled();
      expect(refreshGame).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["keeps failing", () => refreshGame.mockRejectedValue(new Error("404"))],
    ["never shows the game", () => refreshGame.mockResolvedValue(null)],
  ])(
    "gives up a watch whose feed %s, instead of polling for ever",
    async (_what, feed) => {
      vi.useFakeTimers();
      try {
        feed();
        watcher.track(game);
        await vi.advanceTimersByTimeAsync(7 * 24 * 60 * 60_000);

        expect(unwatch).toHaveBeenCalledWith("watch-id");
        const calls = refreshGame.mock.calls.length;
        await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
        expect(refreshGame.mock.calls.length).toBe(calls);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("gives up a watch whose message edit keeps failing", async () => {
    vi.useFakeTimers();
    try {
      refreshGame.mockResolvedValue({ ...game, moves: ["d2d4", "e7e5"] });
      edit.mockRejectedValue(new Error("Discord 5xx"));
      watcher.track(game);
      await vi.advanceTimersByTimeAsync(7 * 24 * 60 * 60_000);

      expect(unwatch).toHaveBeenCalledWith("watch-id");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not edit the message of a watch stopped while its board was drawn", async () => {
    let drawn!: (message: unknown) => void;
    liveMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        drawn = resolve;
      })
    );
    refreshGame.mockResolvedValue({ ...game, moves: ["d2d4", "e7e5"], ply: 2 });
    watcher.track(game);
    const polled = (
      watcher as unknown as { poll: (game: LiveGame) => Promise<void> }
    ).poll(game);
    await vi.waitFor(() => expect(liveMessage).toHaveBeenCalled());

    watcher.forget(game.id);
    drawn({ components: [], flags: 8_192, allowedMentions: { parse: [] } });
    await polled;

    expect(edit).not.toHaveBeenCalled();
    expect(setMoves).not.toHaveBeenCalled();
  });

  it("does not resume a watch stopped while the stored watches were read", async () => {
    vi.useFakeTimers();
    try {
      let rows!: (games: LiveGame[]) => void;
      active.mockReturnValueOnce(
        new Promise((resolve) => {
          rows = resolve;
        })
      );
      refreshGame.mockResolvedValue(null);
      const resumed = watcher.resume();
      await vi.advanceTimersByTimeAsync(0);

      watcher.forget(game.id); // the Stop button, during the hourly resume
      rows([game]);
      await resumed;
      await vi.advanceTimersByTimeAsync(60 * 60_000);

      expect(refreshGame).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a watch through an hour of feed outage, gives it up after two", async () => {
    vi.useFakeTimers();
    try {
      refreshGame.mockRejectedValue(new Error("network down"));
      watcher.track({ ...game, timeControl: "180+2" }); // blitz: 5 s base
      await vi.advanceTimersByTimeAsync(60 * 60_000);
      expect(unwatch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(90 * 60_000);
      expect(unwatch).toHaveBeenCalledWith("watch-id");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never gives up a watch because the bot itself is rate limited", async () => {
    vi.useFakeTimers();
    try {
      const { RateLimitedError } = await import("./site-requests.service.js");
      refreshGame.mockRejectedValue(new RateLimitedError(60_000));
      watcher.track(game);
      await vi.advanceTimersByTimeAsync(6 * 60 * 60_000);

      expect(unwatch).not.toHaveBeenCalled();
      // One attempt a minute at most: the pause the site asked for.
      expect(refreshGame.mock.calls.length).toBeLessThanOrEqual(6 * 60 + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a watch it gives up as stopped on its message", async () => {
    vi.useFakeTimers();
    try {
      refreshGame.mockResolvedValue(null);
      watcher.track(game);
      await vi.advanceTimersByTimeAsync(3 * 60 * 60_000);

      expect(unwatch).toHaveBeenCalledWith("watch-id");
      expect(liveMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "watch-id" }),
        expect.anything(),
        expect.any(Number),
        false,
        true
      );
      expect(edit).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not redraw a board it showed when only saving the moves failed", async () => {
    vi.useFakeTimers();
    try {
      refreshGame.mockResolvedValue({
        ...game,
        moves: ["d2d4", "e7e5"],
        ply: 2,
      });
      setMoves.mockRejectedValueOnce(new Error("database down"));
      watcher.track(game);
      await vi.advanceTimersByTimeAsync(5 * 60_000);

      // Shown once: the board is up to date even though the save failed.
      expect(edit).toHaveBeenCalledTimes(1);
      expect(unwatch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling a watch whose row is gone when the moves are saved", async () => {
    vi.useFakeTimers();
    try {
      refreshGame.mockResolvedValue({
        ...game,
        moves: ["d2d4", "e7e5"],
        ply: 2,
      });
      setMoves.mockResolvedValueOnce(false);
      watcher.track(game);
      await vi.advanceTimersByTimeAsync(60 * 60_000);

      expect(refreshGame).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not give up after two failures two hours apart", async () => {
    vi.useFakeTimers();
    try {
      const { RateLimitedError } = await import("./site-requests.service.js");
      refreshGame.mockRejectedValueOnce(new Error("timeout"));
      for (let i = 0; i < 125; i++) {
        refreshGame.mockRejectedValueOnce(new RateLimitedError(60_000));
      }
      refreshGame.mockRejectedValueOnce(new Error("timeout"));
      refreshGame.mockResolvedValue({ ...game }); // the feed is back
      watcher.track(game);

      await vi.advanceTimersByTimeAsync(3 * 60 * 60_000 + 30_000);

      // Only two real failures: a rate limit in between is not an outage.
      expect(unwatch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a Chess.com edit no sooner than its 15 s floor", async () => {
    vi.useFakeTimers();
    try {
      const chesscom = {
        ...game,
        source: "chesscom" as const,
        timeControl: "180+2",
      };
      refreshGame.mockResolvedValue({
        ...chesscom,
        moves: ["d2d4", "e7e5"],
        ply: 2,
      });
      edit.mockRejectedValueOnce(new Error("Discord 5xx"));
      watcher.track(chesscom);

      await vi.advanceTimersByTimeAsync(15_000); // first poll
      expect(refreshGame).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(14_000);
      expect(refreshGame).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(refreshGame).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
