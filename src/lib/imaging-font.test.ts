import { afterEach, describe, expect, it, vi } from "vitest";

// `font()` looks for an emoji font once per process, so each case reloads the
// module with its own view of the file system.
const { existsSync, registerFromPath } = vi.hoisted(() => ({
  existsSync: vi.fn(),
  registerFromPath: vi.fn(),
}));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  existsSync,
}));
vi.mock("@napi-rs/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@napi-rs/canvas")>();
  return {
    ...actual,
    GlobalFonts: { ...actual.GlobalFonts, registerFromPath },
  };
});

async function loadFont() {
  vi.resetModules();
  return (await import("./imaging.js")).font;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("font", () => {
  it("falls back to the system emoji font, so that names with emojis render", async () => {
    existsSync.mockImplementation(
      (path: string) => path === "/usr/share/fonts/noto/NotoColorEmoji.ttf"
    );
    const font = await loadFont();

    expect(font(20)).toBe("20px Outfit, Emoji");
    expect(font(20, "SpaceMonoBold")).toBe("20px SpaceMonoBold, Emoji");
    expect(registerFromPath).toHaveBeenCalledWith(
      "/usr/share/fonts/noto/NotoColorEmoji.ttf",
      "Emoji"
    );
  });

  it("keeps the font alone when the system has no emoji font", async () => {
    existsSync.mockReturnValue(false);
    const font = await loadFont();

    expect(font(20)).toBe("20px Outfit");
    expect(registerFromPath).not.toHaveBeenCalled();
  });

  it("looks for the emoji font only once", async () => {
    existsSync.mockReturnValue(false);
    const font = await loadFont();

    font(20);
    const calls = existsSync.mock.calls.length;
    font(30);

    expect(existsSync).toHaveBeenCalledTimes(calls);
  });
});
