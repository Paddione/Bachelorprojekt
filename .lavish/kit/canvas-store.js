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

// OF1: Prüft, ob openspec/changes/ seit Export geändert wurde
export async function hasExternalChanges(epicId, lastExportTs) {
  try {
    const res = await fetch(`/api/cockpit/epics/${epicId}/changes-since?ts=${encodeURIComponent(lastExportTs)}`);
    if (!res.ok) return true;
    const data = await res.json();
    return data.hasChanges;
  } catch {
    return true;
  }
}

export async function recordExport(epicId) {
  const entry = await getCanvas(epicId);
  if (!entry) return;
  await saveCanvas({ ...entry, lastExportAt: new Date().toISOString() });
}
