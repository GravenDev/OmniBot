import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// AGENTS.md lists every file of src/lib, so that an agent finds a helper
// before writing a copy of it. A new file must be added to that table, and a
// removed or renamed one taken out of it.
const lib = path.dirname(fileURLToPath(import.meta.url));
const agents = fs.readFileSync(path.join(lib, "..", "..", "AGENTS.md"), "utf8");

// What src/lib holds, minus what is not code to reuse: tests, previews,
// images and fonts, folders tools generate (`__snapshots__`).
const entries = fs
  .readdirSync(lib, { withFileTypes: true })
  .filter((e) =>
    e.isDirectory()
      ? e.name !== "assets" && !e.name.startsWith("__")
      : e.name.endsWith(".ts") && !/\.(test|preview)\.ts$/.test(e.name)
  )
  .map((e) =>
    e.isDirectory()
      ? `#lib/${e.name}/`
      : `#lib/${e.name.replace(/\.ts$/, ".js")}`
  )
  .sort();

/** The `#lib/…` rows of the "Shared helpers" section of AGENTS.md. */
function listedHelpers(markdown: string): string[] {
  const section = /^## Shared helpers\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(
    markdown
  );
  return [...(section?.[1] ?? "").matchAll(/^\| `(#lib\/[^`]+)`/gm)]
    .map((m) => m[1]!)
    .sort();
}

describe("AGENTS.md shared helpers table", () => {
  it("lists exactly the files of src/lib", () => {
    expect(listedHelpers(agents)).toEqual(entries);
  });

  it("reads the rows of its own section only", () => {
    const markdown = [
      "## Commands",
      "| `#lib/elsewhere.js` | not the table |",
      "## Shared helpers",
      "| Import | What |",
      "| `#lib/a.js` | a |",
      "| `#lib/b/` | b |",
      "## Environment",
      "| `#lib/later.js` | not either |",
    ].join("\n");
    expect(listedHelpers(markdown)).toEqual(["#lib/a.js", "#lib/b/"]);
  });
});
