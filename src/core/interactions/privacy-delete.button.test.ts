import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setMentionable: vi.fn(async () => {}),
  stats: vi.fn(async () => {}),
  game: vi.fn(async () => {}),
  skipped: vi.fn(async () => {}),
}));
vi.mock("#core/runtime.js", () => ({
  modules: [
    { id: "server-stats", deleteMemberData: mocks.stats },
    { id: "autoreact" },
    { id: "rngdle", deleteMemberData: mocks.game },
  ],
  unavailableModules: [
    { module: { id: "skipped", deleteMemberData: mocks.skipped } },
  ],
}));
vi.mock("#core/services/mention.service.js", () => ({
  default: { setMentionable: mocks.setMentionable },
}));

const { deleteMemberData } = await import("./privacy-delete.button.js");

describe("deleteMemberData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the member's data in every module of the guild", async () => {
    expect(await deleteMemberData("g1", "u1")).toBe(true);

    expect(mocks.setMentionable).toHaveBeenCalledWith("g1", "u1", true);
    expect(mocks.stats).toHaveBeenCalledWith("g1", "u1");
    expect(mocks.game).toHaveBeenCalledWith("g1", "u1");
    expect(mocks.skipped).toHaveBeenCalledWith("g1", "u1");
  });

  it("still runs the other deletions when one fails", async () => {
    mocks.stats.mockRejectedValueOnce(new Error("db down"));

    expect(await deleteMemberData("g1", "u1")).toBe(false);

    expect(mocks.game).toHaveBeenCalledWith("g1", "u1");
    expect(mocks.setMentionable).toHaveBeenCalled();
  });
});
