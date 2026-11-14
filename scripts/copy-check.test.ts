import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addedLines,
  allowedNear,
  newCopies,
  type Copy,
  findCopies,
  formatCopy,
  parseArgs,
  significantLines,
  main,
} from "./copy-check.js";
import { captureOutput, dropGitEnv, envWithoutGit } from "./test-support.js";

const LOGIC = [
  "const channel = guild.channels.cache.get(id);",
  "if (!channel?.isSendable()) return null;",
  "const message = await channel.send({ content });",
  "await message.react(emoji);",
  "logger.info(`Posted | guildId = ${guild.id}`);",
  "return message;",
];

function fn(name: string, body = LOGIC): string {
  return [
    `export async function ${name}(guild: Guild, id: string) {`,
    ...body.map((l) => `  ${l}`),
    "}",
    "",
  ].join("\n");
}

/** Every line of each file counts as added. */
function allAdded(files: Map<string, string>): Map<string, Set<number>> {
  return new Map(
    [...files].map(([file, source]) => [
      file,
      new Set(source.split("\n").map((_, i) => i + 1)),
    ])
  );
}

describe("significantLines", () => {
  it("skips type members and builder calls, the framework's boilerplate", () => {
    const source = [
      "  locale: string;",
      "  title?: string;",
      '    .setName("page")',
      "    .setMinValue(1)",
      "  return title;",
    ].join("\n");
    expect(significantLines(source)).toEqual([
      { text: "return title;", no: 5 },
    ]);
  });

  it("skips blank lines, comments, imports, brackets and lone names", () => {
    const source = [
      'import { a } from "./a.js";',
      "export { b };",
      "// a comment",
      "/**",
      " * doc",
      " */",
      "",
      "const x = [",
      "  GatewayIntentBits.Guilds,",
      "  name,",
      "];",
      "  return   x  +  1;",
    ].join("\n");
    expect(significantLines(source)).toEqual([
      { text: "const x = [", no: 8 },
      { text: "return x + 1;", no: 12 },
    ]);
  });
});

