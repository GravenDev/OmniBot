import { beforeEach, describe, expect, it, vi } from "vitest";

const removeChannel = vi.hoisted(() => vi.fn());
const forget = vi.hoisted(() => vi.fn());

vi.mock("../services/live-store.service.js", () => ({
  default: { removeChannel },
}));
vi.mock("../services/watcher.service.js", () => ({ default: { forget } }));

const { default: listener } = await import("./channel-delete.listener.js");

beforeEach(() => vi.clearAllMocks());

describe("chess channel-delete listener", () => {
  it("drops the watches of a deleted channel and stops their timers", async () => {
    removeChannel.mockResolvedValue(["a", "b"]);
    await listener.execute(
      { isDMBased: () => false, guildId: "guild", id: "channel" } as never,
      {} as never
    );
    expect(removeChannel).toHaveBeenCalledWith("guild", "channel");
    expect(forget.mock.calls).toEqual([["a"], ["b"]]);
  });
});
