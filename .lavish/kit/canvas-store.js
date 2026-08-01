// canvas-store.js — IndexedDB Canvas-Store (K5)
// Speichert Epic-Canvas-Daten clientseitig. Kein Server-Need.
// Exportiert in openspec/changes/ bei Bedarf.

const DB_NAME = 'epic-canvas-store';
const DB_VERSION = 1;
const STORE_NAME = 'canvas';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'epicId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCanvas(epicId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(epicId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCanvas(entry) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put({
      ...entry,
      updatedAt: new Date().toISOString(),
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCanvases() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteCanvas(epicId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(epicId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// OF1: Prüft, ob openspec/changes/ seit dem letzten Export geändert wurde.
//
// Der Aufruf geht über window.data (adapter.js), nicht über ein eigenes fetch().
// E1 verlangt das, und hier zeigt sich auch warum: die Kit-Seiten werden von
// file:// geladen, ein relativer Pfad wie '/api/cockpit/…' hätte den Daemon auf
// 127.0.0.1:49152 also nie erreicht. Die Basis-URL kennt nur der Adapter.
//
// Ohne Adapter (z.B. im Unit-Test) ist die konservative Antwort `true`:
// "möglicherweise geändert" führt zur Rückfrage, `false` würde stillschweigend
// zum Überschreiben raten.
export async function hasExternalChanges(epicId, lastExportTs) {
  const adapter = typeof window !== 'undefined' ? window.data : undefined;
  if (!adapter || typeof adapter.epicChangesSince !== 'function') return true;

  try {
    const result = await adapter.epicChangesSince(epicId, lastExportTs);
    return result.hasChanges !== false;
  } catch {
    return true;
  }
}

export async function recordExport(epicId) {
  const entry = await getCanvas(epicId);
  if (!entry) return;
  await saveCanvas({ ...entry, lastExportAt: new Date().toISOString() });
}
