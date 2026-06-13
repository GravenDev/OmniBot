import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devGuildId, isDevMode } from "./env.js";

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

describe("devGuildId", () => {
  const original = process.env["DEV_GUILD_ID"];

  afterEach(() => {
    if (original === undefined) {
      delete process.env["DEV_GUILD_ID"];
    } else {
      process.env["DEV_GUILD_ID"] = original;
    }
  });

  it("returns the DEV_GUILD_ID value", () => {
    process.env["DEV_GUILD_ID"] = "123456789";
    expect(devGuildId()).toBe("123456789");
  });

  it("returns undefined when DEV_GUILD_ID is unset", () => {
    delete process.env["DEV_GUILD_ID"];
    expect(devGuildId()).toBeUndefined();
  });
});
