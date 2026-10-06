import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts third-party credentials stored in the database (LINE channel secret / access token)
 * with AES-256-GCM. Key: SECRETS_KEY, else derived from JWT_SECRET — so a database dump alone
 * does not reveal them. Format: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
 */

function key(): Buffer {
  const raw = process.env.SECRETS_KEY?.trim() || process.env.JWT_SECRET?.trim();
  if (!raw) throw new Error("SECRETS_KEY or JWT_SECRET is required to store credentials");
  return createHash("sha256").update(`cangzhan-secret-box:${raw}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

/** null when empty, malformed, or sealed with another key. */
export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, data] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
