import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getEnv } from "./env";

/**
 * AES-256-GCM encrypt/decrypt for secrets-at-rest that the application must
 * be able to read back (2FA TOTP secret, provably-fair game seed before
 * reveal). Passwords and tokens are one-way hashed instead — never
 * encrypted — since we never need to recover them.
 */
function getKey(): Buffer {
  const env = getEnv();
  const key = Buffer.from(env.APP_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    // Dev convenience: derive a 32-byte key from whatever string was provided
    // rather than crash, but this path must never be hit in production.
    return createHash("sha256").update(env.APP_ENCRYPTION_KEY).digest();
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload.");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** SHA-256 hex digest — used for hashing refresh/reset tokens before storage. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
