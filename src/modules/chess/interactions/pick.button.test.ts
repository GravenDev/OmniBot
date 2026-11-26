import { beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";
import type { ChessSession } from "../types.js";

silenceLogs();

const mocks = vi.hoisted(() => ({
  ownedSession: vi.fn(),
  openGame: vi.fn(),
  runAnalysis: vi.fn(async () => undefined),
  analysingMessage: vi.fn(() => ({ marker: "analysing" })),
  chessView: vi.fn(async () => ({ marker: "board" })),
  errorMessage: vi.fn(() => ({ marker: "error" })),
  deferWithEphemeralStatus: vi.fn(async () => ({ statusId: "status-id" })),
  finishButtonStatus: vi.fn(async () => undefined),
  respondToButton: vi.fn(async () => undefined),
  updateEphemeralStatus: vi.fn(async () => undefined),
}));

vi.mock("../analysis/run.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../analysis/run.js")>()),
  runAnalysis: mocks.runAnalysis,
}));
vi.mock("../views.js", () => ({
  analysingMessage: mocks.analysingMessage,
  chessView: mocks.chessView,
  errorMessage: mocks.errorMessage,
}));
vi.mock("./common.js", () => ({
  ownedSession: mocks.ownedSession,
  openGame: mocks.openGame,
}));
vi.mock("./response.js", () => ({
  deferWithEphemeralStatus: mocks.deferWithEphemeralStatus,
  finishButtonStatus: mocks.finishButtonStatus,
  respondToButton: mocks.respondToButton,
  updateEphemeralStatus: mocks.updateEphemeralStatus,
}));

import pick from "./pick.button.js";

const config = { t: ((key: string) => key) as never } as never;
const followUp = vi.fn();
const reply = vi.fn();
const interaction = { followUp, reply } as never;

function session(overrides: Partial<ChessSession> = {}): ChessSession {
  return {
    id: "session-id",
    ownerId: "owner",
    mode: "analyse",
    view: "board",
    side: "white",
    games: [{ pgn: "1. e4 *" } as never],
    page: 1,
    ply: 0,
    flipped: false,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe("chess game pick button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openGame.mockImplementation((list: ChessSession) => ({
      ...list,
      id: "board-id",
      parsed: { steps: [] },
    }));
  });

  it("refuses a game that cannot be parsed", async () => {
    const current = session();
    mocks.ownedSession.mockResolvedValue(current);
    mocks.openGame.mockReturnValue(null);

    await pick.execute(interaction, ["session-id", "0"], config);

    expect(reply).toHaveBeenCalledWith({ marker: "error" });
    expect(mocks.runAnalysis).not.toHaveBeenCalled();
  });

  it("shows a view-mode game without analysing it", async () => {
    const current = session({ mode: "view" });
    mocks.ownedSession.mockResolvedValue(current);

    await pick.execute(interaction, ["session-id", "0"], config);

    expect(mocks.respondToButton).toHaveBeenCalledWith(interaction, {
      marker: "board",
    });
    expect(mocks.runAnalysis).not.toHaveBeenCalled();
  });

  it("reuses an existing analysis", async () => {
    const current = session({
      analysis: {
        accuracies: { white: 90, black: 80 },
        ratings: [],
        evaluations: [],
        counts: { white: [], black: [] },
      },
    });
    mocks.ownedSession.mockResolvedValue(current);

    await pick.execute(interaction, ["session-id", "0"], config);

    expect(mocks.respondToButton).toHaveBeenCalled();
    expect(mocks.runAnalysis).not.toHaveBeenCalled();
  });

  it("runs the analysis and finishes the status", async () => {
    const current = session();
    mocks.ownedSession.mockResolvedValue(current);

    await pick.execute(interaction, ["session-id", "1"], config);

    expect(mocks.openGame).toHaveBeenCalledWith(current, 1);
    expect(mocks.deferWithEphemeralStatus).toHaveBeenCalledWith(interaction, {
      marker: "analysing",
    });
    // The analysis runs on the board's own session, never on the list's.
    expect(mocks.runAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ id: "board-id" })
    );
    expect(mocks.finishButtonStatus).toHaveBeenCalledWith(
      { statusId: "status-id" },
      interaction,
      { marker: "board" }
    );
  });

  it("replaces the status with an error when analysis fails", async () => {
    mocks.ownedSession.mockResolvedValue(session());
    mocks.runAnalysis.mockRejectedValueOnce(new Error("boom"));

    await pick.execute(interaction, ["session-id", "0"], config);

    expect(mocks.updateEphemeralStatus).toHaveBeenCalledWith(
      interaction,
      { statusId: "status-id" },
      { marker: "error" }
    );
    expect(mocks.finishButtonStatus).not.toHaveBeenCalled();
  });

  it("posts a fresh result when the status edit fails", async () => {
    mocks.ownedSession.mockResolvedValue(session());
    mocks.finishButtonStatus.mockRejectedValueOnce(new Error("expired"));

    await pick.execute(interaction, ["session-id", "0"], config);

    expect(followUp).toHaveBeenCalledWith({ marker: "board" });
  });

  it("does nothing when the session expired", async () => {
    mocks.ownedSession.mockResolvedValue(null);

    await pick.execute(interaction, ["session-id", "0"], config);

    expect(mocks.openGame).not.toHaveBeenCalled();
  });

  it("tells a member whose other analysis still runs to wait", async () => {
    const { AnalysisBusyError } =
      await import("../services/engines.service.js");
    mocks.ownedSession.mockResolvedValue(session());
    mocks.runAnalysis.mockRejectedValueOnce(new AnalysisBusyError());

    await pick.execute(interaction, ["session-id", "0"], config);

    expect(mocks.errorMessage).toHaveBeenLastCalledWith(
      expect.anything(),
      "error.busy"
    );
  });
});
