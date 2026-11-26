import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "#lib/i18n.js";
import { PUBLIC_FLAGS } from "../views.js";
import type { LiveSnapshot } from "./sources.js";
import { startWatchFlow, watchRefusal } from "./watch.js";

const watch = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => vi.fn());
const liveMessage = vi.hoisted(() => vi.fn());
const missingNames = vi.hoisted(() => vi.fn());

vi.mock("#lib/permissions.js", () => ({
  missingBotPermissionNames: missingNames,
}));

const countActive = vi.hoisted(() => vi.fn());

vi.mock("../services/live-store.service.js", () => ({
  default: { watch, countActive },
}));
vi.mock("../services/watcher.service.js", () => ({ default: { track } }));
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
  countActive.mockResolvedValue(0);
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

describe("watchRefusal", () => {
  const channel = { isDMBased: () => false };
  const guild = { id: "guild" };

  it("lets a watch start where the bot can read and edit its message", async () => {
    missingNames.mockResolvedValue(null);
    expect(
      await watchRefusal(
        { guild, channel, guildId: "guild", user: { id: "owner" } } as never,
        t
      )
    ).toBeNull();
    expect(missingNames).toHaveBeenCalledWith(
      guild,
      channel,
      ["ViewChannel", "ReadMessageHistory", "AttachFiles"],
      t
    );
  });

  it("names the permissions the watcher would lack to edit the board", async () => {
    missingNames.mockResolvedValue("permission.ReadMessageHistory");
    expect(
      await watchRefusal(
        { guild, channel, guildId: "guild", user: { id: "owner" } } as never,
        t
      )
    ).toBe("live.missingPermissions");
  });

  it("refuses outside a guild channel", async () => {
    expect(await watchRefusal({ guild: null, channel } as never, t)).toBe(
      "error.invalid"
    );
  });

  const asked = {
    guild,
    channel,
    guildId: "guild",
    user: { id: "owner" },
  } as never;

  it("refuses a fourth watch of the same member", async () => {
    missingNames.mockResolvedValue(null);
    countActive.mockImplementation(async (where: { ownerId?: string }) =>
      where.ownerId ? 3 : 3
    );
    expect(await watchRefusal(asked, t)).toBe("live.limitMember");
    expect(countActive).toHaveBeenCalledWith({
      guildId: "guild",
      ownerId: "owner",
    });
  });

  it("refuses an eleventh watch on the same server", async () => {
    missingNames.mockResolvedValue(null);
    countActive.mockImplementation(async (where: { ownerId?: string }) =>
      where.ownerId ? 0 : 10
    );
    expect(await watchRefusal(asked, t)).toBe("live.limitGuild");
  });
});
