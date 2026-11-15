import { describe, expect, it } from "vitest";
import { canPost, ineligibility } from "./eligibility.js";

describe("ineligibility", () => {
  const message = (overrides: Record<string, any> = {}) =>
    ({
      author: { id: "author", bot: false },
      system: false,
      channelId: "c1",
      channel: { isThread: () => false },
      ...overrides,
    }) as any;

  it("accepts a regular message from someone else", () => {
    expect(ineligibility(message(), "reporter", "alerts")).toBeNull();
  });

  it("rejects bots, system messages and your own messages", () => {
    expect(
      ineligibility(message({ author: { id: "a", bot: true } }), "r", "alerts")
    ).toBe("bot");
    expect(ineligibility(message({ system: true }), "r", "alerts")).toBe("bot");
    expect(ineligibility(message(), "author", "alerts")).toBe("self");
  });

  it("rejects the alert channel and its threads", () => {
    expect(ineligibility(message({ channelId: "alerts" }), "r", "alerts")).toBe(
      "alertChannel"
    );
    expect(
      ineligibility(
        message({
          channelId: "thread",
          channel: { isThread: () => true, parentId: "alerts" },
        }),
        "r",
        "alerts"
      )
    ).toBe("alertChannel");
  });
});

describe("canPost", () => {
  const channel = ({
    sendable = true,
    dm = false,
    me = {} as object | null,
    allowed = true,
  } = {}) =>
    ({
      isSendable: () => sendable,
      isDMBased: () => dm,
      guild: { members: { me } },
      permissionsFor: () => ({ has: () => allowed }),
    }) as any;

  it("accepts a guild channel the bot may see and write in", () => {
    expect(canPost(channel())).toBe(true);
  });

  it("trusts the channel while the bot's member is not cached", () => {
    expect(canPost(channel({ me: null, allowed: false }))).toBe(true);
  });

  it("refuses no channel, a DM, a channel it cannot send to, or one it may not write in", () => {
    expect(canPost(null)).toBe(false);
    expect(canPost(channel({ dm: true }))).toBe(false);
    expect(canPost(channel({ sendable: false }))).toBe(false);
    expect(canPost(channel({ allowed: false }))).toBe(false);
  });
});
