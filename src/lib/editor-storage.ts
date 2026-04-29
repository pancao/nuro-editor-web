import type { EditOperation, ImageAsset } from "@/lib/types";

export type PersistedEditorSession = {
  originalImage: ImageAsset | null;
  currentImage: ImageAsset | null;
  history: EditOperation[];
  historyIndex: number;
};

const DB_NAME = "nuro-editor";
const STORE_NAME = "sessions";
const SESSION_KEY = "current";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveEditorSession(session: PersistedEditorSession) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(session, SESSION_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadEditorSession(): Promise<PersistedEditorSession | null> {
  const db = await openDb();
  const session = await new Promise<PersistedEditorSession | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(SESSION_KEY);
    request.onsuccess = () => resolve((request.result as PersistedEditorSession) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return session;
}
