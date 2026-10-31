import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { outputName, parseArgs } from "./render-preview.js";

describe("parseArgs", () => {
  it("takes the preview file and defaults the rest", () => {
    expect(parseArgs(["a/report.preview.ts"])).toEqual({
      file: "a/report.preview.ts",
      before: null,
      out: path.join(os.tmpdir(), "render-preview"),
      only: null,
    });
  });

  it("reads the options wherever they stand", () => {
    expect(
      parseArgs([
        "--before",
        "origin/master",
        "a/report.preview.ts",
        "--out",
        "shots",
        "--only",
        "report",
      ])
    ).toEqual({
      file: "a/report.preview.ts",
      before: "origin/master",
      out: "shots",
      only: "report",
    });
  });

  it.each([
    [[], /usage/],
    [["a/report.ts"], /not a \.preview\.ts file/],
    [["a.preview.ts", "b.preview.ts"], /one preview file at a time/],
    [["a.preview.ts", "--before"], /--before needs a value/],
    [["a.preview.ts", "--out", "--only", "x"], /--out needs a value/],
    [["a.preview.ts", "--after", "x"], /unknown option --after/],
  ])("refuses %j", (args, message) => {
    expect(() => parseArgs(args)).toThrow(message);
  });
});

describe("outputName", () => {
  it("names the image after the preview and the side", () => {
    expect(outputName("report", "before")).toBe("report-before.png");
    expect(outputName("without members/2", "after")).toBe(
      "without-members-2-after.png"
    );
  });
});

// Every folder a test makes in the temporary directory, removed after it.
const made: string[] = [];
function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("render-preview", () => {
  const script = fileURLToPath(new URL("./render-preview.ts", import.meta.url));
  const preview =
    "src/modules/four-hour-game/rendering/profile-card.preview.ts";

  function run(...args: string[]) {
    return spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
    });
  }

  function worktrees(): string {
    return execFileSync("git", ["worktree", "list"], { encoding: "utf8" });
  }

  function hasCommit(ref: string): boolean {
    return spawnSync("git", ["cat-file", "-e", `${ref}^{commit}`]).status === 0;
  }

  function drawPair(before: string) {
    // Compared with the list before the run: a worktree left by another run
    // (a stopped one) is not this run's.
    const existing = worktrees();
    const out = tempDir("render-preview-test-");
    const result = run(
      preview,
      "--before",
      before,
      "--only",
      "profile",
      "--out",
      out
    );
    expect(result.stderr).toMatch(/^worktree: .*render-preview-\S+\n$/);
    expect(result.status).toBe(0);
    expect(fs.readdirSync(out).sort()).toEqual([
      "profile-after.png",
      "profile-before.png",
    ]);
    expect(result.stdout.trim().split("\n")).toEqual([
      path.join(out, "profile-after.png"),
      path.join(out, "profile-before.png"),
      // The renderer did not change between the two sides.
      "identical: profile",
    ]);
    expect(worktrees()).toBe(existing);
  }

  it("draws both sides and removes the temporary worktree", () => {
    drawPair("HEAD");
  }, 60_000);

  // 693ff95 predates #lib/preview: the copied helper is what lets it draw.
  // CI clones one commit deep, so this runs where the history is.
  it.skipIf(!hasCommit("693ff95"))(
    "draws on a commit that predates the preview helpers",
    () => {
      drawPair("693ff95");
    },
    60_000
  );

  it("fails when nothing is drawn", () => {
    const out = tempDir("render-preview-test-");
    const result = run(preview, "--only", "nope", "--out", out);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no preview named nope");
    expect(fs.readdirSync(out)).toEqual([]);
  }, 30_000);

  it("fails an entry the data draws as undefined on the other commit", () => {
    const out = tempDir("render-preview-test-");
    // Inside the repository, as the script requires, but out of src/: a
    // concurrent tsc must not pick it up.
    const dir = fs.mkdtempSync(
      path.join(
        path.dirname(script),
        "..",
        "node_modules",
        ".render-preview-test-"
      )
    );
    const file = path.join(dir, "undefined.preview.ts");
    fs.writeFileSync(
      file,
      'import { createCanvas } from "@napi-rs/canvas";\n' +
        "export default { broken: async () => {\n" +
        "  const canvas = createCanvas(10, 10);\n" +
        '  canvas.getContext("2d").fillText(`${({} as { x?: string }).x} km`, 0, 0);\n' +
        '  return canvas.encode("png");\n} };\n'
    );
    try {
      const result = run(file, "--out", out);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'after: broken failed: draws "undefined km"'
      );
      expect(fs.readdirSync(out)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  }, 30_000);

  it("refuses a preview file outside the repository", () => {
    const dir = tempDir("render-preview-test-");
    const file = path.join(dir, "x.preview.ts");
    fs.writeFileSync(file, "export default {};\n");
    const result = run(file);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("is outside the repository");
  });

  it.each([
    ["another name", () => fs.mkdtempSync(path.join(os.tmpdir(), "not-ours-"))],
    [
      "a folder named like ours, not a worktree",
      () => fs.mkdtempSync(path.join(os.tmpdir(), "render-preview-")),
    ],
    [
      "a folder named like ours, outside the temporary directory",
      () =>
        fs.mkdtempSync(
          path.join(
            path.dirname(script),
            "..",
            "node_modules",
            "render-preview-"
          )
        ),
    ],
  ])("refuses to clean %s, and leaves it", (_, make) => {
    const dir = make();
    fs.writeFileSync(path.join(dir, "work"), "");
    try {
      const result = run("--clean", dir);
      expect(result.status).toBe(2);
      expect(fs.existsSync(path.join(dir, "work"))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("refuses to clean a worktree on a branch, with its uncommitted work", () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "render-preview-"));
    execFileSync("git", [
      "worktree",
      "add",
      "--quiet",
      "-b",
      `test-${path.basename(tree)}`,
      tree,
      "HEAD",
    ]);
    fs.writeFileSync(path.join(tree, "uncommitted.txt"), "");
    try {
      const result = run("--clean", tree);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("is not a detached worktree");
      expect(fs.existsSync(path.join(tree, "uncommitted.txt"))).toBe(true);
    } finally {
      execFileSync("git", ["worktree", "remove", "--force", tree]);
      execFileSync("git", ["branch", "-D", `test-${path.basename(tree)}`]);
    }
  }, 30_000);

  it("refuses a relative path", () => {
    const result = run("--clean", "render-preview-abcdef");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("give the absolute path");
  });

  it("removes a leftover worktree without touching what it links to", () => {
    const existing = worktrees();
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "render-preview-"));
    execFileSync("git", [
      "worktree",
      "add",
      "--detach",
      "--quiet",
      tree,
      "HEAD",
    ]);
    const target = tempDir("render-preview-target-");
    fs.writeFileSync(path.join(target, "keep"), "");
    fs.symlinkSync(target, path.join(tree, "node_modules"), "junction");
    const result = run("--clean", tree);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(fs.existsSync(tree)).toBe(false);
    expect(fs.existsSync(path.join(target, "keep"))).toBe(true);
    expect(worktrees()).toBe(existing);
  }, 30_000);

  it("refuses a missing file before drawing anything", () => {
    const result = run("src/nope.preview.ts");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("src/nope.preview.ts not found");
  });
});
