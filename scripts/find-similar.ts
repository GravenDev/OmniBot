// Finds the existing functions a new one may duplicate, so it gets reused or
// extended rather than written a second time: the functions of src/ whose
// name is made of the same meaningful words (addDays ↔ addDays,
// counted ↔ isCounted), or whose body makes mostly the same calls.
//
//   node scripts/find-similar.ts <file> [<function>...]   # every top-level function of <file>, or those named
//   node scripts/find-similar.ts --hook                   # Claude Code PostToolUse hook (JSON on stdin)
//
// Only top-level functions are looked at — `function f`, `const f = (…) =>`,
// exported or not — as oxfmt lays them out (see functionsIn). It is a hint,
// not a proof: names and calls only.
//
// Command output: per function, "<name>  <file>:<line>" then one indented line
// per candidate, "<name>  <file>:<line>  <why>"; nothing when none. Exit 0, or
// 2 on a usage error.
//
// Hook mode reads the Write or Edit call on stdin. When it declares a function
// in src/ (not a test) that the file did not have and candidates exist, it
// prints {"decision":"block","reason":…}: Claude Code shows the reason to
// Claude after the edit, which then reuses one or says why none fits. A
// function is reported once per session (state in .git/omnibot-find-similar/).
// The edited file's own checkout is searched, a worktree included. The
// command in .claude/settings.json ends in `|| true`: a Node that cannot run
// TypeScript, or a checkout without this script, must not fail every edit.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// `.ts`, not `.js`: node runs this file as is, without the src/ build.
import {
  byCodePoint,
  isSourceFile,
  readIfPresent,
  sourceFiles,
} from "./source-files.ts";

export interface FunctionInfo {
  name: string;
  file: string;
  line: number;
  calls: Set<string>;
}

export interface Candidate {
  fn: FunctionInfo;
  sharedWords: string[];
  sharedCalls: string[];
  score: number;
}

const FUNCTION_DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/;
const CONST_DECLARATION = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\b/;
// What follows `=` in a const holding a function: `(…) =>`, `<T>(…) =>`,
// `x =>`, `function`.
const FUNCTION_VALUE =
  /^(?:export\s+)?const\s+[A-Za-z_$][\w$]*\s*(?::(?:=>|[^=])*?)?=(?!>)\s*(?:async\s+)?(?:<[^=]*?>\s*)?(?:function\b|[A-Za-z_$][\w$]*\s*=>|\([\s\S]*?\)\s*(?::[^=]*?)?=>)/;
// Only closes the top-level block: `}`, `};`, `});`.
const CLOSING = /^[})][;,)]*\s*$/;

/**
 * Top-level functions of a source file, with the names their bodies call.
 * The header (up to the line ending in `{`, `=>`, `;` or `}`, outside the
 * parameters) tells a function from another const, and an overload signature
 * from its implementation; the body ends at the line that closes it, or for
 * an arrow returning an expression, at its last `;`.
 */
export function functionsIn(file: string, source: string): FunctionInfo[] {
  const lines = source.split("\n");
  const found: FunctionInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fn = FUNCTION_DECLARATION.exec(line);
    const constant = fn ? null : CONST_DECLARATION.exec(line);
    if (!fn && !constant) continue;
    // The header: up to the line that opens the body or ends the statement,
    // outside the parameter list (`opts: {` inside it opens a type).
    let head = i;
    let depth = 0;
    for (; head < lines.length; head++) {
      // A trailing `// note` does not end the line's code.
      const text = lines[head]!.replace(/\s+\/\/.*$/, "");
      depth += (text.match(/\(/g) ?? []).length;
      depth -= (text.match(/\)/g) ?? []).length;
      if (depth <= 0 && /(\{|=>|;|\})\s*$/.test(text)) break;
      if (head - i >= 200) break;
    }
    head = Math.min(head, lines.length - 1);
    const header = lines.slice(i, head + 1).join("\n");
    // An overload signature has no body: the implementation follows.
    const signatureOnly =
      fn && /;\s*$/.test(lines[head]!.replace(/\s+\/\/.*$/, ""));
    if ((constant && !FUNCTION_VALUE.test(header)) || signatureOnly) {
      i = head;
      continue;
    }
    let end = head;
    const last = lines[head]!.replace(/\s+\/\/.*$/, "");
    if (/\{\s*$/.test(last)) {
      end = head + 1;
      while (end < lines.length && !CLOSING.test(lines[end]!)) end++;
    } else if (/=>\s*$/.test(last)) {
      end = head + 1;
      // The expression ends on the `;` followed by a blank line, the end of
      // the file or the next top-level statement, however deep it indents.
      const ends = (k: number) =>
        /;\s*$/.test(lines[k]!) && !/^\s/.test(lines[k + 1] ?? "");
      while (end < lines.length && !ends(end) && !CLOSING.test(lines[end]!)) {
        end++;
      }
    }
    const name = (fn ?? constant)![1]!;
    found.push({
      name,
      file,
      line: i + 1,
      calls: callsIn(lines.slice(i, end + 1).join("\n"), name),
    });
    i = end;
  }
  return found;
}

