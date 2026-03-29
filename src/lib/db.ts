/**
 * IndexedDB wrapper for PhotoForge persistent storage.
 *
 * Stores: songs, projects, presets, settings
 * No external dependencies — uses raw IndexedDB API.
 */

const DB_NAME = 'photoforge-db';
const DB_VERSION = 1;

export const STORES = {
  songs: 'songs',
  projects: 'projects',
  presets: 'presets',
  settings: 'settings',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

// ---------------------------------------------------------------------------
// Database singleton
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Songs store
        if (!db.objectStoreNames.contains(STORES.songs)) {
          const songStore = db.createObjectStore(STORES.songs, { keyPath: 'id' });
          songStore.createIndex('name', 'name', { unique: false });
          songStore.createIndex('dateAdded', 'dateAdded', { unique: false });
          songStore.createIndex('source', 'source', { unique: false });
        }

        // Projects store
        if (!db.objectStoreNames.contains(STORES.projects)) {
          const projectStore = db.createObjectStore(STORES.projects, { keyPath: 'id' });
          projectStore.createIndex('name', 'name', { unique: false });
          projectStore.createIndex('createdAt', 'createdAt', { unique: false });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          projectStore.createIndex('templateId', 'templateId', { unique: false });
        }

        // Presets store (for template mixer custom presets)
        if (!db.objectStoreNames.contains(STORES.presets)) {
          const presetStore = db.createObjectStore(STORES.presets, { keyPath: 'id' });
          presetStore.createIndex('name', 'name', { unique: false });
          presetStore.createIndex('basedOn', 'basedOn', { unique: false });
        }

        // Settings store (key-value pairs)
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

// ---------------------------------------------------------------------------
// Generic CRUD helpers
// ---------------------------------------------------------------------------

/** Get a single record by key */
export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Get all records from a store */
export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** Get all records from an index, sorted */
export async function dbGetAllByIndex<T>(
  store: StoreName,
  indexName: string,
  direction: IDBCursorDirection = 'prev',
): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const index = tx.objectStore(store).index(indexName);
    const req = index.openCursor(null, direction);
    const results: T[] = [];

    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        results.push(cursor.value as T);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** Put (upsert) a record */
export async function dbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Delete a record by key */
export async function dbDelete(store: StoreName, key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Count records in a store */
export async function dbCount(store: StoreName): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Clear all records from a store */
export async function dbClear(store: StoreName): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Search records by name (case-insensitive contains) */
export async function dbSearch<T extends { name: string }>(
  store: StoreName,
  query: string,
): Promise<T[]> {
  const all = await dbGetAll<T>(store);
  const q = query.toLowerCase().trim();
  if (!q) return all;
  return all.filter((item) => item.name.toLowerCase().includes(q));
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const result = await dbGet<{ key: string; value: T }>(STORES.settings, key);
  return result ? result.value : defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await dbPut(STORES.settings, { key, value });
}

// ---------------------------------------------------------------------------
// Storage usage estimate
// ---------------------------------------------------------------------------

export async function getStorageEstimate(): Promise<{
  used: number;
  quota: number;
  percent: number;
}> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      return {
        used,
        quota,
        percent: quota > 0 ? Math.round((used / quota) * 100) : 0,
      };
    }
  } catch {
    // Storage API not available
  }
  return { used: 0, quota: 0, percent: 0 };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
