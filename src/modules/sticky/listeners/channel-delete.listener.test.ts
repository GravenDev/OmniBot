import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ remove: vi.fn() }));

const logger = vi.hoisted(() => ({ info: vi.fn(), name: "" }));

vi.mock("#modules/sticky/services/store.js", () => ({ default: store }));
vi.mock("#lib/logger.js", () => ({
  loggerMaker: (name: string) => {
    logger.name = name;
    return logger;
  },
}));

const { default: listener } = await import("./channel-delete.listener.js");

function fakeChannel(dm = false) {
  return { id: "c1", guildId: "g1", isDMBased: () => dm };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sticky channelDelete listener", () => {
  it("removes the sticky of a deleted channel", async () => {
    await listener.execute(fakeChannel() as never, {} as never);
    expect(store.remove).toHaveBeenCalledWith("g1", "c1");
  });

  it("ignores DM channels and missing config", async () => {
    await listener.execute(fakeChannel(true) as never, {} as never);
    await listener.execute(fakeChannel() as never, undefined);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("logs the removal under the module's name", async () => {
    store.remove.mockResolvedValueOnce(1);
    await listener.execute(fakeChannel(), {} as never);
    expect(logger.name).toBe("sticky");
    expect(logger.info).toHaveBeenCalledWith(
      "Sticky removed | reason = channel deleted | guildId = g1 | channelId = c1"
    );
  });
});
