import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_MENTIONS_REPLY } from "#lib/mentions.js";
import type { ChessSession } from "../types.js";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  replyEphemeral: vi.fn(),
}));

vi.mock("#lib/reply.js", () => ({ replyEphemeral: mocks.replyEphemeral }));
vi.mock("../services/session.service.js", () => ({
  default: { get: mocks.get },
}));

import { ownedSession } from "./common.js";

const t = ((key: string, options?: object) =>
  options ? `${key}:${JSON.stringify(options)}` : key) as never;
const interaction = { user: { id: "owner" } } as never;

function session(overrides: Partial<ChessSession> = {}): ChessSession {
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
    ...overrides,
  };
}

describe("ownedSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the session to its owner", async () => {
    const current = session();
    mocks.get.mockReturnValue(current);

    expect(await ownedSession(interaction, "session-id", t)).toBe(current);
    expect(mocks.replyEphemeral).not.toHaveBeenCalled();
  });

  it("answers that an unknown session expired", async () => {
    mocks.get.mockReturnValue(null);

    expect(await ownedSession(interaction, "session-id", t)).toBeNull();
    expect(mocks.replyEphemeral).toHaveBeenCalledWith(
      interaction,
      "error.expired"
    );
  });

  it("refuses another member without mentioning them", async () => {
    mocks.get.mockReturnValue(session({ ownerId: "someone-else" }));

    expect(await ownedSession(interaction, "session-id", t)).toBeNull();
    expect(mocks.replyEphemeral).toHaveBeenCalledWith(
      interaction,
      'error.notOwner:{"user":"<@someone-else>"}',
      NO_MENTIONS_REPLY
    );
  });
});
