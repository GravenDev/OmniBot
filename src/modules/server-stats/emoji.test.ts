import { describe, expect, it } from "vitest";
import { customEmojiId, emojiKey } from "./emoji.js";

describe("emojiKey", () => {
  it("keeps a Unicode emoji as it is", () => {
    expect(emojiKey({ id: null, name: "👍" })).toBe("👍");
  });

  it("keys a custom emoji by its id, animated or not", () => {
    expect(emojiKey({ id: "456", name: "party" })).toBe("<:e:456>");
    expect(emojiKey({ id: "456", name: "party", animated: true })).toBe(
      "<a:e:456>"
    );
  });

  it("has no key for an emoji without id nor name", () => {
    expect(emojiKey({ id: null, name: null })).toBeNull();
  });
});

describe("customEmojiId", () => {
  it("reads back the id of a custom emoji key", () => {
    expect(customEmojiId(emojiKey({ id: "456", name: "x" })!)).toBe("456");
    expect(
      customEmojiId(emojiKey({ id: "456", name: "x", animated: true })!)
    ).toBe("456");
  });

  it("finds none in a Unicode emoji", () => {
    expect(customEmojiId("👍")).toBeNull();
  });
});
