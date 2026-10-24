import { describe, expect, it } from "vitest";
import { MAX_LINKS, parseClashLinks } from "./links.js";

const HANDLE = "41140793b2b34c8b62ebcb650e8b45c24694f07";
const link = (handle: string) =>
  `https://www.codingame.com/clashofcode/clash/${handle}`;

describe("parseClashLinks", () => {
  it("finds a link anywhere in the message", () => {
    expect(parseClashLinks(`on joue ? ${link(HANDLE)} venez`)).toEqual([
      HANDLE,
    ]);
  });

  it("accepts report links, no www and upper case", () => {
    expect(
      parseClashLinks(
        `https://codingame.com/clashofcode/clash/report/${HANDLE.toUpperCase()}`
      )
    ).toEqual([HANDLE]);
  });

  it("ignores links in code or under a spoiler", () => {
    expect(
      parseClashLinks(`\`${link(HANDLE)}\` ||${link("a".repeat(40))}||`)
    ).toEqual([]);
  });

  it("drops duplicates and stops at the limit", () => {
    const handles = ["a", "b", "c", "d"].map((c) => c.repeat(40));
    const content = [HANDLE, HANDLE, ...handles].map(link).join(" ");
    expect(parseClashLinks(content)).toEqual(
      [HANDLE, ...handles].slice(0, MAX_LINKS)
    );
  });

  it("rejects ids that are too short or followed by more characters", () => {
    expect(parseClashLinks(link("abc123"))).toEqual([]);
    expect(parseClashLinks(`${link(HANDLE)}zz`)).toEqual([]);
  });

  it("ignores other CodinGame pages", () => {
    expect(
      parseClashLinks(`https://www.codingame.com/profile/${HANDLE}`)
    ).toEqual([]);
  });
});