// Calls too common to say anything about what a function does.
const COMMON_CALLS = new Set(
  (
    "if for while switch catch function return typeof await async super " +
    "import push map filter find some every reduce forEach then toString " +
    "get set has add delete join split slice includes keys values entries " +
    "from of isArray log debug info warn error t String Number Boolean Math " +
    "max min floor round ceil Date now Error Promise all resolve trim " +
    "replace test exec sort concat fill at padStart assign stringify parse " +
    "Map Set Array length indexOf " +
    // Canvas drawing: every card makes the same calls, whatever it draws.
    "fillRect strokeRect clearRect fillText strokeText measureText beginPath " +
    "closePath moveTo lineTo arc arcTo rect roundRect fill stroke clip save " +
    "restore translate rotate scale drawImage createLinearGradient " +
    "createRadialGradient addColorStop quadraticCurveTo bezierCurveTo"
  ).split(" ")
);

export function callsIn(body: string, self: string): Set<string> {
  const calls = new Set<string>();
  for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>)?\s*\(/g)) {
    const name = m[1]!;
    // Builder setters (`setLabel`, `addComponents`) say what is built, not
    // what for: every button, embed and row makes them.
    if (
      name === self ||
      COMMON_CALLS.has(name) ||
      /^(set|add)[A-Z]/.test(name)
    ) {
      continue;
    }
    calls.add(name);
  }
  return calls;
}

// Words a name is made of that do not tell what it is about.
const STOP_WORDS = new Set(
  (
    "get set is has to the for of a an by from with and or in on at new " +
    "create make build handle do run update fetch load compute find all can " +
    "should as if default data value values item items list info options " +
    "config result async"
  ).split(" ")
);

/** The meaningful words of a camelCase, PascalCase or snake_case name. */
export function nameWords(name: string): Set<string> {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_$]+/)
    .map((w) => w.toLowerCase())
    // Stop words first: "has" and "options" would lose their s otherwise.
    .filter((w) => !STOP_WORDS.has(w))
    .map((w) => w.replace(/(?<=..)s$/, ""))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

export const NAME_THRESHOLD = 0.8;
export const CALL_THRESHOLD = 0.6;

// How rare each word and each call is across the corpus: a word every other
// function name holds ("member", "channel") says little about a match.
const weightsCache = new WeakMap<
  FunctionInfo[],
  { word: Map<string, number>; call: Map<string, number> }
>();

function weightsOf(corpus: FunctionInfo[]) {
  let weights = weightsCache.get(corpus);
  if (weights) return weights;
  const wordCount = new Map<string, number>();
  const callCount = new Map<string, number>();
  for (const fn of corpus) {
    for (const w of nameWords(fn.name))
      wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
    for (const c of fn.calls) callCount.set(c, (callCount.get(c) ?? 0) + 1);
  }
  const idf = (counts: Map<string, number>) =>
    new Map(
      [...counts].map(([k, n]) => [k, Math.log((corpus.length + 1) / n)])
    );
  weights = { word: idf(wordCount), call: idf(callCount) };
  weightsCache.set(corpus, weights);
  return weights;
}

function weight(
  items: Iterable<string>,
  idf: Map<string, number>,
  unseen: number
): number {
  let total = 0;
  for (const item of items) total += idf.get(item) ?? unseen;
  return total;
}

/**
 * The functions of `corpus` most like `target`, best first, at most `limit`.
 * Words and calls count by their rarity in the corpus. A name matches when
 * the words both names share weigh `nameThreshold` of the heavier name; a
 * body when at least three calls are shared and they weigh `callThreshold`
 * of the lighter body's calls. The defaults were set on the bot's ~940
 * functions: lower, half of them got a hint, mostly from one common word.
 */
