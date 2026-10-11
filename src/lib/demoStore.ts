import type { AppData } from "./types";

const DATABASE_NAME = "barbercruz-demo";
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "current";
type Snapshot = AppData & { _demoRevision?: string };

const storageError = () =>
  new Error(
    "La demo necesita almacenamiento del navegador. Actívalo para guardar los cambios.",
  );

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(storageError());
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    let rejected = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onerror = () => reject(storageError());
    request.onblocked = () => {
      rejected = true;
      reject(storageError());
    };
    request.onsuccess = () => {
      if (rejected) request.result.close();
      else resolve(request.result);
    };
  });
}

/**
 * IndexedDB serializes validation and writes across tabs. Web Locks alone do
 * not make each renderer's localStorage cache immediately reflect a write.
 */
export async function mutateDemoStore(
  readLocal: () => AppData,
  change: (fresh: AppData) => AppData,
): Promise<AppData> {
  const database = await openDatabase();
  try {
    return await new Promise<AppData>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      let next: Snapshot;
      let failure: unknown;
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = () => reject(failure ?? storageError());
      transaction.onerror = () => {
        failure ??= storageError();
      };
      const request = store.get(SNAPSHOT_KEY);
      request.onsuccess = () => {
        try {
          const latest = request.result as Snapshot | undefined;
          const local = readLocal() as Snapshot;
          // Matching revisions allow deliberate edits to the local mirror.
          // An older cached revision must never overwrite a newer transaction.
          const fresh =
            !latest || local._demoRevision === latest._demoRevision
              ? local
              : latest;
          next = { ...change(fresh), _demoRevision: crypto.randomUUID() };
          store.put(next, SNAPSHOT_KEY);
        } catch (err) {
          failure = err;
          transaction.abort();
        }
      };
    });
  } finally {
    database.close();
  }
}

export async function clearDemoStore(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(storageError());
      transaction.objectStore(STORE_NAME).clear();
    });
  } finally {
    database.close();
  }
}
