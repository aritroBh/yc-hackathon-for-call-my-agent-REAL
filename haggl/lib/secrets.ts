import crypto from "crypto";
import { logger } from "@/lib/logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const ITERATIONS = 600_000;
const DIGEST = "sha512";

let _masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (_masterKey) return _masterKey;
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error("ENCRYPTION_KEY environment variable is required for secret operations");
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_LENGTH) throw new Error(`ENCRYPTION_KEY must be ${KEY_LENGTH} hex bytes (got ${key.length})`);
  _masterKey = key;
  return _masterKey;
}

export function rotateKey(newHexKey: string): void {
  const newKey = Buffer.from(newHexKey, "hex");
  if (newKey.length !== KEY_LENGTH) throw new Error(`New key must be ${KEY_LENGTH} hex bytes`);
  process.env.ENCRYPTION_KEY = newHexKey;
  process.env.ENCRYPTION_KEY_PREVIOUS = _masterKey?.toString("hex") || "";
  _masterKey = newKey;
}

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  tag: string;
  version: number;
  created: string;
}

export function encryptSecret(plaintext: string, associatedData?: string): EncryptedPayload {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  if (associatedData) cipher.setAAD(Buffer.from(associatedData), { plaintextLength: Buffer.byteLength(plaintext) });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertext: encrypted.toString("base64"),
    tag: tag.toString("base64"),
    version: 1,
    created: new Date().toISOString(),
  };
}

export function decryptSecret(payload: EncryptedPayload, associatedData?: string): string {
  let key = getMasterKey();
  const prevHex = process.env.ENCRYPTION_KEY_PREVIOUS;

  if (payload.version !== 1) throw new Error(`Unsupported secret version: ${payload.version}`);

  const iv = Buffer.from(payload.iv, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const tag = Buffer.from(payload.tag, "base64");

  for (const k of [key, prevHex ? Buffer.from(prevHex, "hex") : null].filter(Boolean)) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, k as Buffer, iv, { authTagLength: TAG_LENGTH });
      decipher.setAuthTag(tag);
      if (associatedData) decipher.setAAD(Buffer.from(associatedData), { plaintextLength: ciphertext.length });
      return decipher.update(ciphertext) + decipher.final("utf8");
    } catch {}
  }
  throw new Error("Failed to decrypt secret: no valid key found");
}

export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString("hex");
}

export function hashSecretId(secretId: string): string {
  return crypto.createHash("sha256").update(secretId).digest("hex");
}

export interface SecretStoreEntry {
  id: string;
  name: string;
  encrypted: EncryptedPayload;
  updated_at: string;
  created_at: string;
  rotation_history?: string[];
}

const secretCache = new Map<string, { value: string; expires: number }>();
const CACHE_TTL_MS = 300_000;

function getCached(key: string): string | null {
  const entry = secretCache.get(key);
  if (entry && Date.now() < entry.expires) return entry.value;
  secretCache.delete(key);
  return null;
}

function setCache(key: string, value: string): void {
  secretCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

export async function getSecret(name: string, associatedData?: string): Promise<string> {
  const cached = getCached("sec:" + name);
  if (cached) return cached;

  const raw = process.env[name];
  if (raw) {
    setCache("sec:" + name, raw);
    return raw;
  }

  const encrypted = process.env["ENCRYPTED_" + name];
  if (!encrypted) throw new Error(`Secret "${name}" not found in env or ENCRYPTED_${name}`);

  let payload: EncryptedPayload;
  try { payload = JSON.parse(encrypted); } catch { throw new Error(`ENCRYPTED_${name} is not valid JSON`); }

  const value = decryptSecret(payload, associatedData);
  setCache("sec:" + name, value);
  return value;
}

export function clearSecretCache(name?: string): void {
  if (name) secretCache.delete("sec:" + name);
  else secretCache.clear();
}
