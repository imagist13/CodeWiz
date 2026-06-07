/**
 * Knowledge Base Embedder
 *
 * Generates text embeddings via configurable AI Provider APIs and stores
 * the resulting vectors as JSON strings in the knowledge_entries table.
 * Similarity search is computed in-memory using cosine similarity.
 */

import fs from 'fs';
import path from 'path';
import type { ApiProvider } from '@/types';
import type { KnowledgeEntry } from './db';
import {
  upsertKnowledgeEntry,
  deleteKnowledgeEntriesByFile,
  getKnowledgeEntryByChunkId,
  getDb,
  getKnowledgeEntriesByWorkspace,
} from './db';
import { loadManifest, loadChunks } from './workspace-indexer';

export const KNOWLEDGE_EMBEDDING_MODEL_SETTING = 'knowledge_embedding_model';
export const KNOWLEDGE_EMBEDDING_PROVIDER_SETTING = 'knowledge_embedding_provider';
export const KNOWLEDGE_ENABLED_SETTING = 'knowledge_enabled';
export const KNOWLEDGE_THRESHOLD_SETTING = 'knowledge_injection_threshold';
export const KNOWLEDGE_LIMIT_SETTING = 'knowledge_limit';

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_EMBEDDING_DIMENSION = 1536;
export const DEFAULT_INJECTION_THRESHOLD = 0.65;
export const DEFAULT_KNOWLEDGE_LIMIT = 3;

// Known embedding model dimensions (most providers use OpenAI-compatible format)
export const KNOWN_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'text-embedding-ada-002-v2': 1536,
  'text-embedding-004': 768,
  'gemini-embedding-exp-03-07': 768,
  'gemini-embedding': 768,
  'embedding-3': 1024,
  'embedding-v3': 1024,
  'bge-m3': 1024,
  'm3e': 1536,
  'deepseek-embedding': 1024,
};

export function getEmbeddingDimension(model: string): number {
  return KNOWN_DIMENSIONS[model] ?? 1024;
}

// ---------------------------------------------------------------------------
// Embedding API caller
// ---------------------------------------------------------------------------

/**
 * Call the embedding endpoint of a provider.
 * Supports OpenAI-compatible `/embeddings` format.
 */
async function callEmbeddingApi(
  provider: ApiProvider,
  texts: string[],
  model: string,
): Promise<number[][]> {
  const baseUrl = provider.base_url.replace(/\/$/, '');
  const apiKey = provider.api_key;

  let extraHeaders: Record<string, string> = {};
  try {
    extraHeaders = JSON.parse(provider.headers_json || '{}');
  } catch { /* ignore */ }

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown error');
    throw new Error(
      `Embedding API error ${response.status}: ${text} (provider: ${provider.name})`
    );
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding: number[] }>;
    embeddings?: number[][];
  };

  if (Array.isArray(data.data)) {
    return data.data.map((d) => d.embedding);
  }
  if (Array.isArray(data.embeddings)) {
    return data.embeddings;
  }

  throw new Error(
    `Unexpected embedding response format from provider "${provider.name}". Expected { data: [{ embedding: float[] }] }.`
  );
}

// ---------------------------------------------------------------------------
// Core embedding pipeline
// ---------------------------------------------------------------------------

/**
 * Embed a batch of texts and store entries with vectors.
 */
async function embedAndStore(
  entries: KnowledgeEntry[],
  provider: ApiProvider,
  model: string,
): Promise<void> {
  const texts = entries.map((e) => e.text);
  const vectors = await callEmbeddingApi(provider, texts, model);

  if (vectors.length !== entries.length) {
    throw new Error(
      `Embedding count mismatch: got ${vectors.length}, expected ${entries.length}`
    );
  }

  for (let i = 0; i < entries.length; i++) {
    const entry: KnowledgeEntry = {
      ...entries[i],
      vector_json: JSON.stringify(vectors[i]),
    };
    upsertKnowledgeEntry(entry);
  }
}

/**
 * Re-index a workspace directory: walk the existing workspace chunks,
 * generate embeddings for new/updated files, and remove entries for deleted files.
 *
 * Returns the number of chunks indexed.
 */
export async function reindexWorkspace(
  dir: string,
  provider: ApiProvider,
  model: string,
  options?: { force?: boolean },
): Promise<{ fileCount: number; chunkCount: number }> {
  const force = options?.force ?? false;

  const manifest = loadManifest(dir);
  const allChunks = loadChunks(dir);

  // Build map: filePath → chunks
  const chunksByFile = new Map<string, typeof allChunks>();
  for (const chunk of allChunks) {
    const list = chunksByFile.get(chunk.path) ?? [];
    list.push(chunk);
    chunksByFile.set(chunk.path, list);
  }

  let chunkCount = 0;
  const dimension = getEmbeddingDimension(model);

  // Group all new/updated entries for batch embedding
  const pendingEntries: KnowledgeEntry[] = [];

  for (const [filePath, chunks] of chunksByFile) {
    const existingEntry = getKnowledgeEntryByChunkId(chunks[0].chunkId);

    const fullPath = path.join(dir, filePath);
    let mtimeMs = Date.now();
    try {
      mtimeMs = fs.statSync(fullPath).mtimeMs;
    } catch { /* file gone, skip */ }

    const isUpdated =
      force ||
      !existingEntry ||
      existingEntry.mtime_ms < mtimeMs ||
      existingEntry.embedding_model !== model;

    if (!isUpdated) {
      // Unchanged — count existing chunks
      chunkCount += chunks.length;
      continue;
    }

    for (const chunk of chunks) {
      const entry: KnowledgeEntry = {
        id: `${dir}::${chunk.chunkId}`,
        workspace_path: dir,
        file_path: filePath,
        heading: chunk.heading,
        text: chunk.text,
        chunk_id: chunk.chunkId,
        start_line: chunk.startLine,
        end_line: chunk.endLine,
        embedding_model: model,
        dimension,
        mtime_ms: mtimeMs,
        vector_json: '[]',
        created_at: new Date().toISOString(),
      };
      pendingEntries.push(entry);
    }
  }

  // Batch embed in groups of 50 to avoid token/timeout limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < pendingEntries.length; i += BATCH_SIZE) {
    const batch = pendingEntries.slice(i, i + BATCH_SIZE);
    await embedAndStore(batch, provider, model);
    chunkCount += batch.length;
  }

  // Remove entries for files no longer present in manifest
  const manifestChunkIds = new Set(allChunks.map((c) => c.chunkId));
  const storedEntries = getKnowledgeEntriesByWorkspace(dir);
  const deletedEntries = storedEntries.filter(
    (e) => !manifestChunkIds.has(e.chunk_id)
  );
  for (const entry of deletedEntries) {
    deleteKnowledgeEntriesByFile(dir, entry.file_path);
  }

  return { fileCount: chunksByFile.size, chunkCount };
}

// ---------------------------------------------------------------------------
// Public utility
// ---------------------------------------------------------------------------

/**
 * Embed a single text and return the vector.
 * Used for query embedding during search.
 */
export async function embedText(
  text: string,
  provider: ApiProvider,
  model: string,
): Promise<number[]> {
  const vectors = await callEmbeddingApi(provider, [text], model);
  return vectors[0];
}
