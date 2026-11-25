import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadRatingEmojis: vi.fn(async () => new Map()),
  setRatingEmojis: vi.fn(),
  attach: vi.fn(),
  register: vi.fn(),
  registerHandlers: vi.fn(() => ({})),
  maintenanceTasks: vi.fn(() => []),
}));

vi.mock("./commands/chess.command.js", () => ({
  default: mocks.registerHandlers("command"),
}));
vi.mock("./emojis.js", () => ({
  loadRatingEmojis: mocks.loadRatingEmojis,
  setRatingEmojis: mocks.setRatingEmojis,
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
vi.mock("./live/watcher.service.js", () => ({
  default: { attach: mocks.attach },
}));
vi.mock("./tasks.js", () => ({
  chessMaintenanceTasks: mocks.maintenanceTasks,
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

    expect(mocks.loadRatingEmojis).toHaveBeenCalledWith(client);
    expect(mocks.setRatingEmojis).toHaveBeenCalled();
    expect(mocks.attach).toHaveBeenCalledWith(client, chessModule);
    expect(mocks.register).toHaveBeenCalledTimes(8);
    expect(chessModule.maintenanceTasks).toBe(mocks.maintenanceTasks);
  });
});
