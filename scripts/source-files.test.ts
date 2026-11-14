import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { byCodePoint, readIfPresent } from "./source-files.js";

describe("byCodePoint", () => {
  it("orders by UTF-8 bytes like git, beyond the BMP too", () => {
    // U+FF01 sorts before an emoji in UTF-8, after it in UTF-16 units.
    expect(["\u{1F600}", "\uFF01"].sort(byCodePoint)).toEqual([
      "\uFF01",
      "\u{1F600}",
    ]);
  });

  it("orders like git, whatever the locale", () => {
    expect(["a_b", "Z", "a-b", "a"].sort(byCodePoint)).toEqual([
      "Z",
      "a",
      "a-b",
      "a_b",
    ]);
  });
});

describe("readIfPresent", () => {
  it("reads a file, and gives null for one gone meanwhile", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "source-files-"));
    try {
      fs.writeFileSync(path.join(dir, "a.ts"), "x");
      expect(readIfPresent(path.join(dir, "a.ts"))).toBe("x");
      expect(readIfPresent(path.join(dir, "gone.ts"))).toBeNull();
      // A directory replaced by a file meanwhile.
      expect(readIfPresent(path.join(dir, "a.ts", "b.ts"))).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
