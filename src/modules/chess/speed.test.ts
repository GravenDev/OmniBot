import { describe, expect, it } from "vitest";
import { formatTimeControl, speedOf } from "./speed.js";

describe("chess speed", () => {
  it("derives a speed from the base clock", () => {
    expect(speedOf("180+2")).toBe("blitz");
    expect(speedOf("600+5")).toBe("courte");
    expect(speedOf("1800+0")).toBe("rapide");
    expect(speedOf("3600+0")).toBe("classique");
  });

  it("trusts the API speed when given", () => {
    expect(speedOf("1800+0", "daily")).toBe("classique");
    expect(speedOf("?", "bullet")).toBe("bullet");
  });

  it("formats seconds as minutes", () => {
    expect(formatTimeControl("180+2")).toBe("3+2");
    expect(formatTimeControl("600+0")).toBe("10");
    expect(formatTimeControl("")).toBe("?");
  });
});
