import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveGame } from "./types.js";

const mocks = vi.hoisted(() => ({
  replyEphemeral: vi.fn(),
  respondToButton: vi.fn(),
  editButtonMessage: vi.fn(),
  storeGet: vi.fn(),
  snapshotsCreate: vi.fn(),
  snapshotsGet: vi.fn(),
  liveMessage: vi.fn(),
}));

vi.mock("#lib/reply.js", () => ({
  replyEphemeral: mocks.replyEphemeral,
}));
vi.mock("../interactions/response.js", () => ({
  respondToButton: mocks.respondToButton,
  editButtonMessage: mocks.editButtonMessage,
}));
vi.mock("../services/live-store.service.js", () => ({
  default: { get: mocks.storeGet },
}));
vi.mock("../services/live-snapshots.service.js", () => ({
  default: { create: mocks.snapshotsCreate, get: mocks.snapshotsGet },
}));
vi.mock("./views.js", () => ({ liveMessage: mocks.liveMessage }));

import live from "./live.button.js";

const t = ((key: string) => key) as never;
const config = { t } as never;

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
  ply: 1,
  finished: false,
  result: "unknown",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.liveMessage.mockResolvedValue({ marker: "board" });
  mocks.respondToButton.mockResolvedValue(undefined);
  mocks.editButtonMessage.mockResolvedValue(undefined);
});

describe("live navigation buttons", () => {
  it("opens a snapshot instead of following the watched game", async () => {
    const snapshot = { ...game, id: "snapshot-id" };
    mocks.storeGet.mockResolvedValue(game);
    mocks.snapshotsCreate.mockReturnValue(snapshot);

    await live.execute({}, ["watch-id", "next", "m", "1"], config);

    expect(mocks.storeGet).toHaveBeenCalledWith("watch-id");
    expect(mocks.snapshotsCreate).toHaveBeenCalledWith(game);
    expect(mocks.liveMessage).toHaveBeenCalledWith(snapshot, t, 2, true);
    expect(mocks.respondToButton).toHaveBeenCalledWith(
      {},
      { marker: "board" },
      false
    );
  });

  it("browses that snapshot on later clicks without reading the database", async () => {
    const snapshot = { ...game, id: "snapshot-id" };
    mocks.snapshotsGet.mockReturnValue(snapshot);

    await live.execute({}, ["snapshot-id", "prev", "e", "2"], config);

    expect(mocks.storeGet).not.toHaveBeenCalled();
    expect(mocks.snapshotsGet).toHaveBeenCalledWith("snapshot-id");
    expect(mocks.liveMessage).toHaveBeenCalledWith(snapshot, t, 1, true);
    expect(mocks.editButtonMessage).toHaveBeenCalledWith(
      {},
      { marker: "board" }
    );
  });
});
