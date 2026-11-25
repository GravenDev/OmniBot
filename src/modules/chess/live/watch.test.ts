import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "#lib/i18n.js";
import { PUBLIC_FLAGS } from "../views.js";
import type { LiveSnapshot } from "./sources.js";
import { startWatchFlow } from "./watch.js";

const watch = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => vi.fn());
const liveMessage = vi.hoisted(() => vi.fn());

vi.mock("./store.service.js", () => ({ default: { watch } }));
vi.mock("./watcher.service.js", () => ({ default: { track } }));
vi.mock("./views.js", () => ({ liveMessage }));

const t = ((key: string) => key) as TFunction;

const snapshot: LiveSnapshot = {
  source: "lichess",
  gameId: "I1hZ2msL",
  url: "https://lichess.org/I1hZ2msL",
  white: "Alice",
  black: "RedsTom",
  timeControl: "1800+0",
  moves: ["d2d4"],
  finished: false,
  result: "unknown",
};

function context(send = vi.fn(async () => ({ id: "public-message" }))) {
  return {
    guildId: "guild",
    channelId: "channel",
    ownerId: "owner",
    t,
    send,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  watch.mockImplementation(async (game) => ({ ...game }));
  liveMessage.mockResolvedValue({
    components: [],
    flags: PUBLIC_FLAGS,
    allowedMentions: { parse: [] },
  });
});

describe("shared watch flow", () => {
  it("publishes the board and remembers the message for an ongoing game", async () => {
    const send = vi.fn(async () => ({ id: "public-message" }));

    await startWatchFlow(snapshot, context(send));

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ flags: PUBLIC_FLAGS })
    );
    expect(watch).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "public-message",
        flipped: false,
        result: "unknown",
      })
    );
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("carries a custom starting position into the stored watch", async () => {
    const fen = "4k3/8/8/8/8/4P3/8/4K3 w - - 0 1";
    await startWatchFlow(
      { ...snapshot, startFen: fen, moves: ["e3e4"] },
      context()
    );

    expect(watch).toHaveBeenCalledWith(
      expect.objectContaining({ startFen: fen, moves: ["e3e4"] })
    );
  });

  it("keeps the requested player at the bottom and leaves finished games out of the DB", async () => {
    await startWatchFlow(
      { ...snapshot, finished: true, result: "black" },
      { ...context(), requestedPlayer: "RedsTom" }
    );

    expect(watch).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();

    await startWatchFlow(snapshot, {
      ...context(),
      requestedPlayer: "RedsTom",
    });
    expect(watch).toHaveBeenCalledWith(
      expect.objectContaining({ flipped: true })
    );
  });
});
