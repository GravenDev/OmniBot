import type { NonThreadGuildBasedChannel } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ remove: vi.fn() }));

const logger = vi.hoisted(() => ({ info: vi.fn(), name: "" }));

vi.mock("#modules/autoreact/services/store.service.js", () => ({
  default: store,
}));
vi.mock("#lib/logger.js", () => ({
  loggerMaker: (name: string) => {
    logger.name = name;
    return logger;
  },
}));

const { default: listener } = await import("./channel-delete.listener.js");

function fakeChannel(dm = false) {
  return {
    id: "c1",
    guildId: "g1",
    isDMBased: () => dm,
  } as unknown as NonThreadGuildBasedChannel;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("autoreact channelDelete listener", () => {
  it("removes the deleted channel's reaction", async () => {
    await listener.execute(fakeChannel(), {} as never);
    expect(store.remove).toHaveBeenCalledWith("g1", "c1");
  });

  it("ignores DM channels", async () => {
    await listener.execute(fakeChannel(true), {} as never);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("does nothing when the module is not active", async () => {
    await listener.execute(fakeChannel(), undefined);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("logs the removal under the module's name", async () => {
    store.remove.mockResolvedValueOnce(1);
    await listener.execute(fakeChannel(), {} as never);
    expect(logger.name).toBe("autoreact");
    expect(logger.info).toHaveBeenCalledWith(
      "Auto-reaction removed | reason = channel deleted | guildId = g1 | channelId = c1"
    );
  });
});
