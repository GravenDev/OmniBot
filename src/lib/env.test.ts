import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDevMode } from "./env.js";

describe("isDevMode", () => {
  const original = process.env["NODE_ENV"];

  beforeEach(() => {
    delete process.env["NODE_ENV"];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = original;
    }
  });

  it("is true when NODE_ENV is development", () => {
    process.env["NODE_ENV"] = "development";
    expect(isDevMode()).toBe(true);
  });

  it.each(["production", "test", ""])(
    "is false when NODE_ENV is %j",
    (value) => {
      process.env["NODE_ENV"] = value;
      expect(isDevMode()).toBe(false);
    }
  );

  it("is false when NODE_ENV is unset", () => {
    expect(isDevMode()).toBe(false);
  });
});
