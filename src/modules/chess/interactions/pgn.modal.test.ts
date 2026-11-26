import { beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";

silenceLogs();

const flow = {
  complete: vi.fn(async () => undefined),
  fail: vi.fn(async () => undefined),
};

const mocks = vi.hoisted(() => ({
  replyEphemeral: vi.fn(),
  runAnalysis: vi.fn(async () => undefined),
  gameSummary: vi.fn(() => ({ id: "pgn-game", pgn: "1. e4 *" })),
  create: vi.fn(() => ({
    id: "session-id",
    view: "board",
    analysis: undefined,
  })),
  selectGame: vi.fn(() => ({ steps: [] })),
  startDirectFlow: vi.fn(async () => ({
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  })),
  preparingMessage: vi.fn(() => ({ marker: "preparing" })),
  analysingMessage: vi.fn(() => ({ marker: "analysing" })),
  chessView: vi.fn(async () => ({ marker: "board" })),
  errorMessage: vi.fn(() => ({ marker: "error" })),
}));

vi.mock("#lib/reply.js", () => ({ replyEphemeral: mocks.replyEphemeral }));
vi.mock("../analysis/run.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../analysis/run.js")>()),
  runAnalysis: mocks.runAnalysis,
}));
vi.mock("../commands/chess.command.js", () => ({
  PGN_FIELD_IDS: ["chess-pgn-0", "chess-pgn-1"],
}));
vi.mock("../games/fetch.js", () => ({
  gameSummaryFromPgn: mocks.gameSummary,
}));
vi.mock("../services/session.service.js", () => ({
  default: { create: mocks.create },
}));
vi.mock("../views.js", () => ({
  analysingMessage: mocks.analysingMessage,
  chessView: mocks.chessView,
  errorMessage: mocks.errorMessage,
  preparingMessage: mocks.preparingMessage,
}));
vi.mock("./common.js", () => ({ selectGame: mocks.selectGame }));
vi.mock("./response.js", () => ({ startDirectFlow: mocks.startDirectFlow }));

import modal from "./pgn.modal.js";

const config = { t: ((key: string) => key) as never } as never;
const getTextInputValue = vi.fn(() => "1. e4 *");
const interaction = {
  fields: { getTextInputValue },
  user: { id: "owner" },
} as never;

describe("chess PGN modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gameSummary.mockReturnValue({ id: "pgn-game", pgn: "1. e4 *" });
    mocks.runAnalysis.mockResolvedValue(undefined);
    mocks.startDirectFlow.mockResolvedValue(flow);
    mocks.selectGame.mockReturnValue({ steps: [] });
    mocks.create.mockReturnValue({
      id: "session-id",
      view: "board",
      analysis: undefined,
    } as never);
  });

  it("rejects an unknown mode before reading the PGN", async () => {
    await modal.execute(interaction, ["unknown", "white"], config);

    expect(mocks.replyEphemeral).toHaveBeenCalledWith(
      interaction,
      "error.invalid"
    );
    expect(getTextInputValue).not.toHaveBeenCalled();
  });

  it("refuses a PGN that cannot be read", async () => {
    mocks.gameSummary.mockReturnValue(null);

    await modal.execute(interaction, ["view", "white"], config);

    expect(mocks.replyEphemeral).toHaveBeenCalledWith(interaction, "error.pgn");
    expect(mocks.startDirectFlow).not.toHaveBeenCalled();
  });

  it("shows a pasted game without analysing it", async () => {
    await modal.execute(interaction, ["view", "white"], config);

    expect(mocks.preparingMessage).toHaveBeenCalled();
    expect(mocks.runAnalysis).not.toHaveBeenCalled();
    expect(flow.complete).toHaveBeenCalledWith({ marker: "board" });
  });

  it("analyses a game for the report and finishes the flow", async () => {
    await modal.execute(interaction, ["report", "black"], config);

    expect(mocks.analysingMessage).toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith("owner", "report", "black", [
      expect.objectContaining({ id: "pgn-game" }),
    ]);
    expect(mocks.runAnalysis).toHaveBeenCalled();
    expect(flow.complete).toHaveBeenCalledWith({ marker: "board" });
  });

  it("falls back to White for an unknown side", async () => {
    await modal.execute(interaction, ["analyse", "red"], config);

    expect(mocks.create).toHaveBeenCalledWith(
      "owner",
      "analyse",
      "white",
      expect.any(Array)
    );
  });

  it("fails the flow when the selected game cannot be parsed", async () => {
    mocks.selectGame.mockReturnValue(null);

    await modal.execute(interaction, ["analyse", "white"], config);

    expect(flow.fail).toHaveBeenCalledWith({ marker: "error" });
    expect(mocks.runAnalysis).not.toHaveBeenCalled();
  });

  it("fails the flow when analysis throws", async () => {
    mocks.runAnalysis.mockRejectedValueOnce(new Error("boom"));

    await modal.execute(interaction, ["analyse", "white"], config);

    expect(flow.fail).toHaveBeenCalledWith({ marker: "error" });
    expect(flow.complete).not.toHaveBeenCalled();
  });

  it("fails the flow when the session cannot be created", async () => {
    mocks.create.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    await modal.execute(interaction, ["analyse", "white"], config);

    expect(flow.fail).toHaveBeenCalledWith({ marker: "error" });
  });
});
