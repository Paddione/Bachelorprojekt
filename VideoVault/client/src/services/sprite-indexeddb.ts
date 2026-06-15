export interface SpriteMeta {
  cols: number;
  frameWidth: number;
  frameHeight: number;
}

const DB_NAME = 'vv-sprites';
const DB_VERSION = 1;
const STORE = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open error'));
    } catch (e) {
      reject(e);
    }
  });
  return dbPromise;
}

export async function getSpriteMeta(id: string): Promise<SpriteMeta | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const val = req.result as { id: string; meta: SpriteMeta } | undefined;
        resolve(val?.meta || null);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB get error'));
    });
  } catch {
    return null;
  }
}

export async function setSpriteMeta(id: string, meta: SpriteMeta): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.put({ id, meta, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('IndexedDB put error'));
    });
  } catch {
    // ignore failures
  }
}