export function similarTo(
  target: FunctionInfo,
  corpus: FunctionInfo[],
  limit = 3,
  nameThreshold = NAME_THRESHOLD,
  callThreshold = CALL_THRESHOLD
): Candidate[] {
  const { word: wordIdf, call: callIdf } = weightsOf(corpus);
  const unseen = Math.log(corpus.length + 1);
  const words = nameWords(target.name);
  const targetWords = weight(words, wordIdf, unseen);
  const targetCalls = weight(target.calls, callIdf, unseen);
  const candidates: Candidate[] = [];
  for (const fn of corpus) {
    if (fn.file === target.file) continue;
    const theirs = nameWords(fn.name);
    const sharedWords = [...words].filter((w) => theirs.has(w));
    const heavier = Math.max(targetWords, weight(theirs, wordIdf, unseen));
    const nameScore =
      heavier > 0 ? weight(sharedWords, wordIdf, unseen) / heavier : 0;
    const sharedCalls = [...target.calls].filter((c) => fn.calls.has(c));
    const lighter = Math.min(targetCalls, weight(fn.calls, callIdf, unseen));
    const callScore =
      sharedCalls.length >= 3 && lighter > 0
        ? weight(sharedCalls, callIdf, unseen) / lighter
        : 0;
    if (nameScore < nameThreshold && callScore < callThreshold) continue;
    candidates.push({
      fn,
      sharedWords,
      sharedCalls: callScore >= callThreshold ? sharedCalls : [],
      score:
        Math.max(nameScore, callScore) + Math.min(nameScore, callScore) / 2,
    });
  }
  return candidates
    .sort(
      (a, b) =>
        b.score - a.score ||
        byCodePoint(a.fn.file, b.fn.file) ||
        a.fn.line - b.fn.line
    )
    .slice(0, limit);
}

export function describeCandidate(c: Candidate): string {
  const why: string[] = [];
  if (c.sharedWords.length > 0) why.push(`name: ${c.sharedWords.join(", ")}`);
  if (c.sharedCalls.length > 0) why.push(`calls: ${c.sharedCalls.join(", ")}`);
  return `${c.fn.name}  ${c.fn.file}:${c.fn.line}  ${why.join("; ")}`;
}

export function corpusOf(root: string): FunctionInfo[] {
  return sourceFiles(root).flatMap((file) => {
    const full = path.join(root, file);
    const source = readIfPresent(full);
    return source === null ? [] : functionsIn(file, source);
  });
}

/** What a Write or Edit call adds: its file and the new code, before and after. */
export interface ToolCall {
  file: string;
  before: string;
  after: string;
}

/**
 * The file and the code a hook payload's tool call changes, or null when it
 * is not a Write or Edit of a source file of the bot. `previous` reads the
 * committed version of a written file, so a rewrite does not count the
 * functions it already had as new.
 */
export function toolCallOf(
  payload: unknown,
  root: string,
  previous: (file: string) => string
): ToolCall | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { tool_name: tool, tool_input: input } = payload as {
    tool_name?: unknown;
    tool_input?: Record<string, unknown>;
  };
  if (typeof input?.["file_path"] !== "string") return null;
  const file = path.relative(root, path.resolve(root, input["file_path"]));
  if (!isSourceFile(file)) return null;
  if (tool === "Write" && typeof input["content"] === "string") {
    return { file, before: previous(file), after: input["content"] };
  }
  if (tool === "Edit" && typeof input["new_string"] === "string") {
    const before = input["old_string"];
    return {
      file,
      before: typeof before === "string" ? before : "",
      after: input["new_string"],
    };
  }
  return null;
}

/** The names of the functions `after` declares that `before` did not. */
export function newFunctions(call: ToolCall): string[] {
  const had = new Set(functionsIn(call.file, call.before).map((f) => f.name));
  return functionsIn(call.file, call.after)
    .map((f) => f.name)
    .filter((name) => !had.has(name));
}

export function hookReason(
  findings: { fn: FunctionInfo; candidates: Candidate[] }[]
): string {
  const parts = findings.map(
    ({ fn, candidates }) =>
      `\`${fn.name}\` (${fn.file}:${fn.line}) looks like existing code:\n` +
      candidates.map((c) => `  - ${describeCandidate(c)}`).join("\n")
  );
  return (
    parts.join("\n") +
    "\nRead each candidate before going on. If one already does this, or would with a small change " +
    "(a parameter, a move to #lib), use or extend it and delete the new function; " +
    "if you are moving one of them here, say so and carry on. " +
    "Otherwise say in one sentence why none fits, and carry on."
  );
}

/**
 * Where the hook remembers what it reported: one file per session, in the
 * checkout's own git directory (`.git/omnibot-find-similar/`), which belongs
 * to the user, rather than a shared temporary folder where another account
 * could plant a file or a link under a predictable name.
 */
export function stateFileFor(root: string, session: string): string {
  const key = crypto
    .createHash("sha256")
    .update(`${root}\n${session}`)
    .digest("hex")
    .slice(0, 16);
  return path.join(stateDirOf(root), key);
}

