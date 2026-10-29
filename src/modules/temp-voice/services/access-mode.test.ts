import { describe, expect, it } from "vitest";
import { accessMode, isAccessMode, modeFlags } from "./access-mode.js";

describe("accessMode", () => {
  it("reads a hidden channel as private, locked or not", () => {
    expect(accessMode({ locked: false, hidden: false })).toBe("open");
    expect(accessMode({ locked: true, hidden: false })).toBe("invite");
    expect(accessMode({ locked: true, hidden: true })).toBe("private");
    expect(accessMode({ locked: false, hidden: true })).toBe("private");
  });

  it("round-trips through the stored flags", () => {
    for (const mode of ["open", "invite", "private"] as const) {
      expect(accessMode(modeFlags(mode))).toBe(mode);
    }
    expect(modeFlags("private")).toEqual({ locked: true, hidden: true });
  });

  it("rejects unknown modes", () => {
    expect(isAccessMode("invite")).toBe(true);
    expect(isAccessMode("lock")).toBe(false);
    expect(isAccessMode(undefined)).toBe(false);
  });
});
