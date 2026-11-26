import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureRatingEmojis: vi.fn(async () => true),
  attach: vi.fn(),
  register: vi.fn(),
  forget: vi.fn(),
  removeMember: vi.fn(async () => ["a"]),
  removeGuild: vi.fn(async () => ["a", "b"]),
  registerHandlers: vi.fn(() => ({})),
  tasks: vi.fn(() => [{ id: "sweep" }, { id: "resume" }]),
}));

vi.mock("./commands/chess.command.js", () => ({
  default: mocks.registerHandlers("command"),
}));
vi.mock("./services/rating-emojis.service.js", () => ({
  default: { ensure: mocks.ensureRatingEmojis },
}));
vi.mock("./interactions/action.button.js", () => ({
  default: mocks.registerHandlers("action"),
}));
vi.mock("./interactions/list.button.js", () => ({
  default: mocks.registerHandlers("list"),
}));
vi.mock("./interactions/nav.button.js", () => ({
  default: mocks.registerHandlers("nav"),
}));
vi.mock("./interactions/pgn.modal.js", () => ({
  default: mocks.registerHandlers("modal"),
}));
vi.mock("./interactions/pick.button.js", () => ({
  default: mocks.registerHandlers("pick"),
}));
vi.mock("./live/live.button.js", () => ({
  default: mocks.registerHandlers("live"),
}));
vi.mock("./live/watch.button.js", () => ({
  default: mocks.registerHandlers("watch"),
}));
vi.mock("./listeners/channel-delete.listener.js", () => ({
  default: mocks.registerHandlers("channel-delete"),
}));
vi.mock("./live/stop.button.js", () => ({
  default: mocks.registerHandlers("stop"),
}));
vi.mock("./services/watcher.service.js", () => ({
  default: { attach: mocks.attach, forget: mocks.forget },
}));
vi.mock("./services/live-store.service.js", () => ({
  default: {
    removeMember: mocks.removeMember,
    removeGuild: mocks.removeGuild,
  },
}));
vi.mock("./tasks.js", () => ({
  chessTasks: mocks.tasks,
}));

import chessModule from "./chess.module.js";

describe("chess module", () => {
  beforeEach(() => vi.clearAllMocks());

  it("describes the module for the core", () => {
    expect(chessModule).toMatchObject({
      id: "chess",
      name: "Chess",
      version: "1.0.0",
    });
    expect(chessModule.description).toMatch(/Lichess/);
  });

  it("loads the emojis, watcher and every declaration", async () => {
    const client = {} as never;
    const registry = { register: mocks.register } as never;

    await chessModule.onLoad?.(client, registry);

    expect(mocks.ensureRatingEmojis).toHaveBeenCalledWith(client);
    expect(mocks.attach).toHaveBeenCalledWith(client, chessModule);
    expect(mocks.register).toHaveBeenCalledTimes(12);
    // Sweeping in-memory sessions and resuming watches are not purges of
    // stored data: they run only where the module loaded.
    expect(mocks.register).toHaveBeenCalledWith({ id: "resume" });
    expect(chessModule.maintenanceTasks).toBeUndefined();
  });

  it("forgets a member's watches on /privacy delete", async () => {
    await chessModule.deleteMemberData?.("guild", "owner");
    expect(mocks.removeMember).toHaveBeenCalledWith("guild", "owner");
    expect(mocks.forget.mock.calls).toEqual([["a"]]);
  });

  it("forgets the guild's watches when the module is disabled", async () => {
    await chessModule.onUninstall?.({} as never, { id: "guild" } as never);
    expect(mocks.removeGuild).toHaveBeenCalledWith("guild");
    expect(mocks.forget.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("still loads without its emojis, so /privacy delete keeps reaching it", async () => {
    mocks.ensureRatingEmojis.mockResolvedValueOnce(false);
    const registry = { register: mocks.register } as never;

    await expect(
      chessModule.onLoad?.({} as never, registry)
    ).resolves.toBeUndefined();
    expect(mocks.register).toHaveBeenCalledTimes(12);
  });
});
