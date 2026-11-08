import { describe, expect, it } from "vitest";
import { LogThrottle } from "./log-throttle.js";

describe("LogThrottle", () => {
  it("warns once per key and interval, then falls back to debug", () => {
    let now = 0;
    const throttle = new LogThrottle(1000, () => now);

    expect(throttle.level("a")).toBe("warn");
    expect(throttle.level("a")).toBe("debug");
    expect(throttle.level("b")).toBe("warn");

    now = 999;
    expect(throttle.level("a")).toBe("debug");
    now = 1000;
    expect(throttle.level("a")).toBe("warn");
  });

  it("forgets the oldest keys beyond its capacity", () => {
    const throttle = new LogThrottle(1000, () => 0);

    for (let i = 0; i <= 1000; i++) {
      throttle.level(`key-${i}`);
    }

    expect(throttle.level("key-0")).toBe("warn");
    expect(throttle.level("key-1000")).toBe("debug");
  });
});
