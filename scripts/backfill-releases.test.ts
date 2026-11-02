import { describe, expect, it } from "vitest";
import {
  actionFor,
  createArgs,
  editArgs,
  latestRelease,
  parseArgs,
} from "./backfill-releases.js";

describe("parseArgs", () => {
  it("is a dry run by default", () => {
    expect(parseArgs([])).toMatchObject({
      apply: false,
      draft: false,
      update: false,
      ai: false,
      out: null,
    });
  });

  it("reads the options", () => {
    expect(
      parseArgs([
        "--apply",
        "--draft",
        "--update",
        "--ai",
        "--out",
        "d",
        "--only",
        "v1.0.0,v1.1.0",
      ])
    ).toEqual({
      apply: true,
      draft: true,
      update: true,
      ai: true,
      out: "d",
      only: ["v1.0.0", "v1.1.0"],
    });
  });

  it("refuses --draft or --update without --apply", () => {
    expect(() => parseArgs(["--draft"])).toThrow(/--apply/);
    expect(() => parseArgs(["--update"])).toThrow(/--apply/);
    expect(() => parseArgs(["--tag"])).toThrow(/unknown argument/);
  });
});

describe("actionFor", () => {
  const existing = new Map([
    ["v0.7.0", false],
    ["v0.9.0", true],
  ]);

  it("creates what is missing and skips the rest unless asked to update", () => {
    expect(actionFor("v0.8.0", existing, false)).toBe("create");
    expect(actionFor("v0.7.0", existing, false)).toBe("skip");
    expect(actionFor("v0.7.0", existing, true)).toBe("update");
  });

  it("never updates a release whose notes hold text", () => {
    expect(actionFor("v0.9.0", existing, true)).toBe("skip");
  });
});

describe("gh arguments", () => {
  it("marks the highest release as Latest, prereleases aside", () => {
    expect(latestRelease(["v0.9.0", "v0.10.0", "v0.11.0-rc.1"])).toBe(
      "v0.10.0"
    );
  });

  it("never lets gh create a tag", () => {
    const args = createArgs("o/r", "v1.0.0-rc.1", "n.md", {
      draft: true,
      latest: false,
    });
    expect(args).toContain("--verify-tag");
    expect(args).toContain("--prerelease");
    expect(args).toContain("--draft");
    expect(args).toContain("--latest=false");
    expect(
      createArgs("o/r", "v1.0.0", "n.md", { draft: false, latest: true })
    ).not.toContain("--prerelease");
  });

  it("only replaces the notes of an existing release", () => {
    expect(editArgs("o/r", "v1.0.0", "n.md")).toEqual([
      "release",
      "edit",
      "v1.0.0",
      "--repo",
      "o/r",
      "--notes-file",
      "n.md",
    ]);
  });
});
