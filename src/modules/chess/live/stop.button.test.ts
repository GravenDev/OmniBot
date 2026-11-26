import { PermissionFlagsBits } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveGame } from "./types.js";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  unwatch: vi.fn(),
  forget: vi.fn(),
  liveMessage: vi.fn(async () => ({ marker: "stopped" })),
  replyEphemeral: vi.fn(),
}));

vi.mock("../services/live-store.service.js", () => ({
  default: { get: mocks.get, unwatch: mocks.unwatch },
}));
vi.mock("../services/watcher.service.js", () => ({
  default: { forget: mocks.forget },
}));
vi.mock("./views.js", () => ({ liveMessage: mocks.liveMessage }));
vi.mock("../views.js", () => ({ editable: (message: unknown) => message }));
vi.mock("#lib/reply.js", () => ({ replyEphemeral: mocks.replyEphemeral }));

const { default: stopButton } = await import("./stop.button.js");

const t = ((key: string) => key) as never;
const config = { t } as never;
const game = { id: "watch-id", ownerId: "owner", ply: 4 } as LiveGame;

function click(userId: string, canManage = false) {
  return {
    user: { id: userId },
    memberPermissions: {
      has: (flag: bigint) =>
        canManage && flag === PermissionFlagsBits.ManageMessages,
    },
    deferUpdate: vi.fn(async () => undefined),
    editReply: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(game);
});

describe("stop watch button", () => {
  it("lets the member who started the watch stop it", async () => {
    const event = click("owner");
    await stopButton.execute(event as never, ["watch-id"], config);

    expect(mocks.unwatch).toHaveBeenCalledWith("watch-id");
    expect(mocks.forget).toHaveBeenCalledWith("watch-id");
    expect(mocks.liveMessage).toHaveBeenCalledWith(game, t, 4, false, true);
    // Acknowledged before the board is redrawn: Discord waits 3 s at most.
    expect(event.deferUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.liveMessage.mock.invocationCallOrder[0]!
    );
    expect(event.editReply).toHaveBeenCalledWith({ marker: "stopped" });
  });

  it("lets a moderator who manages messages stop it", async () => {
    const event = click("moderator", true);
    await stopButton.execute(event as never, ["watch-id"], config);
    expect(mocks.unwatch).toHaveBeenCalledWith("watch-id");
  });

  it("refuses any other member", async () => {
    const event = click("someone");
    await stopButton.execute(event as never, ["watch-id"], config);

    expect(mocks.replyEphemeral).toHaveBeenCalledWith(
      event,
      "live.stopNotAllowed"
    );
    expect(mocks.unwatch).not.toHaveBeenCalled();
  });

  it("answers when the watch is already over", async () => {
    mocks.get.mockResolvedValue(null);
    const event = click("owner");
    await stopButton.execute(event as never, ["watch-id"], config);

    expect(mocks.replyEphemeral).toHaveBeenCalledWith(event, "error.expired");
  });
});
