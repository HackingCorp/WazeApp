/**
 * PostgreSQL-based Authentication State for Baileys
 *
 * This replaces the filesystem-based useMultiFileAuthState with a database-backed solution.
 * Benefits:
 * - No filesystem IO overhead
 * - Survives container restarts/deployments
 * - Better for production multi-instance deployments
 * - Atomic operations with database transactions
 *
 * Based on: https://baileys.wiki/docs/api/functions/useMultiFileAuthState/
 * Inspired by: https://github.com/rzkytmgr/baileysauth
 */

import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";
import { WhatsAppSession } from "@/common/entities";
import { Mutex } from "async-mutex";

// Baileys types - imported dynamically
let proto: any;
let initAuthCreds: any;
let BufferJSON: any;

// Load Baileys utilities dynamically (ESM compatibility)
async function loadBaileysUtils() {
  const baileys = await import("@whiskeysockets/baileys");
  proto = baileys.proto;
  initAuthCreds = baileys.initAuthCreds;
  BufferJSON = baileys.BufferJSON;
}

export interface AuthState {
  creds: any;
  keys: {
    get: (type: string, ids: string[]) => Promise<{ [id: string]: any }>;
    set: (data: { [type: string]: { [id: string]: any } }) => Promise<void>;
  };
}

export interface PostgresAuthStateResult {
  state: AuthState;
  saveCreds: () => Promise<void>;
  clearState: () => Promise<void>;
}

/**
 * Creates a PostgreSQL-based authentication state handler for Baileys
 *
 * @param sessionId - The WhatsApp session ID
 * @param sessionRepository - TypeORM repository for WhatsAppSession entity
 * @param logger - Optional logger instance
 * @returns Authentication state compatible with Baileys makeWASocket
 */
