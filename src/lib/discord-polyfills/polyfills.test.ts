import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = path.dirname(fileURLToPath(import.meta.url));

describe("discord polyfills", () => {
  // The lint rule lets this directory, subdirectories included, call Discord's
  // REST API on the promise that each polyfill has a test failing once
  // discord.js ships the feature. One test over every file, so the check
  // still runs once the last polyfill is deleted.
  it("each have a test that fails once discord.js ships them", () => {
    const missing = fs
      .readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .filter((file) => {
        const test = path.join(dir, file.replace(/\.ts$/, ".test.ts"));
        return (
          !fs.existsSync(test) ||
          !fs.readFileSync(test, "utf8").includes("is still needed")
        );
      });
    expect(missing).toEqual([]);
  });
});
