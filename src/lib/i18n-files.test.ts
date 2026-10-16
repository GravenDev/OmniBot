import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

const bundles = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .map((path) => path.replaceAll("\\", "/"))
  .filter((path) => /(^|\/)i18n\/[a-z]{2}\.json$/.test(path))
  .sort();

const moduleIds = [
  "core",
  ...readdirSync(join(SRC, "modules"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      readdirSync(join(SRC, "modules", entry.name))
        .filter((file) => file.endsWith(".module.ts"))
        .map((file) => join(SRC, "modules", entry.name, file))
    )
    .map((path) => /\bid:\s*"([^"]+)"/.exec(readFileSync(path, "utf8"))?.[1]),
].sort();

function coreBundle(lng: string): Record<string, string> {
  return JSON.parse(
    readFileSync(join(SRC, "core", "i18n", `${lng}.json`), "utf8")
  ) as Record<string, string>;
}

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

  it("finds the modules", () => {
    expect(moduleIds).toContain("message-log");
    expect(moduleIds).not.toContain(undefined);
  });

  it.each(moduleIds)("core bundles name and describe the %s module", (id) => {
    for (const lng of ["en", "fr"]) {
      const bundle = coreBundle(lng);
      expect(bundle, lng).toHaveProperty([`modules.${id}.name`]);
      expect(bundle, lng).toHaveProperty([`modules.${id}.description`]);
    }
  });
});
