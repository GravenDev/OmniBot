import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decrypt,
  encrypt,
  ENCRYPTED_PREFIX,
  encryptionKey,
  isEncrypted,
} from "./crypto.js";

const key = randomBytes(32).toString("base64");

describe("crypto", () => {
  beforeEach(() => {
    process.env["DATA_ENCRYPTION_KEY"] = key;
  });

  afterEach(() => {
    delete process.env["DATA_ENCRYPTION_KEY"];
  });

  it("round-trips a text through encryption", () => {
    const sealed = encrypt("héllo 👋");

    expect(sealed.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    expect(sealed).not.toContain("héllo");
    expect(decrypt(sealed)).toBe("héllo 👋");
  });

  it("uses a new nonce for every encryption", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("round-trips an empty text", () => {
    const sealed = encrypt("");

    expect(isEncrypted(sealed)).toBe(true);
    expect(decrypt(sealed)).toBe("");
  });

  it("returns a text stored before encryption as it is", () => {
    expect(decrypt("plain text")).toBe("plain text");
  });

  it("rejects a tampered value", () => {
    const sealed = encrypt("secret");
    const raw = Buffer.from(sealed.slice(ENCRYPTED_PREFIX.length), "base64");
    raw[raw.length - 1]! ^= 1;

    expect(() => decrypt(ENCRYPTED_PREFIX + raw.toString("base64"))).toThrow();
  });

  it("cannot read a value with another key", () => {
    const sealed = encrypt("secret");
    process.env["DATA_ENCRYPTION_KEY"] = randomBytes(32).toString("base64");

    expect(() => decrypt(sealed)).toThrow();
  });

  it("stores in clear without a key", () => {
    delete process.env["DATA_ENCRYPTION_KEY"];

    expect(encryptionKey()).toBeNull();
    expect(encrypt("secret")).toBe("secret");
  });

  it("refuses to read an encrypted value without a key", () => {
    const sealed = encrypt("secret");
    delete process.env["DATA_ENCRYPTION_KEY"];

    expect(() => decrypt(sealed)).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("rejects a key of the wrong length", () => {
    process.env["DATA_ENCRYPTION_KEY"] = randomBytes(16).toString("base64");

    expect(() => encryptionKey()).toThrow(/32 bytes/);
  });
});
