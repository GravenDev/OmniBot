import type { NonThreadGuildBasedChannel } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeOnChannelDelete } from "./listener.js";

const info = vi.hoisted(() => vi.fn());
vi.mock("./logger.js", () => ({ loggerMaker: () => ({ info }) }));

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

describe("removeOnChannelDelete", () => {
  it("removes the deleted channel's records and logs them", async () => {
    const remove = vi.fn(async () => 1);
    const listener = removeOnChannelDelete("sticky", "Sticky", remove);

    expect(listener.eventType).toBe("channelDelete");
    await listener.execute(fakeChannel(), {} as never);

    expect(remove).toHaveBeenCalledWith("g1", "c1");
    expect(info).toHaveBeenCalledWith(
      "Sticky removed | reason = channel deleted | guildId = g1 | channelId = c1"
    );
  });

  it("logs nothing when the channel had no record", async () => {
    const listener = removeOnChannelDelete("sticky", "Sticky", async () => 0);
    await listener.execute(fakeChannel(), {} as never);
    expect(info).not.toHaveBeenCalled();
  });

  it("ignores DM channels and inactive modules", async () => {
    const remove = vi.fn(async () => 1);
    const listener = removeOnChannelDelete("sticky", "Sticky", remove);
    await listener.execute(fakeChannel(true), {} as never);
    await listener.execute(fakeChannel(), undefined);
    expect(remove).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});
