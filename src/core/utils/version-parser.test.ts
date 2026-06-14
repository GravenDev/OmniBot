import { describe, expect, it } from "vitest";
import type { Version } from "#lib/version.js";
import parseVersion, { compareVersions } from "./version-parser.js";

const v = (s: string) => s as Version;

describe("parseVersion", () => {
  it("parses a valid version", () => {
    expect(parseVersion(v("1.2.3"))).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("parses zeros", () => {
    expect(parseVersion(v("0.0.0"))).toEqual({ major: 0, minor: 0, patch: 0 });
  });

  it("throws on missing patch segment", () => {
    expect(() => parseVersion(v("1.2"))).toThrow("Invalid version format: 1.2");
  });

  it("throws on extra segments", () => {
    expect(() => parseVersion(v("1.2.3.4"))).toThrow(
      "Invalid version format: 1.2.3.4"
    );
  });

  it("defaults non-numeric segments to 0", () => {
    expect(parseVersion(v("1.x.3"))).toEqual({ major: 1, minor: 0, patch: 3 });
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions(v("1.2.3"), v("1.2.3"))).toBe(0);
  });

  it("major takes priority over minor and patch", () => {
    expect(compareVersions(v("2.0.0"), v("1.9.9"))).toBeGreaterThan(0);
    expect(compareVersions(v("1.9.9"), v("2.0.0"))).toBeLessThan(0);
  });

  it("compares minor when major is equal", () => {
    expect(compareVersions(v("1.2.0"), v("1.1.9"))).toBeGreaterThan(0);
    expect(compareVersions(v("1.1.9"), v("1.2.0"))).toBeLessThan(0);
  });

  it("compares patch when major and minor are equal", () => {
    expect(compareVersions(v("1.2.3"), v("1.2.2"))).toBeGreaterThan(0);
    expect(compareVersions(v("1.2.2"), v("1.2.3"))).toBeLessThan(0);
  });
});
