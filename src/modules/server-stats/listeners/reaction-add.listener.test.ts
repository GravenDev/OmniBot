import { beforeEach, describe, expect, it, vi } from "vitest";

const collectReaction = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("#modules/server-stats/services/collector.js", () => ({
  collectReaction,
}));

const { default: listener } = await import("./reaction-add.listener.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reaction-add listener", () => {
  it("receives the config after the reaction details", async () => {
    const reaction = { tag: "reaction" };
    const user = { tag: "user" };
    const config = { tag: "config" };
    await listener.execute(
      reaction as never,
      user as never,
      { type: 0 } as never,
      config as never
    );
    expect(collectReaction).toHaveBeenCalledWith(reaction, user, config);
  });

  it("does nothing outside a configured guild", async () => {
    await listener.execute(
      {} as never,
      {} as never,
      { type: 0 } as never,
      undefined
    );
    expect(collectReaction).not.toHaveBeenCalled();
  });
});
