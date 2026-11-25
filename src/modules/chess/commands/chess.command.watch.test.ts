import { MessageFlags } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deferReply = vi.hoisted(() => vi.fn());
const editReply = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => vi.fn());
const watch = vi.hoisted(() => vi.fn());
const gameFromUsername = vi.hoisted(() => vi.fn());
const liveMessage = vi.hoisted(() => vi.fn());

vi.mock("#lib/reply.js", () => ({ replyEphemeral: vi.fn() }));
vi.mock("../flows.js", () => ({ startListFlow: vi.fn() }));
vi.mock("../games/fetch.js", () => ({
  fetchChesscomGames: vi.fn(),
  fetchGameFromUrl: vi.fn(),
  fetchLichessGames: vi.fn(),
}));
vi.mock("../live/sources.js", () => ({
  gameFromUrl: vi.fn(),
  gameFromUsername,
}));
vi.mock("../live/store.service.js", () => ({
  default: { watch, get: vi.fn(), active: vi.fn(), setMoves: vi.fn() },
}));
vi.mock("../live/views.js", () => ({ liveMessage, liveNavId: vi.fn() }));
vi.mock("../live/watcher.service.js", () => ({
  default: { track, attach: vi.fn(), resume: vi.fn() },
}));
vi.mock("../services/session.service.js", () => ({ default: {} }));

const { default: chessCommand } = await import("./chess.command.js");

const snapshot = {
  source: "lichess",
  gameId: "I1hZ2msL",
  url: "https://lichess.org/game/I1hZ2msL",
  white: "Anonymous",
  black: "RedsTom",
  timeControl: "1800+0",
  moves: ["d2d4"],
  finished: false,
  result: "unknown",
};

function interaction() {
  return {
    options: {
      getSubcommandGroup: () => "watch",
      getSubcommand: () => "lichess",
      getString: (name: string) =>
        name === "username" ? "RedsTom" : undefined,
    },
    guildId: "guild",
    channelId: "channel",
    user: { id: "owner" },
    deferReply,
    editReply,
  };
}

const config = { t: (key: string) => key, locale: "fr" };

beforeEach(() => {
  vi.clearAllMocks();
  deferReply.mockResolvedValue(undefined);
  editReply.mockResolvedValue({ id: "public-message" });
  gameFromUsername.mockResolvedValue(snapshot);
  liveMessage.mockResolvedValue({
    components: [],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
  watch.mockImplementation(async (game) => ({ ...game, finished: false }));
});

describe("/chess watch response", () => {
  it("posts the board as the command's public reply", async () => {
    await chessCommand.execute(interaction() as never, config as never);

    expect(deferReply).toHaveBeenCalledTimes(1);
    expect(deferReply).toHaveBeenCalledWith();

    expect(editReply).toHaveBeenCalledTimes(1);
    const posted = editReply.mock.calls[0]?.[0] as {
      content?: string;
      flags: number;
    };
    expect(posted).not.toHaveProperty("content");
    expect(posted.flags).toBe(MessageFlags.IsComponentsV2);
    expect(posted.flags & MessageFlags.Ephemeral).toBeFalsy();

    expect(watch).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "public-message" })
    );
    expect(track).toHaveBeenCalledTimes(1);
  });
});
