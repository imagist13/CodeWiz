/**
 * IndexedDB-backed message cache per conversation.
 * More reliable than localStorage: larger capacity, async, survives tab close.
 */

export type CachedMessage = {
  id: string;
  role: string;
  content: string;
  tool_calls?: unknown;
  created_at?: string;
};

const DB_NAME = "codewiz-db";
const DB_VERSION = 1;
const STORE_NAME = "messages";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "conversationId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readRecord(conversationId: string): Promise<CachedMessage[] | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(conversationId);
    req.onsuccess = () => {
      const record = req.result as { messages: CachedMessage[] } | undefined;
      console.log("[IDB] readRecord(", conversationId, ") →", record?.messages?.length ?? 0, "messages");
      db.close();
      resolve(record?.messages ?? null);
    };
    req.onerror = () => {
      console.error("[IDB] readRecord error:", req.error);
      db.close();
      reject(req.error);
    };
  });
}

async function writeRecord(conversationId: string, messages: CachedMessage[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({ conversationId, messages });
    req.onsuccess = () => {
      console.log("[IDB] writeRecord(", conversationId, ") → wrote", messages.length, "messages ✓");
      db.close();
      resolve();
    };
    req.onerror = () => {
      console.error("[IDB] writeRecord error:", req.error);
      db.close();
      reject(req.error);
    };
  });
}

async function deleteRecord(conversationId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(conversationId);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getCachedMessages(conversationId: string): Promise<CachedMessage[] | null> {
  if (typeof window === "undefined") return null;
  try {
    return await readRecord(conversationId);
  } catch (e) {
    console.error("[IDB] getCachedMessages error:", e);
    return null;
  }
}

export async function setCachedMessages(
  conversationId: string,
  messages: CachedMessage[],
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await writeRecord(conversationId, messages);
  } catch (e) {
    console.error("[IDB] setCachedMessages error:", e);
  }
}

export async function appendCachedMessage(
  conversationId: string,
  message: CachedMessage,
): Promise<void> {
  const existing = (await getCachedMessages(conversationId)) ?? [];
  await setCachedMessages(conversationId, [...existing, message]);
}

export async function clearCachedMessages(conversationId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try { await deleteRecord(conversationId); } catch { /* ignore */ }
}

/** Sync fallback: read from localStorage (migration) */
export function getCachedMessagesSync(conversationId: string): CachedMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`codewiz:messages:${conversationId}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedMessage[];
  } catch {
    return null;
  }
}
