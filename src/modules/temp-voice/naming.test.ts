import { describe, expect, it } from "vitest";
import { cleanName, parseUserLimit, renderName } from "./naming.js";

const member = { displayName: "Alice", user: { username: "alice42" } };

describe("renderName", () => {
  it("replaces the placeholders", () => {
    expect(renderName("Salon de {user} ({username})", member)).toBe(
      "Salon de Alice (alice42)"
    );
  });

  it("falls back to the display name and stays within 100 characters", () => {
    expect(renderName("   ", member)).toBe("Alice");
    expect(renderName("{user}".repeat(30), member)).toHaveLength(100);
  });
});

describe("cleanName", () => {
  it("collapses whitespace and rejects empty or too long names", () => {
    expect(cleanName("  a   b ")).toBe("a b");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("x".repeat(101))).toBeNull();
  });
});

describe("parseUserLimit", () => {
  it("accepts 0 to 99 only", () => {
    expect(parseUserLimit(" 0 ")).toBe(0);
    expect(parseUserLimit("99")).toBe(99);
    expect(parseUserLimit("100")).toBeNull();
    expect(parseUserLimit("-1")).toBeNull();
    expect(parseUserLimit("2.5")).toBeNull();
    expect(parseUserLimit("")).toBeNull();
  });
});