function stateDirOf(root: string): string {
  return execFileSync(
    "git",
    [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "omnibot-find-similar",
    ],
    { cwd: root, encoding: "utf8" }
  ).trim();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Removes the state files of sessions untouched for a day. */
function forgetOldSessions(dir: string): void {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return; // nothing remembered yet
  }
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      if (Date.now() - fs.statSync(full).mtimeMs > DAY_MS) fs.rmSync(full);
    } catch {
      // Gone already: removed by a concurrent session.
    }
  }
}

/**
 * The checkout an edited file belongs to, as git sees it (real path): a
 * sibling worktree or one under .claude/worktrees/, not only the session's
 * project directory.
 */
function checkoutOf(file: string): { root: string; file: string } | null {
  try {
    const real = fs.realpathSync(file);
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: path.dirname(real),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return { root, file: real };
  } catch {
    return null; // not in a git checkout, or gone
  }
}

/** The hook, on the JSON Claude Code sends; exported so tests run it in-process. */
export function hook(
  stdin: string,
  projectDir = process.env["CLAUDE_PROJECT_DIR"] ?? "."
): void {
  const payload: unknown = JSON.parse(stdin);
  const input = (payload as { tool_input?: { file_path?: unknown } } | null)
    ?.tool_input;
  if (typeof input?.file_path !== "string") return;
  // Most edits are docs, configs or tests: settle them before calling git.
  if (
    !isSourceFile(input.file_path.slice(input.file_path.lastIndexOf("src/")))
  ) {
    return;
  }
  const checkout = checkoutOf(path.resolve(projectDir, input.file_path));
  if (!checkout) return;
  const { root } = checkout;
  const call = toolCallOf(
    {
      ...(payload as object),
      tool_input: { ...input, file_path: checkout.file },
    },
    root,
    (file) => {
      try {
        return execFileSync("git", ["show", `HEAD:${file}`], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        return ""; // a new file
      }
    }
  );
  if (!call) return;
  const names = newFunctions(call);
  if (names.length === 0) return;

  // Once per function and session: a function kept after the hint stays.
  const id = (payload as { session_id?: unknown }).session_id;
  const session = typeof id === "string" ? id : "";
  const stateFile = stateFileFor(root, session);
  let remembered = "";
  try {
    remembered = fs.readFileSync(stateFile, "utf8");
  } catch {
    // First report of this session.
  }
  const reported = new Set(remembered.split("\n"));
  const fresh = names.filter((n) => !reported.has(`${call.file}#${n}`));
  if (fresh.length === 0) return;

  const corpus = corpusOf(root);
  const findings = corpus
    .filter((fn) => fn.file === call.file && fresh.includes(fn.name))
    .map((fn) => ({ fn, candidates: similarTo(fn, corpus) }))
    .filter((f) => f.candidates.length > 0);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  forgetOldSessions(path.dirname(stateFile));
  fs.appendFileSync(
    stateFile,
    fresh.map((n) => `${call.file}#${n}\n`).join("")
  );
  if (findings.length === 0) return;
  process.stdout.write(
    JSON.stringify({ decision: "block", reason: hookReason(findings) }) + "\n"
  );
}

/** The command, from `cwd`; exported so tests run it in-process. */
export function command(
  args: string[],
  cwd = process.env["INIT_CWD"] ?? process.cwd()
): number {
  const [target, ...names] = args;
  if (!target || target.startsWith("-")) {
    process.stderr.write(
      "usage: node scripts/find-similar.ts <file> [<function>...] | --hook\n"
    );
    return 2;
  }
  // Relative to where pnpm was called from; searched in the file's own
  // checkout, a sibling worktree included.
  const checkout = checkoutOf(path.resolve(cwd, target));
  if (!checkout) {
    process.stderr.write(`find-similar: no file ${target} in a git checkout\n`);
    return 2;
  }
  const { root } = checkout;
  const file = path.relative(root, checkout.file);
  const corpus = corpusOf(root);
  const own = functionsIn(file, fs.readFileSync(path.join(root, file), "utf8"));
  const unknown = names.filter((n) => !own.some((f) => f.name === n));
  if (unknown.length > 0) {
    process.stderr.write(
      `find-similar: ${file} declares no top-level function ${unknown.join(", ")}\n`
    );
    return 2;
  }
  for (const fn of own.filter(
    (f) => names.length === 0 || names.includes(f.name)
  )) {
    const candidates = similarTo(fn, corpus);
    if (candidates.length === 0) continue;
    process.stdout.write(
      `${fn.name}  ${fn.file}:${fn.line}\n` +
        candidates.map((c) => `  ${describeCandidate(c)}\n`).join("")
    );
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === "--hook") {
    // A hook that fails must not get in the way of the edit: report and pass.
    try {
      hook(fs.readFileSync(0, "utf8"));
    } catch (err) {
      process.stderr.write(`find-similar: ${String(err)}\n`);
    }
  } else {
    process.exitCode = command(args);
  }
}
