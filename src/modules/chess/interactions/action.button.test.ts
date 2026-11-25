import { beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";
import type { ChessSession } from "../types.js";

silenceLogs();

const mocks = vi.hoisted(() => {
  const edit = vi.fn(async () => undefined);
  return {
    update: vi.fn(),
    ownedSession: vi.fn(),
    respondToButton: vi.fn(),
    beginButtonEdit: vi.fn(async () => edit),
    edit,
    chessView: vi.fn(async (session: ChessSession) => ({
      marker: session.view,
    })),
    errorMessage: vi.fn(() => ({ marker: "error" })),
    withNotice: vi.fn((message: object, content: string) => ({
      ...message,
      notice: content,
    })),
    replyEphemeral: vi.fn(),
    runAnalysis: vi.fn(async () => undefined),
  };
});

vi.mock("#lib/reply.js", () => ({ replyEphemeral: mocks.replyEphemeral }));
vi.mock("../services/session.service.js", () => ({
  default: { update: mocks.update },
}));
vi.mock("../views.js", () => ({
  chessView: mocks.chessView,
  errorMessage: mocks.errorMessage,
  withNotice: mocks.withNotice,
}));
vi.mock("./common.js", () => ({ ownedSession: mocks.ownedSession }));
vi.mock("./response.js", () => ({
  beginButtonEdit: mocks.beginButtonEdit,
  respondToButton: mocks.respondToButton,
}));
vi.mock("../analysis/run.js", () => ({ runAnalysis: mocks.runAnalysis }));

import action from "./action.button.js";

const t = ((key: string) => key) as never;
const config = { t } as never;

function session(overrides: Partial<ChessSession> = {}): ChessSession {
  return {
    id: "session-id",
    ownerId: "owner",
    mode: "report",
    view: "report",
    side: "white",
    games: [],
    parsed: { headers: new Map(), steps: [], positions: [] } as never,
    page: 1,
    ply: 0,
    flipped: false,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

const analysis = {
  accuracies: { white: 90, black: 80 },
  ratings: [],
  evaluations: [],
  counts: { white: [], black: [] },
};

describe("chess action buttons", () => {
  let current: ChessSession;

  beforeEach(() => {
    vi.clearAllMocks();
    current = session();
    mocks.update.mockImplementation(
      (_id: string, patch: Partial<ChessSession>) =>
        Object.assign(current, patch)
    );
  });

  it("flips the report's side and edits the same message", async () => {
    current = session({ analysis, view: "report" });
    mocks.ownedSession.mockResolvedValue(current);

    await action.execute({} as never, ["session-id", "opponent"], config);

    expect(mocks.update).toHaveBeenCalledWith("session-id", {
      side: "black",
      view: "report",
    });
    expect(mocks.chessView).toHaveBeenCalledWith(current, t);
    expect(mocks.respondToButton).toHaveBeenCalledWith(
      {},
      { marker: "report" },
      true
    );
  });

  it("switches to the analyse tab by editing the same message", async () => {
    current = session({ analysis, view: "board" });
    mocks.ownedSession.mockResolvedValue(current);

    await action.execute({} as never, ["session-id", "analyse"], config);

    expect(mocks.update).toHaveBeenCalledWith("session-id", {
      view: "analyse",
    });
    expect(mocks.respondToButton).toHaveBeenCalledWith(
      {},
      { marker: "analyse" },
      true
    );
    expect(mocks.beginButtonEdit).not.toHaveBeenCalled();
  });

  it("switches back to the game tab", async () => {
    current = session({ analysis, view: "analyse" });
    mocks.ownedSession.mockResolvedValue(current);

    await action.execute({} as never, ["session-id", "board"], config);

    expect(mocks.update).toHaveBeenCalledWith("session-id", { view: "board" });
    expect(mocks.respondToButton).toHaveBeenCalledWith(
      {},
      { marker: "board" },
      true
    );
  });

  it("runs the analysis itself when the report is clicked first", async () => {
    current = session({ mode: "report", view: "board" });
    mocks.ownedSession.mockResolvedValue(current);

    await action.execute({} as never, ["session-id", "report"], config);

    expect(mocks.runAnalysis).toHaveBeenCalledWith(current);
    expect(mocks.beginButtonEdit).toHaveBeenCalledWith({});
    expect(mocks.replyEphemeral).not.toHaveBeenCalled();
    expect(mocks.edit.mock.calls.map(([message]) => message)).toEqual([
      { marker: "board", notice: "viewer.analysing" },
      { marker: "report" },
    ]);
  });

  it("shows the game with a notice before opening the analyse tab", async () => {
    current = session({ view: "board" });
    mocks.ownedSession.mockResolvedValue(current);

    await action.execute({} as never, ["session-id", "analyse"], config);

    expect(mocks.beginButtonEdit).toHaveBeenCalledWith({});
    expect(mocks.withNotice).toHaveBeenCalledWith(
      { marker: "board" },
      "viewer.analysing"
    );
    expect(mocks.runAnalysis).toHaveBeenCalledWith(current);
    expect(mocks.edit.mock.calls.map(([message]) => message)).toEqual([
      { marker: "board", notice: "viewer.analysing" },
      { marker: "analyse" },
    ]);
    expect(mocks.respondToButton).not.toHaveBeenCalled();
  });

  it("edits the same message with an error when analysis fails", async () => {
    current = session({ view: "board" });
    mocks.ownedSession.mockResolvedValue(current);
    mocks.runAnalysis.mockRejectedValueOnce(new Error("boom"));

    await action.execute({} as never, ["session-id", "analyse"], config);

    expect(mocks.withNotice).toHaveBeenLastCalledWith(
      { marker: "board" },
      "error.analysis"
    );
    expect(mocks.edit).toHaveBeenLastCalledWith({
      marker: "board",
      notice: "error.analysis",
    });
    expect(mocks.respondToButton).not.toHaveBeenCalled();
  });

  it("refuses the switch before an analysis exists", async () => {
    current = session({ mode: "view", view: "board" });
    mocks.ownedSession.mockResolvedValue(current);

    await action.execute({} as never, ["session-id", "opponent"], config);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.chessView).not.toHaveBeenCalled();
    expect(mocks.replyEphemeral).toHaveBeenCalledWith({}, "error.invalid");
  });
});
