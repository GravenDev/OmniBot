import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ remove: vi.fn() }));

vi.mock("#modules/sticky/services/store.js", () => ({ default: store }));

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
});
