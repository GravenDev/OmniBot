import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChessSession } from "../types.js";

const mocks = vi.hoisted(() => ({
  ownedSession: vi.fn(),
  update: vi.fn(),
  chessView: vi.fn(async (session: ChessSession) => ({
    marker: session.view,
    ply: session.ply,
    flipped: session.flipped,
  })),
  errorMessage: vi.fn(() => ({ marker: "error" })),
  replyEphemeral: vi.fn(),
  respondToButton: vi.fn(),
}));

vi.mock("#lib/reply.js", () => ({ replyEphemeral: mocks.replyEphemeral }));
vi.mock("../services/session.service.js", () => ({
  default: { update: mocks.update },
}));
vi.mock("../views.js", () => ({
  chessView: mocks.chessView,
  errorMessage: mocks.errorMessage,
}));
vi.mock("./common.js", () => ({ ownedSession: mocks.ownedSession }));
vi.mock("./response.js", () => ({ respondToButton: mocks.respondToButton }));

import nav from "./nav.button.js";

const config = { t: ((key: string) => key) as never } as never;
const reply = vi.fn();
const interaction = { reply } as never;

function session(overrides: Partial<ChessSession> = {}): ChessSession {
  return {
    id: "session-id",
    ownerId: "owner",
    mode: "view",
    view: "board",
    side: "white",
    games: [],
    parsed: {
      headers: new Map(),
      steps: Array.from({ length: 6 }, () => ({})),
      positions: [],
    } as never,
    page: 1,
    ply: 3,
    flipped: false,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe("chess navigation button", () => {
  let current: ChessSession;

  beforeEach(() => {
    vi.clearAllMocks();
    current = session();
    mocks.ownedSession.mockResolvedValue(current);
    mocks.update.mockImplementation(
      (_id: string, patch: Partial<ChessSession>) =>
        Object.assign(current, patch)
    );
  });

  it.each([
    ["first", { ply: 0 }],
    ["last", { ply: 6 }],
    ["prev", { ply: 2 }],
    ["next", { ply: 4 }],
    ["flip", { flipped: true }],
  ] as const)("applies the %s action", async (action, patch) => {
    await nav.execute(interaction, ["session-id", action], config);

    expect(mocks.update).toHaveBeenCalledWith("session-id", patch);
    expect(mocks.respondToButton).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining(patch),
      true
    );
  });

  it("clamps prev and next to the game bounds", async () => {
    current = session({ ply: 0 });
    mocks.ownedSession.mockResolvedValue(current);
    await nav.execute(interaction, ["session-id", "prev"], config);
    expect(mocks.update).toHaveBeenLastCalledWith("session-id", { ply: 0 });

    current = session({ ply: 6 });
    mocks.ownedSession.mockResolvedValue(current);
    await nav.execute(interaction, ["session-id", "next"], config);
    expect(mocks.update).toHaveBeenLastCalledWith("session-id", { ply: 6 });
  });

  it("rejects an unknown action", async () => {
    await nav.execute(interaction, ["session-id", "unknown"], config);

    expect(mocks.replyEphemeral).toHaveBeenCalledWith(
      interaction,
      "error.invalid"
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("asks for a PGN before navigating an unparsed session", async () => {
    current = session({ parsed: undefined });
    mocks.ownedSession.mockResolvedValue(current);

    await nav.execute(interaction, ["session-id", "next"], config);

    expect(reply).toHaveBeenCalledWith({ marker: "error" });
    expect(mocks.errorMessage).toHaveBeenCalledWith(config.t, "error.pgn");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does nothing when the session expired", async () => {
    mocks.ownedSession.mockResolvedValue(null);

    await nav.execute(interaction, ["session-id", "next"], config);

    expect(reply).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
