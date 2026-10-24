import { describe, expect, it } from "vitest";
import { parseHandle } from "./coc-admin.command.js";

const HANDLE = "41140793b2b34c8b62ebcb650e8b45c24694f07";

describe("parseHandle", () => {
  it("accepts a bare id or a link", () => {
    expect(parseHandle(` ${HANDLE.toUpperCase()} `)).toBe(HANDLE);
    expect(
      parseHandle(`https://www.codingame.com/clashofcode/clash/${HANDLE}`)
    ).toBe(HANDLE);
  });

  it("rejects anything else", () => {
    expect(parseHandle("not a clash")).toBeNull();
    expect(parseHandle("https://www.codingame.com/home")).toBeNull();
  });
});
