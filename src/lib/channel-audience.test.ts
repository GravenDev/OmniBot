import type { GuildBasedChannel } from "discord.js";
import { describe, expect, it } from "vitest";
import { excludedIdsOf, isExcluded } from "./channel-audience.js";

function channel(options: {
  id?: string;
  parentId?: string | null;
  thread?: boolean;
  grandParentId?: string | null;
}): GuildBasedChannel {
  return {
    id: options.id ?? "200",
    parentId: options.parentId ?? null,
    parent: { parentId: options.grandParentId ?? null },
    isThread: () => options.thread ?? false,
  } as unknown as GuildBasedChannel;
}

describe("isExcluded", () => {
  const excluded = new Set(["10"]);

  it("matches the channel itself and its category", () => {
    expect(isExcluded(channel({ id: "10" }), excluded)).toBe(true);
    expect(isExcluded(channel({ parentId: "10" }), excluded)).toBe(true);
    expect(isExcluded(channel({ parentId: "11" }), excluded)).toBe(false);
  });

  it("matches a thread through its parent channel and category", () => {
    expect(
      isExcluded(channel({ thread: true, parentId: "10" }), excluded)
    ).toBe(true);
    expect(
      isExcluded(
        channel({ thread: true, parentId: "12", grandParentId: "10" }),
        excluded
      )
    ).toBe(true);
  });

  it("ignores the category of a parent for a channel that is not a thread", () => {
    expect(
      isExcluded(channel({ parentId: "12", grandParentId: "10" }), excluded)
    ).toBe(false);
  });
});

describe("excludedIdsOf", () => {
  it("joins the ids of every list and skips the unset ones", () => {
    expect(
      excludedIdsOf([{ id: "1" }, { id: "2" }], undefined, null, [{ id: "3" }])
    ).toEqual(new Set(["1", "2", "3"]));
  });
});
