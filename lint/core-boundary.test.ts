import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// The no-restricted-imports overrides of .oxlintrc.json that keep modules to
// #core/services/, run on probe files laid out like the repository. When
// several patterns match an import, oxlint reports it once, with the message
// of the last one: the runtime.js entry comes last for that reason.

const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const RUNTIME = "gets the client from what calls it";
const CORE = "reaches the core through #core/services/ only";

// [file, import, the message expected, or null when allowed]
const CASES: [string, string, string | null][] = [
  ["src/modules/probe/sub/a.ts", "#core/runtime.js", RUNTIME],
  ["src/modules/probe/sub/a.ts", "../../../core/runtime.js", RUNTIME],
  ["src/modules/probe/sub/a.ts", "#core/loaders/module-loader.js", CORE],
  ["src/modules/probe/sub/a.ts", "#core/utils/core-config.js", CORE],
  ["src/modules/probe/sub/a.ts", "#core/i18n/en.json", CORE],
  ["src/modules/probe/sub/a.ts", "../../../core/loaders/x.js", CORE],
  ["src/modules/probe/sub/a.ts", "#core/services/config.service.js", null],
  ["src/modules/probe/sub/a.ts", "../../../core/services/x.js", null],
  ["src/modules/probe/sub/a.ts", "#lib/permissions.js", null],
  ["src/modules/probe/sub/a.ts", "@discordjs/core/http-only", null],
  ["src/modules/probe/sub/a.ts", "./core/engine.js", null],
  ["src/modules/probe/sub/a.ts", "#modules/probe/core/engine.js", null],
  ["src/modules/probe/b.ts", "../../core/loaders/x.js", CORE],
  ["src/modules/probe/b.ts", "../../core/services/x.js", null],
  ["src/modules/probe/c.test.ts", "#core/i18n/en.json", null],
  ["src/modules/probe/c.test.ts", "#core/loaders/module-loader.js", CORE],
  ["src/modules/probe/c.test.ts", "#core/runtime.js", RUNTIME],
  ["src/core/probe/d.ts", "#core/runtime.js", null],
];

type Override = { files: string[]; rules: Record<string, unknown> };

function boundaryConfig(): { plugins: never[]; overrides: Override[] } {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, ".oxlintrc.json"), "utf8")
  ) as { overrides: Override[] };
  return {
    plugins: [],
    overrides: config.overrides.filter(
      (override) => "no-restricted-imports" in override.rules
    ),
  };
}

/** The messages oxlint gives each probe import, keyed `file:line`. */
function lintProbes(): Map<string, string[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omnibot-boundary-"));
  try {
    fs.writeFileSync(
      path.join(dir, ".oxlintrc.json"),
      JSON.stringify(boundaryConfig())
    );
    const lines = new Map<string, string[]>();
    for (const [file, specifier] of CASES) {
      lines.set(file, [...(lines.get(file) ?? []), `import "${specifier}";`]);
    }
    for (const [file, imports] of lines) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), imports.join("\n"));
    }
    const { stdout } = spawnSync(
      path.join(root, "node_modules", ".bin", "oxlint"),
      ["--format", "json", "src"],
      { cwd: dir, encoding: "utf8" }
    );
    const { diagnostics } = JSON.parse(stdout) as {
      diagnostics: {
        filename: string;
        help: string;
        labels: { span: { line: number } }[];
      }[];
    };
    const reports = new Map<string, string[]>();
    for (const d of diagnostics) {
      const key = `${d.filename}:${d.labels[0]!.span.line}`;
      reports.set(key, [...(reports.get(key) ?? []), d.help]);
    }
    return reports;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

it("gives module tests the same rule, #core/i18n/ aside", () => {
  const [source, tests] = boundaryConfig().overrides;
  expect([source?.files, tests?.files]).toEqual([
    ["src/modules/**"],
    ["src/modules/**/*.test.ts"],
  ]);
  const allowI18n = JSON.stringify(
    tests!.rules["no-restricted-imports"]
  ).replace(',"!#core/i18n/**","!../**/core/i18n/**"', "");
  expect(allowI18n).toBe(
    JSON.stringify(source!.rules["no-restricted-imports"])
  );
});

describe("modules reach the core through #core/services/ only", () => {
  let reports: Map<string, string[]>;
  beforeAll(() => {
    reports = lintProbes();
  });

  const lineOf = (index: number) =>
    CASES.slice(0, index + 1).filter(([file]) => file === CASES[index]![0])
      .length;

  it.each(CASES.map((probe, index) => [...probe, index] as const))(
    "%s importing %s",
    (file, _, expected, index) => {
      const messages = reports.get(`${file}:${lineOf(index)}`) ?? [];
      if (expected === null) {
        expect(messages).toEqual([]);
      } else {
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain(expected);
      }
    }
  );
});
