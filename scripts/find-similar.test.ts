import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callsIn,
  command,
  functionsIn,
  hook as runHook,
  hookReason,
  nameWords,
  newFunctions,
  similarTo,
  stateFileFor,
  toolCallOf,
  type FunctionInfo,
} from "./find-similar.js";
import { captureOutput, dropGitEnv, envWithoutGit } from "./test-support.js";

describe("functionsIn", () => {
  const source = [
    "export async function announce(",
    "  guild: Guild,",
    "): Promise<void> {",
    "  await postCard(guild);",
    "  helper();",
    "}",
    "",
    "const short = (a: number) => a + 1;",
    "",
    "export const fromArrow = async (id: string): Promise<void> => {",
    "  await fetchMember(id);",
    "};",
    "",
    "class Thing {",
    "  method() {",
    "    hidden();",
    "  }",
    "}",
    "const value = 3;",
  ].join("\n");

  it("finds top-level functions, their line and the calls of their body", () => {
    expect(
      functionsIn("src/a.ts", source).map((f) => [f.name, f.line, [...f.calls]])
    ).toEqual([
      ["announce", 1, ["postCard", "helper"]],
      ["short", 8, []],
      ["fromArrow", 10, ["fetchMember"]],
    ]);
  });
});

describe("functionsIn on other layouts", () => {
  it("reads an arrow whose body is on the next line, and split parameters", () => {
    const source = [
      "const times = (n: number) =>",
      "  Array.from({ length: n }, () => repeatOnce(n));",
      "",
      "export const retryAfter = (",
      "  headers: Headers,",
      "  fallback: number",
      "): number => {",
      "  return parseRetry(headers) ?? fallback;",
      "};",
      "",
      "const value = (await loadConfig()).limit;",
      "",
      "export function last() {",
      "  finish();",
      "}",
    ].join("\n");
    expect(
      functionsIn("src/a.ts", source).map((f) => [f.name, f.line, [...f.calls]])
    ).toEqual([
      ["times", 1, ["repeatOnce"]],
      ["retryAfter", 4, ["parseRetry"]],
      ["last", 13, ["finish"]],
    ]);
  });
});

describe("callsIn", () => {
  it("keeps telling calls, drops common ones and the function itself", () => {
    expect([
      ...callsIn(
        "f(); items.map(x); guild.members.fetch(); prisma.user.findMany<T>(); if (a) {}",
        "f"
      ),
    ]).toEqual(["fetch", "findMany"]);
  });
});

describe("functionsIn on harder layouts", () => {
  it("ends a multi-line expression body, reads generics and object-typed params, skips overloads", () => {
    const source = [
      "export const sign = (x: number) =>",
      "  x > 0",
      "    ? positive(x)",
      "    : negative(x);",
      "",
      "export const pick = <T,>(items: T[]): T => first(items);",
      "",
      "export const withOpts = (",
      "  opts: {",
      "    a: number;",
      "  },",
      ") => {",
      "  apply(opts);",
      "};",
      "",
      "export function compare(a: string): number;",
      "export function compare(a: number): number;",
      "export function compare(a: unknown): number {",
      "  return rank(a);",
      "}",
      "",
      "export function later() {",
      "  finish();",
      "}",
    ].join("\n");
    expect(
      functionsIn("src/a.ts", source).map((f) => [f.name, f.line, [...f.calls]])
    ).toEqual([
      ["sign", 1, ["positive", "negative"]],
      ["pick", 6, ["first"]],
      ["withOpts", 8, ["apply"]],
      ["compare", 18, ["rank"]],
      ["later", 22, ["finish"]],
    ]);
  });
});

describe("functionsIn on typed consts", () => {
  it("reads a const whose type is a function type", () => {
    const source = [
      "export const handle: (a: number) => void = (a) => {",
      "  doThing(a);",
      "};",
    ].join("\n");
    expect(functionsIn("src/a.ts", source).map((f) => f.name)).toEqual([
      "handle",
    ]);
  });
});

describe("functionsIn with a trailing comment", () => {
  it("reads a signature line ending in a comment", () => {
    const source = [
      "export function sync(a: A): void { // keep in sync with X",
      "  doThing(a);",
      "}",
    ].join("\n");
    expect(
      functionsIn("src/a.ts", source).map((f) => [f.name, [...f.calls]])
    ).toEqual([["sync", ["doThing"]]]);
  });
});

describe("callsIn on builders and canvas", () => {
  it("ignores builder setters and canvas drawing, which every card and button makes", () => {
    expect([
      ...callsIn(
        "new ButtonBuilder().setCustomId(id).setLabel(l).addComponents(row); ctx.fillRect(0, 0, w, h); ctx.beginPath(); drawAvatar(ctx);",
        "f"
      ),
    ]).toEqual(["ButtonBuilder", "drawAvatar"]);
  });
});

