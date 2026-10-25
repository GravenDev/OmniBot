import { describe, expect, it } from "vitest";
import { tableHeight } from "./table.js";

describe("tableHeight", () => {
  it("adds one row per entry and room for an extra row below a separator", () => {
    expect(tableHeight(0)).toBe(64);
    expect(tableHeight(3)).toBe(64 + 3 * 58);
    expect(tableHeight(3, true)).toBe(64 + 4 * 58 + 14);
  });
});
