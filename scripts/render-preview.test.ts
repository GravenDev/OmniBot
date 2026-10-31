import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "render-preview-test-"));
    const result = run(
      preview,
      "--before",
      before,
      "--only",
      "profile",
      "--out",
      out
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(fs.readdirSync(out).sort()).toEqual([
      "profile-after.png",
      "profile-before.png",
    ]);
    expect(result.stdout.trim().split("\n")).toEqual([
      path.join(out, "profile-after.png"),
      path.join(out, "profile-before.png"),
    ]);
    expect(worktrees()).not.toContain("render-preview-");
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
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "render-preview-test-"));
    const result = run(preview, "--only", "nope", "--out", out);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no preview named nope");
    expect(fs.readdirSync(out)).toEqual([]);
  }, 30_000);

  it("refuses a missing file before drawing anything", () => {
    const result = run("src/nope.preview.ts");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("src/nope.preview.ts not found");
  });
});