describe("nameWords", () => {
  it("splits names into meaningful words, singular", () => {
    expect([...nameWords("isChannelExcluded")]).toEqual([
      "channel",
      "excluded",
    ]);
    expect([...nameWords("getHTTPRetryDelays")]).toEqual([
      "http",
      "retry",
      "delay",
    ]);
    expect([...nameWords("load_all_members")]).toEqual(["member"]);
    // Stop words stay stop words whatever their last letter.
    expect([...nameWords("hasRole")]).toEqual(["role"]);
    expect([...nameWords("parseOptions")]).toEqual(["parse"]);
  });
});

function info(name: string, file: string, calls: string[] = []): FunctionInfo {
  return { name, file, line: 1, calls: new Set(calls) };
}

describe("similarTo", () => {
  const filler = Array.from({ length: 40 }, (_, i) =>
    info(`unrelated${i}Thing`, `src/f${i}.ts`, [`call${i}`])
  );

  it("finds a function of the same meaningful name elsewhere", () => {
    const target = info("addDays", "src/modules/a/x.ts");
    const corpus = [...filler, target, info("addDays", "src/lib/calendar.ts")];
    expect(similarTo(target, corpus).map((c) => c.fn.file)).toEqual([
      "src/lib/calendar.ts",
    ]);
  });

  it("finds a body making mostly the same calls under another name", () => {
    const calls = [
      "getConfigForModuleIn",
      "claimDay",
      "allMembers",
      "postCard",
    ];
    const target = info("celebrate", "src/modules/a/x.ts", calls);
    const corpus = [
      ...filler,
      target,
      info("runGuildDay", "src/modules/b/y.ts", [...calls, "drawCard"]),
    ];
    const [candidate] = similarTo(target, corpus);
    expect(candidate?.fn.name).toBe("runGuildDay");
    expect(candidate?.sharedCalls).toEqual(calls);
  });

  it("ignores one common word, fewer than three shared calls, and its own file", () => {
    const common = Array.from({ length: 20 }, (_, i) =>
      info(`member${i}Count`, `src/m${i}.ts`)
    );
    const target = info("memberBadge", "src/modules/a/x.ts", ["a", "b"]);
    const corpus = [
      ...filler,
      ...common,
      target,
      info("memberBadgeHelper", "src/modules/a/x.ts"),
      info("other", "src/modules/b/y.ts", ["a", "b"]),
    ];
    expect(similarTo(target, corpus)).toEqual([]);
  });
});

describe("toolCallOf and newFunctions", () => {
  const root = "/repo";
  const none = () => "";

  it("takes the functions an Edit adds", () => {
    const call = toolCallOf(
      {
        tool_name: "Edit",
        tool_input: {
          file_path: "/repo/src/modules/a/x.ts",
          old_string: "function kept() {\n  a();\n}\n",
          new_string:
            "function kept() {\n  a();\n}\n\nfunction added() {\n  b();\n}\n",
        },
      },
      root,
      none
    );
    expect(call?.file).toBe("src/modules/a/x.ts");
    expect(newFunctions(call!)).toEqual(["added"]);
  });

  it("compares a Write with the committed file", () => {
    const call = toolCallOf(
      {
        tool_name: "Write",
        tool_input: {
          file_path: "/repo/src/lib/x.ts",
          content: "export function old() {}\nexport function fresh() {}\n",
        },
      },
      root,
      () => "export function old() {}\n"
    );
    expect(newFunctions(call!)).toEqual(["fresh"]);
  });

  it("ignores tests, files outside src/ and other tools", () => {
    const edit = (file_path: string, tool_name = "Edit") => ({
      tool_name,
      tool_input: { file_path, old_string: "", new_string: "function f() {}" },
    });
    expect(toolCallOf(edit("/repo/src/a.test.ts"), root, none)).toBeNull();
    expect(toolCallOf(edit("/repo/scripts/a.ts"), root, none)).toBeNull();
    expect(toolCallOf(edit("/repo/src/a.ts", "Read"), root, none)).toBeNull();
    expect(toolCallOf(null, root, none)).toBeNull();
  });
});

describe("hookReason", () => {
  it("lists the candidates and asks to reuse one or say why not", () => {
    const fn = { ...info("addDays", "src/modules/a/x.ts"), line: 3 };
    const reason = hookReason([
      {
        fn,
        candidates: [
          {
            fn: { ...info("addDays", "src/lib/calendar.ts"), line: 111 },
            sharedWords: ["add", "day"],
            sharedCalls: [],
            score: 1,
          },
        ],
      },
    ]);
    expect(reason).toContain(
      "`addDays` (src/modules/a/x.ts:3) looks like existing code:\n" +
        "  - addDays  src/lib/calendar.ts:111  name: add, day"
    );
    expect(reason).toMatch(/say in one sentence why none fits/);
  });
});