describe("findCopies", () => {
  it("reports a run copied into another module, the changed file first", () => {
    const files = new Map([
      ["src/modules/a/x.ts", fn("post")],
      ["src/modules/b/y.ts", "\n\n" + fn("send")],
    ]);
    const copies = findCopies(
      files,
      new Map([["src/modules/b/y.ts", new Set([5])]]),
      6
    );
    expect(copies.map(formatCopy)).toEqual([
      "6 lines  src/modules/b/y.ts:4-9  src/modules/a/x.ts:2-7",
    ]);
  });

  it("ignores copies inside one module", () => {
    const files = new Map([
      ["src/modules/a/x.ts", fn("post")],
      ["src/modules/a/sub/y.ts", fn("send")],
    ]);
    expect(findCopies(files, allAdded(files), 6)).toEqual([]);
  });

  it("treats each folder of src/ besides modules as one part", () => {
    const files = new Map([
      ["src/lib/x.ts", fn("post")],
      ["src/modules/a/y.ts", fn("send")],
    ]);
    expect(
      findCopies(files, new Map([["src/modules/a/y.ts", new Set([3])]]), 6)
    ).toHaveLength(1);
  });

  it("ignores a copy that holds no added line", () => {
    const files = new Map([
      ["src/modules/a/x.ts", fn("post")],
      ["src/modules/b/y.ts", fn("send") + "export const z = 1;\n"],
    ]);
    // Only the last line of y.ts changed: the copy was already there.
    expect(
      findCopies(files, new Map([["src/modules/b/y.ts", new Set([9])]]), 6)
    ).toEqual([]);
  });

  it("ignores a run shorter than the minimum", () => {
    const files = new Map([
      ["src/modules/a/x.ts", fn("post", LOGIC.slice(0, 5))],
      ["src/modules/b/y.ts", fn("send", LOGIC.slice(0, 5))],
    ]);
    expect(findCopies(files, allAdded(files), 6)).toEqual([]);
  });

  it("reports a long run once, at its full length", () => {
    const long = [...LOGIC, "count++;", "done = true;"];
    const files = new Map([
      ["src/modules/a/x.ts", fn("post", long)],
      ["src/modules/b/y.ts", fn("send", long)],
    ]);
    const copies = findCopies(
      files,
      new Map([["src/modules/b/y.ts", new Set([2])]]),
      6
    );
    expect(copies.map((c) => c.length)).toEqual([8]);
  });

  it("still reports a copy when its source file is edited elsewhere", () => {
    const files = new Map([
      ["src/modules/a/x.ts", fn("post") + "export const unrelated = 1;\n"],
      ["src/modules/b/y.ts", fn("send")],
    ]);
    const added = new Map([
      ["src/modules/a/x.ts", new Set([9])],
      ["src/modules/b/y.ts", new Set([2, 3, 4, 5, 6, 7])],
    ]);
    expect(findCopies(files, added, 6)).toHaveLength(1);
  });

  it("reports a copy added to two files once", () => {
    const files = new Map([
      ["src/modules/a/x.ts", fn("post")],
      ["src/modules/b/y.ts", fn("send")],
    ]);
    expect(findCopies(files, allAdded(files), 6)).toHaveLength(1);
  });

  it("allows a copy whose other side carries the comment", () => {
    const allowed = fn("post").replace(
      "export async",
      "// copy-check: allow — both new on purpose\nexport async"
    );
    const files = new Map([
      ["src/modules/a/x.ts", allowed],
      ["src/modules/b/y.ts", fn("send")],
    ]);
    expect(findCopies(files, allAdded(files), 6)).toEqual([]);
  });

  it("allows a copy under a copy-check: allow comment", () => {
    const allowed = fn("send").replace(
      "export async",
      "// copy-check: allow — kept apart until #12 lands\nexport async"
    );
    const files = new Map([
      ["src/modules/a/x.ts", fn("post")],
      ["src/modules/b/y.ts", allowed],
    ]);
    expect(
      findCopies(files, new Map([["src/modules/b/y.ts", new Set([4])]]), 6)
    ).toEqual([]);
  });
});

describe("allowedNear", () => {
  const source = [
    "// copy-check: allow — kept apart on purpose",
    "/**",
    " * What it does.",
    " */",
    "export function f(",
    "  a: number,",
    ") {",
    "  const b = a + 1;",
    "  const c = b * 2;",
    "  return c;",
    "}",
    "",
    "const other = 1;",
    "export function g() {",
    "  const b = 3;",
    "}",
  ].join("\n");

  it("finds the comment above the function, past its doc and signature", () => {
    expect(allowedNear(source, 8, 10)).toBe(true);
  });

  it("finds it inside the copied lines", () => {
    expect(allowedNear(source, 1, 10)).toBe(true);
  });

  it("past a long doc and signature", () => {
    const long = [
      "// copy-check: allow — reason",
      "/**",
      ...Array.from({ length: 10 }, (_, i) => ` * line ${i}`),
      " */",
      "export function f(",
      "  a: number,",
      "  b: number,",
      "): number {",
      "  return a + b;",
    ].join("\n");
    expect(allowedNear(long, 18, 18)).toBe(true);
  });

  it("not across other code", () => {
    expect(allowedNear(source, 15, 15)).toBe(false);
  });
});