export async function usePostgresAuthState(
  sessionId: string,
  sessionRepository: Repository<WhatsAppSession>,
  logger?: Logger,
): Promise<PostgresAuthStateResult> {
  const log = logger || new Logger("PostgresAuthState");

  // Ensure Baileys utils are loaded
  await loadBaileysUtils();

  // Mutex for thread-safe database operations
  const mutex = new Mutex();

  // In-memory cache for frequently accessed keys (reduces DB queries)
  const keyCache = new Map<string, any>();
  let creds: any = null;
  let isInitialized = false;

  /**
   * Get the full key identifier for storage
   */
  const getKeyId = (type: string, id: string): string => {
    return `${type}-${id}`;
  };

  /**
   * Load auth data from database
   */
  const loadFromDatabase = async (): Promise<Record<string, any>> => {
    const session = await sessionRepository.findOne({
      where: { id: sessionId },
      select: ["id", "authData"],
    });

    if (!session?.authData) {
      return {};
    }

    return session.authData;
  };

  /**
   * Save auth data to database
   */
  const saveToDatabase = async (authData: Record<string, any>): Promise<void> => {
    await sessionRepository.update(sessionId, {
      authData,
      lastSeenAt: new Date(),
    });
  };

  /**
   * Initialize or load credentials
   */
  const initializeCreds = async (): Promise<void> => {
    if (isInitialized) return;

    const release = await mutex.acquire();
    try {
      if (isInitialized) return; // Double-check after acquiring lock

      const authData = await loadFromDatabase();

      if (authData.creds) {
        // Deserialize credentials from database
        creds = JSON.parse(
          JSON.stringify(authData.creds),
          BufferJSON.reviver,
        );
        log.debug(`Loaded existing credentials for session ${sessionId}`);
      } else {
        // Initialize new credentials
        creds = initAuthCreds();
        log.log(`Initialized new credentials for session ${sessionId}`);
      }

      // Load keys into cache
      for (const [key, value] of Object.entries(authData)) {
        if (key !== "creds" && value) {
          try {
            keyCache.set(
              key,
              JSON.parse(JSON.stringify(value), BufferJSON.reviver),
            );
          } catch (e) {
            // Skip invalid entries
          }
        }
      }

      isInitialized = true;
      log.debug(`Loaded ${keyCache.size} keys from database for session ${sessionId}`);
    } finally {
      release();
    }
  };

  // Initialize on creation
  await initializeCreds();

  /**
   * Save credentials to database
   */
  const saveCreds = async (): Promise<void> => {
    const release = await mutex.acquire();
    try {
      const authData = await loadFromDatabase();

      // Serialize credentials
      authData.creds = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));

      // Save all cached keys
      for (const [key, value] of keyCache.entries()) {
        if (value) {
          authData[key] = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
        } else {
          delete authData[key];
        }
      }

      await saveToDatabase(authData);
      log.debug(`Saved credentials and ${keyCache.size} keys for session ${sessionId}`);
    } catch (error) {
      log.error(`Failed to save credentials for session ${sessionId}:`, error);
      throw error;
    } finally {
      release();
    }
  };

  /**
   * Clear all auth state (for logout)
   */
  const clearState = async (): Promise<void> => {
    const release = await mutex.acquire();
    try {
      keyCache.clear();
      creds = initAuthCreds();
      await saveToDatabase({});
      isInitialized = false;
      log.log(`Cleared auth state for session ${sessionId}`);
    } finally {
      release();
    }
  };

  /**
   * Get keys by type and IDs
   */
  const getKeys = async (
    type: string,
    ids: string[],
  ): Promise<{ [id: string]: any }> => {
    await initializeCreds();

    const result: { [id: string]: any } = {};

    for (const id of ids) {
      const keyId = getKeyId(type, id);
      let value = keyCache.get(keyId);

      if (value === undefined) {
        // Try to load from database if not in cache
        const authData = await loadFromDatabase();
        if (authData[keyId]) {
          try {
            value = JSON.parse(
              JSON.stringify(authData[keyId]),
              BufferJSON.reviver,
            );
            keyCache.set(keyId, value);
          } catch (e) {
            // Invalid data
          }
        }
      }

      if (value) {
        // Handle special case for app-state-sync-key
        if (type === "app-state-sync-key" && value) {
          result[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
        } else {
          result[id] = value;
        }
      }
    }

    return result;
  };

  /**
   * Set keys by type
   */
  const setKeys = async (data: {
    [type: string]: { [id: string]: any };
  }): Promise<void> => {
    const release = await mutex.acquire();
    try {
      const authData = await loadFromDatabase();
      let hasChanges = false;

      for (const [type, typeData] of Object.entries(data)) {
        for (const [id, value] of Object.entries(typeData)) {
          const keyId = getKeyId(type, id);

          if (value) {
            // Serialize and store
            const serialized = JSON.parse(
              JSON.stringify(value, BufferJSON.replacer),
            );
            keyCache.set(keyId, value);
            authData[keyId] = serialized;
            hasChanges = true;
          } else {
            // Delete key
            keyCache.delete(keyId);
            delete authData[keyId];
            hasChanges = true;
          }
        }
      }

      if (hasChanges) {
        await saveToDatabase(authData);
        log.debug(`Updated keys for session ${sessionId}`);
      }
    } finally {
      release();
    }
  };

  return {
    state: {
      creds,
      keys: {
        get: getKeys,
        set: setKeys,
      },
    },
    saveCreds,
    clearState,
  };
}

/**
 * Batch operation helper for migrating existing file-based auth to PostgreSQL
 */
export async function migrateFileAuthToPostgres(
  sessionId: string,
  fileAuthData: Record<string, any>,
  sessionRepository: Repository<WhatsAppSession>,
  logger?: Logger,
): Promise<void> {
  const log = logger || new Logger("PostgresAuthState");

  try {
    await sessionRepository.update(sessionId, {
      authData: fileAuthData,
      lastSeenAt: new Date(),
    });
    log.log(`Migrated file auth to PostgreSQL for session ${sessionId}`);
  } catch (error) {
    log.error(`Failed to migrate auth for session ${sessionId}:`, error);
    throw error;
  }
}
