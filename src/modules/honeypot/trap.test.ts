import type { GuildTextBasedChannel } from "discord.js";
import { describe, expect, it } from "vitest";
import { MAX_BAN_PURGE_SECONDS } from "#lib/moderation.js";
import { makeTestConfig } from "#lib/testing.js";
import { honeypotConfigSchema } from "./honeypot.config.js";
import { isTrap, purgeSecondsOf, trapNameOf } from "./trap.js";

function config(values: Record<string, unknown> = {}) {
  return makeTestConfig("honeypot", honeypotConfigSchema, values as never);
}

describe("purgeSecondsOf", () => {
  it("caps the window at Discord's 7 days", () => {
    expect(purgeSecondsOf(config({ purgeWindow: 30 * 24 * 60 * 60 }))).toBe(
      MAX_BAN_PURGE_SECONDS
    );
  });

  it("keeps a shorter window", () => {
    expect(purgeSecondsOf(config({ purgeWindow: 120 }))).toBe(120);
  });
});

function fakeChannel(
  options: { id?: string; parentId?: string | null; parentName?: string } = {}
) {
  const thread = options.parentId !== undefined;
  return {
    id: options.id ?? "c1",
    name: "spam-here",
    parentId: options.parentId ?? null,
    parent:
      options.parentName === undefined ? null : { name: options.parentName },
    isThread: () => thread,
  } as unknown as GuildTextBasedChannel;
}

describe("isTrap", () => {
  const traps = new Set(["trap"]);

  it("catches a trap channel and the threads under it", () => {
    expect(isTrap(fakeChannel({ id: "trap" }), traps)).toBe(true);
    expect(isTrap(fakeChannel({ parentId: "trap" }), traps)).toBe(true);
  });

  it("leaves other channels and their threads alone", () => {
    expect(isTrap(fakeChannel(), traps)).toBe(false);
    expect(isTrap(fakeChannel({ parentId: "other" }), traps)).toBe(false);
    expect(isTrap(fakeChannel({ parentId: null }), traps)).toBe(false);
  });
});

describe("trapNameOf", () => {
  it("names a thread after its trap channel, or itself when the parent is unknown", () => {
    expect(trapNameOf(fakeChannel())).toBe("spam-here");
    expect(
      trapNameOf(fakeChannel({ parentId: "trap", parentName: "trap" }))
    ).toBe("trap");
    expect(trapNameOf(fakeChannel({ parentId: "trap" }))).toBe("spam-here");
  });
});
