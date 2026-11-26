import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChessSession } from "../types.js";

const mocks = vi.hoisted(() => ({
  ownedSession: vi.fn(),
  update: vi.fn(),
  listMessage: vi.fn(() => ({ marker: "list" })),
  replyEphemeral: vi.fn(),
  respondToButton: vi.fn(),
}));

vi.mock("#lib/reply.js", () => ({ replyEphemeral: mocks.replyEphemeral }));
vi.mock("../services/session.service.js", () => ({
  default: { update: mocks.update },
}));
vi.mock("../views.js", () => ({ listMessage: mocks.listMessage }));
vi.mock("./common.js", () => ({ ownedSession: mocks.ownedSession }));
vi.mock("./response.js", () => ({ respondToButton: mocks.respondToButton }));

import list from "./list.button.js";

const config = { t: ((key: string) => key) as never, locale: "en" } as never;
const interaction = {} as never;

function session(): ChessSession {
  return {
    id: "session-id",
    ownerId: "owner",
    mode: "view",
    view: "board",
    side: "white",
    games: [],
    page: 1,
    ply: 0,
    flipped: false,
    expiresAt: Date.now() + 60_000,
  };
}

describe("chess list button", () => {
  beforeEach(() => vi.clearAllMocks());

  it("edits the same message with the requested page", async () => {
    mocks.ownedSession.mockResolvedValue(session());

    await list.execute(interaction, ["session-id", "3"], config);

    expect(mocks.update).toHaveBeenCalledWith("session-id", { page: 3 });
    expect(mocks.listMessage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
      config.t,
      "en",
      3
    );
    expect(mocks.respondToButton).toHaveBeenCalledWith(
      interaction,
      { marker: "list" },
      true
    );
  });

  it("rejects a page that is not a positive integer", async () => {
    mocks.ownedSession.mockResolvedValue(session());

    await list.execute(interaction, ["session-id", "0"], config);
    await list.execute(interaction, ["session-id", "abc"], config);

    expect(mocks.replyEphemeral).toHaveBeenCalledTimes(2);
    expect(mocks.replyEphemeral).toHaveBeenCalledWith(
      interaction,
      "error.invalid"
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does nothing when the session expired", async () => {
    mocks.ownedSession.mockResolvedValue(null);

    await list.execute(interaction, ["session-id", "2"], config);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.respondToButton).not.toHaveBeenCalled();
  });
});
