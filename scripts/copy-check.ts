// Refuses code copied from one part of the bot into another: a run of identical
// lines that a change adds to one module (or src/lib, src/core…) while another
// already holds it. The copy belongs in a shared function instead — an
// existing one extended, or a new one in #lib.
//
//   node scripts/copy-check.ts --staged      # the staged changes (pre-commit)
//   node scripts/copy-check.ts <ref>         # the working tree against <ref> (CI: HEAD^1)
//   node scripts/copy-check.ts ... --min-lines <n>   # default 6
//
// Lines are compared trimmed, with spaces collapsed; blank lines, comments,
// imports, lone brackets and lone names (a long import or list, one per line)
// are skipped, so a run is logic rather than boilerplate. Tests and previews
// are not checked. Only a run holding an added line is looked at, and it is
// refused only when it holds 6 lines in a row (the minimum) that the base
// did not already copy between the same two files: editing an old copy (the
// same line added to both, a reformat) passes.
// --staged reads the changed files from the index, as they will be committed.
//
// A copy kept on purpose is allowed by a comment in either file, inside the
// copied lines or above them (past the function's doc and signature),
// giving the reason:
//
//   // copy-check: allow — <why this one is not shared>
//
// Output: one line per copy, "<n> lines  <file>:<start>-<end>  <file>:<start>-<end>",
// the changed file first. Exit 0 when there is none, 1 when there are copies,
// 2 on a usage error.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
// `.ts`, not `.js`: node runs this file as is, without the src/ build.
import {
  byCodePoint,
  isSourceFile,
  readIfPresent,
  sourceFiles,
  subsystemOf,
} from "./source-files.ts";

export interface Line {
  text: string;
  /** 1-based line number in the file. */
  no: number;
}

export interface Copy {
  length: number;
  file: string;
  start: number;
  end: number;
  other: string;
  otherStart: number;
  otherEnd: number;
  /** The copied lines, normalised. */
  lines: string[];
}

