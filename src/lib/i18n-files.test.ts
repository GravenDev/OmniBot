import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

const bundles = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .map((path) => path.replaceAll("\\", "/"))
  .filter((path) => /(^|\/)i18n\/[a-z]{2}\.json$/.test(path))
  .sort();

function duplicateKeys(source: string): string[] {
  const duplicates: string[] = [];
  const objects: Set<string>[] = [];
  const token = /("(?:[^"\\]|\\.)*")\s*:|"(?:[^"\\]|\\.)*"|[{}]/g;
  for (const [match, rawKey] of source.matchAll(token)) {
    if (match === "{") {
      objects.push(new Set());
    } else if (match === "}") {
      objects.pop();
    } else if (rawKey !== undefined) {
      const key = JSON.parse(rawKey) as string;
      const seen = objects.at(-1)!;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
  }
  return duplicates;
}

describe("i18n bundles", () => {
  it("finds the bundles", () => {
    expect(bundles).toContain("core/i18n/en.json");
  });

  it("spots a key declared twice", () => {
    expect(duplicateKeys('{ "a": "x", "b": "a", "a": "y" }')).toEqual(["a"]);
  });

  it.each(bundles)("%s declares each key once", (path) => {
    expect(duplicateKeys(readFileSync(join(SRC, path), "utf8"))).toEqual([]);
  });
});
