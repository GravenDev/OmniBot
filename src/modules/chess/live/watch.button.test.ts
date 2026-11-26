import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChessSession } from "../types.js";

const mocks = vi.hoisted(() => ({
  ownedSession: vi.fn(),
  gameFromUrl: vi.fn(),
  startWatchFlow: vi.fn(),
  watchRefusal: vi.fn(),
  replyEphemeral: vi.fn(),
  errorMessage: vi.fn((_t: unknown, key: string) => ({ marker: key })),
}));

vi.mock("../interactions/common.js", () => ({
  ownedSession: mocks.ownedSession,
}));
vi.mock("../views.js", () => ({ errorMessage: mocks.errorMessage }));
vi.mock("#lib/logger.js", () => ({
  loggerMaker: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("./sources.js", () => ({ gameFromUrl: mocks.gameFromUrl }));
vi.mock("./watch.js", () => ({
  startWatchFlow: mocks.startWatchFlow,
  watchRefusal: mocks.watchRefusal,
}));
vi.mock("#lib/reply.js", () => ({ replyEphemeral: mocks.replyEphemeral }));

import watchButton from "./watch.button.js";

const t = ((key: string) => key) as never;
const config = { t } as never;
const url = "https://lichess.org/game/I1hZ2msL";

function interaction() {
  return {
    guildId: "guild",
    channelId: "channel",
    user: { id: "owner" },
    deferUpdate: vi.fn(async () => undefined),
    reply: vi.fn(async () => undefined),
    followUp: vi.fn(async () => ({ id: "public" })),
  };
}

const session = {
  id: "session",
  ownerId: "owner",
  mode: "view",
  requestedPlayer: "RedsTom",
  games: [
    {
      id: "I1hZ2msL",
      source: "lichess",
      white: "Alice",
      black: "RedsTom",
      result: "unknown",
      timeControl: "1800+0",
      speed: "rapide",
      playedAt: null,
      url,
      pgn: "",
      ongoing: true,
    },
  ],
} as unknown as ChessSession;

const snapshot = {
  source: "lichess",
  gameId: "I1hZ2msL",
  url,
  white: "Alice",
  black: "RedsTom",
  timeControl: "1800+0",
  moves: ["d2d4"],
  finished: false,
  result: "unknown",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ownedSession.mockResolvedValue(session);
  mocks.gameFromUrl.mockResolvedValue(snapshot);
  mocks.startWatchFlow.mockResolvedValue(undefined);
  mocks.watchRefusal.mockResolvedValue(null);
});

describe("list watch button", () => {
  it("starts the same public watch as the command", async () => {
    const event = interaction();

    await watchButton.execute(event as never, ["session", "0"], config);

    expect(event.deferUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.gameFromUrl).toHaveBeenCalledWith(url);
    expect(mocks.startWatchFlow).toHaveBeenCalledWith(
      snapshot,
      expect.objectContaining({
        guildId: "guild",
        channelId: "channel",
        ownerId: "owner",
        requestedPlayer: "RedsTom",
        t,
      })
    );
    expect(event.followUp).not.toHaveBeenCalled();
  });

  it("answers with an ephemeral error when the game is already over", async () => {
    const event = interaction();
    mocks.gameFromUrl.mockResolvedValue(null);

    await watchButton.execute(event as never, ["session", "0"], config);

    expect(mocks.startWatchFlow).not.toHaveBeenCalled();
    expect(event.followUp).toHaveBeenCalledWith({ marker: "live.noGame" });
  });

  it("recognises button interactions", () => {
    expect(watchButton.check({ isButton: () => true } as never)).toBe(true);
    expect(watchButton.check({ isButton: () => false } as never)).toBe(false);
  });

  it("refuses a watch started from an analysis list", async () => {
    const event = interaction();
    mocks.ownedSession.mockResolvedValue({ ...session, mode: "analyse" });

    await watchButton.execute(event as never, ["session", "0"], config);

    expect(event.reply).toHaveBeenCalledWith({ marker: "error.invalid" });
    expect(event.deferUpdate).not.toHaveBeenCalled();
  });

  it("answers with an ephemeral error when the feed throws", async () => {
    const event = interaction();
    mocks.gameFromUrl.mockRejectedValueOnce(new Error("network down"));

    await watchButton.execute(event as never, ["session", "0"], config);

    expect(event.followUp).toHaveBeenCalledWith({ marker: "error.url" });
  });

  it("refuses before publishing where the watcher could not edit the board", async () => {
    const event = interaction();
    mocks.watchRefusal.mockResolvedValue("live.missingPermissions");

    await watchButton.execute(event as never, ["session", "0"], config);

    expect(mocks.replyEphemeral).toHaveBeenCalledWith(
      event,
      "live.missingPermissions"
    );
    expect(event.deferUpdate).not.toHaveBeenCalled();
    expect(mocks.startWatchFlow).not.toHaveBeenCalled();
  });
});