describe("newCopies", () => {
  const copy = (lines: string[]): Copy => ({
    length: lines.length,
    file: "src/modules/b/y.ts",
    start: 1,
    end: lines.length,
    other: "src/modules/a/x.ts",
    otherStart: 1,
    otherEnd: lines.length,
    lines,
  });
  const old = ["l1;", "l2;", "l3;", "l4;", "l5;", "l6;", "l7;"];

  it("compares by module, so a file split inside a module keeps its old copies", () => {
    const moved = { ...copy(old), file: "src/modules/b/split.ts" };
    const base = { ...copy(old), file: "src/modules/b/y.ts" };
    expect(newCopies([moved], [base], 6)).toEqual([]);
  });

  it("drops a copy the base already had, even grown by the change", () => {
    const grown = copy([...old.slice(0, 3), "added();", ...old.slice(3)]);
    expect(newCopies([grown], [copy(old)], 6)).toEqual([]);
  });

  it("keeps a copy between the same files that the base did not have", () => {
    const fresh = copy(["n1;", "n2;", "n3;", "n4;", "n5;", "n6;"]);
    expect(newCopies([fresh], [copy(old)], 6)).toEqual([fresh]);
  });

  it("does not match the same lines between other files", () => {
    const elsewhere = { ...copy(old), other: "src/modules/c/z.ts" };
    expect(newCopies([elsewhere], [copy(old)], 6)).toEqual([elsewhere]);
  });
});

describe("addedLines", () => {
  it("reads a path with a space, which git ends with a tab", () => {
    const diff = ["+++ b/src/a b.ts\t", "@@ -0,0 +1 @@", "+x"].join("\n");
    expect(addedLines(diff)).toEqual(new Map([["src/a b.ts", new Set([1])]]));
  });

  it("collects the added line numbers of each file, skipping deletions", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -3,0 +4,2 @@ export function f() {",
      "+one",
      "+two",
      "@@ -10 +12 @@",
      "-old",
      "+new",
      "@@ -20,3 +21,0 @@",
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
    ].join("\n");
    expect(addedLines(diff)).toEqual(
      new Map([["src/a.ts", new Set([4, 5, 12])]])
    );
  });
});

describe("parseArgs", () => {
  it("takes --staged or a ref, and a minimum", () => {
    expect(parseArgs(["--staged"])).toEqual({ base: null, minLines: 6 });
    expect(parseArgs(["HEAD^1", "--min-lines", "8"])).toEqual({
      base: "HEAD^1",
      minLines: 8,
    });
  });

  it("refuses a missing base, a bad minimum or an extra argument", () => {
    expect(parseArgs([])).toMatch(/--staged or a base ref/);
    expect(parseArgs(["--staged", "--min-lines", "x"])).toMatch(/whole number/);
    expect(parseArgs(["a", "b"])).toMatch(/unexpected argument b/);
    expect(parseArgs(["--fast"])).toMatch(/unknown option --fast/);
  });
});

