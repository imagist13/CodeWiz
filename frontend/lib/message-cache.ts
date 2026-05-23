/**
 * localStorage-backed message cache per conversation.
 * Guarantees instant UI population without waiting for server fetch.
 */

export type CachedMessage = {
  id: string;
  role: string;
  content: string;
  tool_calls?: unknown;
  created_at?: string;
};

const CACHE_PREFIX = "codewiz:messages:";

function cacheKey(conversationId: string) {
  return `${CACHE_PREFIX}${conversationId}`;
}

/** Read cached messages synchronously — always returns in < 1ms */
export function getCachedMessages(conversationId: string): CachedMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(conversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMessage[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Write messages to cache */
export function setCachedMessages(conversationId: string, messages: CachedMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(conversationId), JSON.stringify(messages));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

/** Append a single message to the cache */
export function appendCachedMessage(conversationId: string, message: CachedMessage) {
  const existing = getCachedMessages(conversationId) ?? [];
  setCachedMessages(conversationId, [...existing, message]);
}

/** Clear cache for a conversation */
export function clearCachedMessages(conversationId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(cacheKey(conversationId));
}
