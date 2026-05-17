import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is required");
  return deriveKey(key);
}

export interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

function encodeBase64(buf: Buffer): string {
  return buf.toString("base64url");
}

function decodeBase64(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

export function encryptFloorPrice(price: number): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = price.toFixed(2);
  let encrypted = cipher.update(plaintext, "utf8", "base64url");
  encrypted += cipher.final("base64url");
  const tag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    iv: encodeBase64(iv),
    tag: encodeBase64(tag),
    ciphertext: encrypted,
  };

  return JSON.stringify(payload);
}

export function decryptFloorPrice(encrypted: string): number {
  const key = getEncryptionKey();
  const payload: EncryptedPayload = JSON.parse(encrypted);

  const iv = decodeBase64(payload.iv);
  const tag = decodeBase64(payload.tag);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(payload.ciphertext, "base64url", "utf8");
  decrypted += decipher.final("utf8");

  return parseFloat(decrypted);
}

export function encryptFloorPriceSafe(
  price: number | null | undefined,
): string | null {
  if (price === null || price === undefined) return null;
  return encryptFloorPrice(price);
}

export function decryptFloorPriceSafe(
  encrypted: string | null | undefined,
): number | null {
  if (!encrypted) return null;
  try {
    return decryptFloorPrice(encrypted);
  } catch {
    return null;
  }
}