describe("command", () => {
  const script = path.join(import.meta.dirname, "copy-check.ts");
  let dir: string;

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function git(...args: string[]) {
    // GIT_DIR and friends, set when this runs under a git hook, would point
    // the fixture's commands at the real repository.
    const env = envWithoutGit();
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env });
    expect(r.status, r.stderr).toBe(0);
  }

  // In-process, so that coverage counts main().
  beforeEach(dropGitEnv);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const run = (...args: string[]) => captureOutput(() => main(args, dir));

  function write(file: string, content: string) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }

  function repo() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "copy-check-"));
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    write("src/modules/a/x.ts", fn("post"));
    git("add", ".");
    git("commit", "-qm", "base");
  }

  it("fails on a staged copy and names both places", () => {
    repo();
    write("src/modules/b/y.ts", fn("send"));
    git("add", ".");
    const r = run("--staged");
    expect(r.status).toBe(1);
    expect(r.stdout).toBe(
      "6 lines  src/modules/b/y.ts:2-7  src/modules/a/x.ts:2-7\n"
    );
    expect(r.stderr).toMatch(/copy-check: allow/);
  });

  it("passes a change that copies nothing, and ignores tests", () => {
    repo();
    write("src/modules/b/y.test.ts", fn("send"));
    write("src/modules/b/y.ts", "export const y = 1;\n");
    git("add", ".");
    git("commit", "-qm", "change");
    const r = run("HEAD^1");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("reads a staged file from the index, not from the working tree", () => {
    repo();
    write("src/modules/b/y.ts", fn("send"));
    git("add", ".");
    // Unstaged lines above the copy shift the working tree, not the index.
    write("src/modules/b/y.ts", "const a = 1;\nconst b = 2;\n" + fn("send"));
    const r = run("--staged");
    expect(r.stdout).toBe(
      "6 lines  src/modules/b/y.ts:2-7  src/modules/a/x.ts:2-7\n"
    );
  });

  it("works whatever diff prefixes git is configured with", () => {
    repo();
    git("config", "diff.mnemonicPrefix", "true");
    write("src/modules/b/y.ts", fn("send"));
    git("add", ".");
    expect(run("--staged").status).toBe(1);
    git("config", "diff.noprefix", "true");
    expect(run("--staged").status).toBe(1);
  });

  it("passes a change to a copy that was already there", () => {
    repo();
    write("src/modules/b/y.ts", fn("send"));
    git("add", ".");
    git("commit", "-qm", "copy already on the base");
    // The same line added inside both copies, as a cross-module edit would.
    for (const [file, name] of [
      ["src/modules/a/x.ts", "post"],
      ["src/modules/b/y.ts", "send"],
    ] as const) {
      write(
        file,
        fn(name).replace(
          "  await message.react",
          "  count++;\n  await message.react"
        )
      );
    }
    git("add", ".");
    git("commit", "-qm", "edit both");
    const r = run("HEAD^1");
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it("judges the staged tree, not untracked or unstaged files", () => {
    repo();
    // The original exists only in an untracked file: not committed.
    fs.renameSync(
      path.join(dir, "src/modules/a/x.ts"),
      path.join(dir, "src/modules/a/kept.ts")
    );
    git("rm", "-q", "--cached", "src/modules/a/x.ts");
    git("commit", "-qm", "drop x");
    write("src/modules/b/y.ts", fn("send"));
    git("add", "src/modules/b/y.ts");
    const r = run("--staged");
    expect(r.status, r.stdout).toBe(0);
  });

  it("passes an old copy carried by a moved file", () => {
    repo();
    write("src/modules/b/y.ts", fn("send"));
    git("add", ".");
    git("commit", "-qm", "copy already on the base");
    git("config", "diff.renames", "false");
    fs.mkdirSync(path.join(dir, "src/modules/c"), { recursive: true });
    git("mv", "src/modules/a/x.ts", "src/modules/c/x.ts");
    git("commit", "-qm", "move");
    const r = run("HEAD^1");
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it("passes the same fix made to a short duplicate in both places", () => {
    repo();
    const short = LOGIC.slice(0, 5);
    write("src/modules/a/x.ts", fn("post", short));
    write("src/modules/b/y.ts", fn("send", short));
    git("add", ".");
    git("commit", "-qm", "five-line duplicate");
    const fixed = [...short, "if (count < 0) throw new RangeError(name);"];
    write("src/modules/a/x.ts", fn("post", fixed));
    write("src/modules/b/y.ts", fn("send", fixed));
    git("add", ".");
    git("commit", "-qm", "fix both");
    const r = run("HEAD^1");
    expect(r.status, r.stdout).toBe(0);
  });

  it("checks a file whose path has accents", () => {
    repo();
    write("src/modules/café/y.ts", fn("send"));
    git("add", ".");
    expect(run("--staged").status).toBe(1);
  });

  it("exits 2 on a usage error", () => {
    repo();
    expect(run().status).toBe(2);
  });

  it("runs as a command, with its exit code and output", () => {
    repo();
    write("src/modules/b/y.ts", fn("send"));
    git("add", ".");
    const r = spawnSync(process.execPath, [script, "--staged"], {
      cwd: dir,
      encoding: "utf8",
      env: envWithoutGit(),
    });
    expect(r.status, r.stderr).toBe(1);
    expect(r.stdout).toContain("src/modules/b/y.ts");
  });
});
