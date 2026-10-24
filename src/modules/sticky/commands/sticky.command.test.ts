import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("#modules/sticky/services/store.js", () => ({ default: store }));
vi.mock("#modules/sticky/services/poster.js", () => ({ default: {} }));

const { currentContent, preview } = await import("./sticky.command.js");

afterEach(() => {
  vi.useRealTimers();
});

describe("preview", () => {
  it("keeps a short message on one line", () => {
    expect(preview("Read\n\nthe   rules")).toBe("Read the rules");
  });

  it("cuts a long message with an ellipsis", () => {
    const shown = preview("x".repeat(200));
    expect(shown).toBe(`${"x".repeat(79)}…`);
  });

  it("escapes Markdown so a cut cannot leak into the next lines", () => {
    expect(preview("```js\nconsole.log(1)")).not.toContain("```");
    expect(preview(`**${"x".repeat(200)}**`).startsWith("\\*\\*")).toBe(true);
  });
});

describe("currentContent", () => {
  it("returns the current content", async () => {
    store.get.mockResolvedValue({ content: "hello" });
    expect(await currentContent("g1", "c1")).toBe("hello");
  });

  it("returns null without a sticky or when the lookup fails", async () => {
    store.get.mockResolvedValueOnce(null);
    expect(await currentContent("g1", "c1")).toBeNull();
    store.get.mockRejectedValueOnce(new Error("database"));
    expect(await currentContent("g1", "c1")).toBeNull();
  });

  it("gives up on a slow lookup so the modal opens in time", async () => {
    vi.useFakeTimers();
    store.get.mockReturnValue(new Promise(() => {}));
    const result = currentContent("g1", "c1");
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toBeNull();
  });
});