const IMPORT_LIKE = /^(import|export \{|export \* from|export type \{)/;
const COMMENT = /^(\/\/|\/\*|\*)/;
const BRACKETS = /^[[\](){};,]+$/;
// A lone name, possibly dotted: one entry of a multi-line import, argument
// list or array (`GatewayIntentBits.Guilds,`).
const LONE_NAME = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*,?$/;
// Framework boilerplate every module repeats: a type's fields (`title: string;`)
// and builder chains (`.setName("page")`, `.addIntegerOption(`).
const TYPE_MEMBER = /^(readonly )?[A-Za-z_$][\w$]*\??: [^=]*;$/;
const BUILDER_CALL = /^\.(set|add)[A-Z]/;
const ALLOW = /copy-check: allow/;

/** The lines a copy is looked for in, normalised, with their line numbers. */
export function significantLines(source: string): Line[] {
  const lines: Line[] = [];
  source.split("\n").forEach((raw, i) => {
    const text = raw.trim().replace(/\s+/g, " ");
    if (text === "" || BRACKETS.test(text) || IMPORT_LIKE.test(text)) return;
    if (COMMENT.test(text) || LONE_NAME.test(text)) return;
    if (TYPE_MEMBER.test(text) || BUILDER_CALL.test(text)) return;
    lines.push({ text, no: i + 1 });
  });
  return lines;
}

/**
 * Whether a `copy-check: allow` comment sits in lines `start`..`end`
 * (1-based) or above them, past blank lines, comments and the lines that
 * open a declaration (its signature): the copied block's own comment, or its
 * function's.
 */
export function allowedNear(
  source: string,
  start: number,
  end: number
): boolean {
  const raw = source.split("\n");
  if (raw.slice(start - 1, end).some((l) => ALLOW.test(l))) return true;
  for (let i = start - 2; i >= 0; i--) {
    const text = raw[i]!.trim();
    if (ALLOW.test(text)) return true;
    const opener = /[({,]$/.test(text) || text.startsWith(")");
    if (text !== "" && !COMMENT.test(text) && !opener && !DECLARES.test(text)) {
      return false;
    }
  }
  return false;
}

const DECLARES =
  /^(export\s+)?(default\s+)?(async\s+)?(function|const|class)\b/;

/**
 * Runs of at least `minLines` identical significant lines between a changed
 * file and a file of another subsystem, keeping those that hold an added line.
 * `added` maps each changed file to its added line numbers.
 */
export function findCopies(
  files: Map<string, string>,
  added: Map<string, Set<number>>,
  minLines: number
): Copy[] {
  const lines = new Map<string, Line[]>();
  for (const [file, source] of files) lines.set(file, significantLines(source));

  // Every window of `minLines` lines, by its text, in every file.
  const windows = new Map<string, { file: string; pos: number }[]>();
  for (const [file, ls] of lines) {
    for (let pos = 0; pos + minLines <= ls.length; pos++) {
      const key = ls
        .slice(pos, pos + minLines)
        .map((l) => l.text)
        .join("\n");
      const at = windows.get(key);
      if (at) at.push({ file, pos });
      else windows.set(key, [{ file, pos }]);
    }
  }

  const copies: Copy[] = [];
  const seen = new Set<string>();
  for (const [file, positions] of added) {
    const own = lines.get(file);
    if (!own || positions.size === 0) continue;
    for (let pos = 0; pos + minLines <= own.length; pos++) {
      const key = own
        .slice(pos, pos + minLines)
        .map((l) => l.text)
        .join("\n");
      for (const hit of windows.get(key) ?? []) {
        if (subsystemOf(hit.file) === subsystemOf(file)) continue;
        const theirs = lines.get(hit.file)!;
        // Start of the run: walk back while both files still agree.
        let a = pos;
        let b = hit.pos;
        while (a > 0 && b > 0 && own[a - 1]!.text === theirs[b - 1]!.text) {
          a--;
          b--;
        }
        // One copy, whichever of its two files was changed: a block added to
        // two files is found from both sides.
        const id =
          file < hit.file
            ? `${file}:${a}:${hit.file}:${b}`
            : `${hit.file}:${b}:${file}:${a}`;
        if (seen.has(id)) continue;
        let length = 0;
        while (
          a + length < own.length &&
          b + length < theirs.length &&
          own[a + length]!.text === theirs[b + length]!.text
        ) {
          length++;
        }
        const run = own.slice(a, a + length);
        // Seen only once this side holds an added line: the other side, when
        // it is the one the change copied into, still gets its turn.
        if (!run.some((l) => positions.has(l.no))) continue;
        seen.add(id);
        const otherStart = theirs[b]!.no;
        const otherEnd = theirs[b + length - 1]!.no;
        if (
          allowedNear(files.get(file)!, run[0]!.no, run[length - 1]!.no) ||
          allowedNear(files.get(hit.file)!, otherStart, otherEnd)
        ) {
          continue;
        }
        copies.push({
          length,
          file,
          start: run[0]!.no,
          end: run[length - 1]!.no,
          other: hit.file,
          otherStart,
          otherEnd,
          lines: run.map((l) => l.text),
        });
      }
    }
  }
  return copies.sort(
    (x, y) =>
      y.length - x.length ||
      byCodePoint(x.file, y.file) ||
      x.start - y.start ||
      byCodePoint(x.other, y.other)
  );
}

/**
 * The copies of `copies` the base did not have. A line is old when the base
 * already copied it between the same two modules (`baseCopies`, found with a
 * lower minimum, so a short duplicate fixed in both places counts); a copy is new
 * when it holds `minLines` new lines in a row, so editing or extending an old
 * copy by a few lines (the same line added to both, a reformat) passes.
 */
export function newCopies(
  copies: Copy[],
  baseCopies: Copy[],
  minLines: number
): Copy[] {
  // By module rather than by file: splitting a file inside a module keeps
  // the copies it already had.
  const pair = (c: Copy) =>
    [subsystemOf(c.file), subsystemOf(c.other)].sort(byCodePoint).join("\n");
  const old = new Map<string, Set<string>>();
  for (const c of baseCopies) {
    const lines = old.get(pair(c)) ?? new Set<string>();
    c.lines.forEach((l) => lines.add(l));
    old.set(pair(c), lines);
  }
  return copies.filter((c) => {
    const known = old.get(pair(c));
    let run = 0;
    for (const line of c.lines) {
      run = known?.has(line) ? 0 : run + 1;
      if (run >= minLines) return true;
    }
    return false;
  });
}

/** Added line numbers per file, from a `git diff -U0` output. */
export function addedLines(diff: string): Map<string, Set<number>> {
  const added = new Map<string, Set<number>>();
  let current: Set<number> | undefined;
  for (const line of diff.split("\n")) {
    // A path with a space ends with a tab.
    const file = /^\+\+\+ b\/(.+?)\t?$/.exec(line);
    if (file) {
      current = new Set();
      added.set(file[1]!, current);
      continue;
    }
    if (line.startsWith("+++ ")) {
      current = undefined; // a deleted file
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let n = start; n < start + count; n++) current.add(n);
    }
  }
  return added;
}

export function formatCopy(c: Copy): string {
  return `${c.length} lines  ${c.file}:${c.start}-${c.end}  ${c.other}:${c.otherStart}-${c.otherEnd}`;
}

interface Options {
  base: string | null; // null: the staged changes
  minLines: number;
}

export function parseArgs(argv: string[]): Options | string {
  let base: string | null | undefined;
  let minLines = 6;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--staged") base = null;
    else if (arg === "--min-lines") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 2)
        return "--min-lines takes a whole number of at least 2";
      minLines = n;
    } else if (arg.startsWith("-")) return `unknown option ${arg}`;
    else if (base === undefined) base = arg;
    else return `unexpected argument ${arg}`;
  }
  if (base === undefined) return "give --staged or a base ref (HEAD^1 in CI)";
  return { base, minLines };
}

