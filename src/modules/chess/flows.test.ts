import { describe, expect, it, vi } from "vitest";
import type { ChessSession } from "./types.js";

const mocks = vi.hoisted(() => ({
  editReply: vi.fn(async () => undefined),
  listMessage: vi.fn(() => ({ marker: "list" })),
  editable: vi.fn((message: object) => ({ ...message, edited: true })),
}));

vi.mock("./views.js", () => ({
  editable: mocks.editable,
  listMessage: mocks.listMessage,
}));

import { startListFlow } from "./flows.js";

describe("startListFlow", () => {
  it("edits the deferred answer with the session's first page", async () => {
    const session = {
      id: "session-id",
      ownerId: "owner",
      mode: "view",
      view: "board",
      side: "white",
      games: [],
      page: 2,
      ply: 0,
      flipped: false,
      expiresAt: Date.now() + 60_000,
    } as ChessSession;
    const t = ((key: string) => key) as never;
    const config = { t, locale: "fr" } as never;

    await startListFlow(
      { editReply: mocks.editReply } as never,
      session,
      config
    );

    expect(mocks.listMessage).toHaveBeenCalledWith(session, t, "fr");
    expect(mocks.editable).toHaveBeenCalledWith({ marker: "list" });
    expect(mocks.editReply).toHaveBeenCalledWith({
      marker: "list",
      edited: true,
    });
  });
});
