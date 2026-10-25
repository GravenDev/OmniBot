import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const ENCRYPTED_PREFIX = "enc:v1:";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptionKey(): Buffer | null {
  const raw = process.env["DATA_ENCRYPTION_KEY"];
  if (!raw) {
    return null;
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `DATA_ENCRYPTION_KEY must be ${KEY_BYTES} bytes encoded in base64`
    );
  }
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function encrypt(plain: string): string {
  const key = encryptionKey();
  if (!key) {
    return plain;
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return (
    ENCRYPTED_PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")
  );
}

export function decrypt(value: string): string {
  if (!isEncrypted(value)) {
    return value;
  }
  const key = encryptionKey();
  if (!key) {
    throw new Error("DATA_ENCRYPTION_KEY is required to read encrypted data");
  }
  const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), "base64");
  const decipher = createDecipheriv(ALGORITHM, key, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
}