/** Old path of each renamed file, by new path, from `git diff --name-status`. */
export function renamesIn(nameStatus: string): Map<string, string> {
  const renamed = new Map<string, string>();
  for (const line of nameStatus.split("\n")) {
    const [status, from, to] = line.split("\t");
    if (status?.startsWith("R") && from && to) renamed.set(to, from);
  }
  return renamed;
}

function workingSources(root: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const file of sourceFiles(root)) {
    const full = path.join(root, file);
    const source = readIfPresent(full);
    if (source !== null) files.set(file, source);
  }
  return files;
}

/** The source files of the index, as they will be committed: one git call. */
function stagedSources(root: string): Map<string, string> {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--", "src"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  )
    .split("\0")
    .filter(isSourceFile);
  const out = execFileSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: listed.map((f) => `:${f}\n`).join(""),
    maxBuffer: 256 * 1024 * 1024,
  });
  const files = new Map<string, string>();
  let at = 0;
  for (const file of listed) {
    const eol = out.indexOf(10, at);
    const header = out.subarray(at, eol).toString("utf8");
    const size = Number(header.split(" ")[2]);
    at = eol + 1;
    if (Number.isNaN(size)) continue; // "missing": not in the index
    files.set(file, out.subarray(at, at + size).toString("utf8"));
    at += size + 1;
  }
  return files;
}

/** The command, run from `cwd`; exported so tests run it in-process. */
export function main(argv: string[], cwd = process.cwd()): number {
  const options = parseArgs(argv);
  if (typeof options === "string") {
    process.stderr.write(
      `copy-check: ${options}\nusage: node scripts/copy-check.ts (--staged | <ref>) [--min-lines <n>]\n`
    );
    return 2;
  }
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  }).trim();
  const against = options.base === null ? ["--cached"] : [options.base];
  const diff = execFileSync(
    "git",
    [
      "-c",
      "core.quotePath=false",
      "diff",
      "-U0",
      "--no-color",
      "--no-ext-diff",
      "--diff-filter=AMR",
      // Whatever diff.mnemonicPrefix, diff.noprefix or diff.renames say:
      // addedLines reads b/, and a moved file adds no line.
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--find-renames",
      ...against,
      "--",
      "src",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const added = new Map(
    [...addedLines(diff)].filter(([file]) => isSourceFile(file))
  );
  if (added.size === 0) return 0;

  const show = (spec: string): string | null => {
    try {
      return execFileSync("git", ["show", spec], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null; // not in that tree
    }
  };
  // The tree the change makes: the index for --staged (what is committed,
  // where the diff's line numbers point), the working tree otherwise.
  const files =
    options.base === null ? stagedSources(root) : workingSources(root);
  const found = findCopies(files, added, options.minLines);
  if (found.length === 0) return 0;

  // The copies the base already had between the same files are not this
  // change's doing.
  // A moved file is read on the base at its old path, under its new name.
  const baseRef = options.base ?? "HEAD";
  const renamed = renamesIn(
    execFileSync(
      "git",
      [
        "-c",
        "core.quotePath=false",
        "diff",
        "--name-status",
        "--find-renames",
        ...against,
        "--",
        "src",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
  );
  // The base files of every module the copies touch, a moved file under its
  // new name.
  const toNew = new Map([...renamed].map(([to, from]) => [from, to]));
  const modules = new Set(
    found.flatMap((c) => [subsystemOf(c.file), subsystemOf(c.other)])
  );
  const baseFiles = new Map<string, string>();
  const listed = execFileSync(
    "git",
    [
      "-c",
      "core.quotePath=false",
      "ls-tree",
      "-r",
      "--name-only",
      baseRef,
      "--",
      ...modules,
      ...renamed.values(),
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  for (const file of listed.split("\n").filter(isSourceFile)) {
    const content = show(`${baseRef}:${file}`);
    if (content !== null) baseFiles.set(toNew.get(file) ?? file, content);
  }
  // A lower minimum: lines the base already duplicated, even fewer than
  // minLines of them, are not this change's doing.
  const baseCopies = findCopies(
    baseFiles,
    new Map(
      [...baseFiles].map(([file, content]) => [
        file,
        new Set(content.split("\n").map((_, i) => i + 1)),
      ])
    ),
    Math.min(3, options.minLines)
  );
  const copies = newCopies(found, baseCopies, options.minLines);
  if (copies.length === 0) return 0;
  process.stdout.write(copies.map(formatCopy).join("\n") + "\n");
  process.stderr.write(
    "copy-check: this change copies code that another part of the bot already has.\n" +
      "Share it instead: extend the existing function, or move it to #lib (see the Shared helpers table in AGENTS.md).\n" +
      "A copy kept on purpose takes a `// copy-check: allow — <reason>` comment, in the copied lines or above them.\n"
  );
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
