import * as crypto from 'crypto';

const ENCRYPTED_PREFIX = 'enc:';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';

/**
 * Derive a 32-byte key from any string using SHA-256.
 * If the input is already a 64-char hex string (32 bytes), use it directly.
 */
function deriveKey(key: string): Buffer {
  if (/^[0-9a-f]{64}$/i.test(key)) {
    return Buffer.from(key, 'hex');
  }
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: enc:<iv_hex>:<ciphertext_hex>:<authTag_hex>
 */
export function encrypt(plaintext: string, key: string): string {
  if (!key || !plaintext) return plaintext;

  const derivedKey = deriveKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypt a value encrypted with encrypt().
 * If the value is not encrypted (no enc: prefix), returns as-is.
 * If decryption fails (key changed), returns the raw value without crashing.
 */
export function decrypt(encryptedValue: string, key: string): string {
  if (!key || !encryptedValue || !isEncrypted(encryptedValue)) {
    return encryptedValue;
  }

  try {
    const parts = encryptedValue.slice(ENCRYPTED_PREFIX.length).split(':');
    if (parts.length !== 3) return encryptedValue;

    const [ivHex, ciphertext, authTagHex] = parts;
    const derivedKey = deriveKey(key);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // Key changed or data corrupted — return raw value
    return encryptedValue;
  }
}

/**
 * Check if a value is already encrypted (has enc: prefix).
 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypt the apiKey field in each API connection.
 * Idempotent: skips values already encrypted.
 * Graceful: if no key provided, returns data unchanged.
 */
export function encryptApiToolsCredentials<T extends { apiKey?: string }>(
  apiTools: T[],
  key: string,
): T[] {
  if (!key || !apiTools?.length) return apiTools;

  return apiTools.map((connection) => {
    if (!connection.apiKey || isEncrypted(connection.apiKey)) {
      return connection;
    }
    return {
      ...connection,
      apiKey: encrypt(connection.apiKey, key),
    };
  });
}

/**
 * Decrypt the apiKey field in each API connection.
 * Fallback: if value is not encrypted (plaintext), returns as-is.
 * Graceful: if no key provided, returns data unchanged.
 */
export function decryptApiToolsCredentials<T extends { apiKey?: string }>(
  apiTools: T[],
  key: string,
): T[] {
  if (!key || !apiTools?.length) return apiTools;

  return apiTools.map((connection) => {
    if (!connection.apiKey || !isEncrypted(connection.apiKey)) {
      return connection;
    }
    return {
      ...connection,
      apiKey: decrypt(connection.apiKey, key),
    };
  });
}