describe("hook", () => {
  const script = path.join(import.meta.dirname, "find-similar.ts");
  let dir: string;

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  // GIT_DIR and friends, set when this runs under a git hook, would point
  // the fixture's commands at the real repository.
  const env = envWithoutGit();

  // In-process, so that coverage counts the hook and the command.
  beforeEach(dropGitEnv);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function hook(payload: object, projectDir = dir) {
    return captureOutput(() => runHook(JSON.stringify(payload), projectDir));
  }

  function fixture(content: string) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "find-similar-"));
    spawnSync("git", ["init", "-q"], { cwd: dir, env });
    fs.mkdirSync(path.join(dir, "src/lib"), { recursive: true });
    fs.mkdirSync(path.join(dir, "src/modules/a"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "src/lib/calendar.ts"),
      "export function addDays(day: string, n: number) {\n  return shift(day, n);\n}\n"
    );
    fs.writeFileSync(path.join(dir, "src/modules/a/x.ts"), content);
  }

  // State lives in the fixture's .git, removed with it.
  let sessions = 0;
  function session() {
    return `test-${++sessions}`;
  }

  it("works in another checkout than the session's project", () => {
    const content =
      "export function addDays(d: string, n: number) {\n  return d + n;\n}\n";
    fixture(content);
    const elsewhere = fs.mkdtempSync(
      path.join(os.tmpdir(), "find-similar-project-")
    );
    try {
      const r = hook(
        {
          session_id: session(),
          tool_name: "Write",
          tool_input: {
            file_path: path.join(dir, "src/modules/a/x.ts"),
            content,
          },
        },
        elsewhere
      );
      expect(r.stdout).toContain("addDays  src/lib/calendar.ts:1");
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("resolves a relative file path from the project directory", () => {
    const content =
      "export function addDays(d: string, n: number) {\n  return d + n;\n}\n";
    fixture(content);
    const r = hook(
      {
        session_id: session(),
        tool_name: "Write",
        tool_input: { file_path: "src/modules/a/x.ts", content },
      },
      dir
    );
    expect(r.stdout).toContain("addDays  src/lib/calendar.ts:1");
  });

  it("blocks once per session with the candidates, then stays quiet", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "find-similar-"));
    spawnSync("git", ["init", "-q"], { cwd: dir, env });
    fs.mkdirSync(path.join(dir, "src/lib"), { recursive: true });
    fs.mkdirSync(path.join(dir, "src/modules/a"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "src/lib/calendar.ts"),
      "export function addDays(day: string, n: number) {\n  return shift(day, n);\n}\n"
    );
    const content =
      "export function addDays(d: string, n: number) {\n  return d + n;\n}\n";
    fs.writeFileSync(path.join(dir, "src/modules/a/x.ts"), content);
    const payload = {
      session_id: session(),
      tool_name: "Write",
      tool_input: { file_path: path.join(dir, "src/modules/a/x.ts"), content },
    };

    const first = hook(payload);
    expect(first.status).toBe(0);
    const out = JSON.parse(first.stdout) as {
      decision: string;
      reason: string;
    };
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("addDays  src/lib/calendar.ts:1");

    const second = hook(payload);
    expect(second.stdout).toBe("");
  });

  it("keeps its state in the checkout's git directory, not a shared folder", () => {
    fixture("export const x = 1;\n");
    const root = fs.realpathSync(dir);
    expect(stateFileFor(root, "s")).toMatch(
      new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.git/`)
    );
  });

  it("clears the state files of sessions over a day old", () => {
    const content =
      "export function addDays(d: string, n: number) {\n  return d + n;\n}\n";
    fixture(content);
    const root = fs.realpathSync(dir);
    const states = path.dirname(stateFileFor(root, "any"));
    fs.mkdirSync(states, { recursive: true });
    const stale = path.join(states, "0000000000000000");
    const fresh = path.join(states, "1111111111111111");
    fs.writeFileSync(stale, "x");
    fs.writeFileSync(fresh, "x");
    const old = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    fs.utimesSync(stale, old, old);
    hook({
      session_id: "s",
      tool_name: "Write",
      tool_input: {
        file_path: path.join(dir, "src/modules/a/x.ts"),
        content,
      },
    });
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it("lists the look-alikes of a file's functions as a command", () => {
    fixture(
      "export function addDays(d: string, n: number) {\n  return d + n;\n}\n"
    );
    const r = captureOutput(() => command(["src/modules/a/x.ts"], dir));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("addDays  src/modules/a/x.ts:1");
    expect(r.stdout).toContain("addDays  src/lib/calendar.ts:1");
  });

  it("refuses a function the file does not declare, or no file", () => {
    fixture("export const x = 1;\n");
    expect(
      captureOutput(() => command(["src/modules/a/x.ts", "nope"], dir)).status
    ).toBe(2);
    expect(captureOutput(() => command([], dir)).status).toBe(2);
    expect(captureOutput(() => command(["missing.ts"], dir)).status).toBe(2);
  });

  // The real entry point, once: the hook as Claude Code runs it.
  it("never fails the edit on a bad payload", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "find-similar-"));
    const r = spawnSync(process.execPath, [script, "--hook"], {
      cwd: dir,
      input: "not json",
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/find-similar:/);
  });
});
