/**
 * Knowledge Base Retrieval
 *
 * Semantic search over workspace knowledge using in-memory cosine similarity.
 * Works by:
 * 1. Embedding the user query using the configured AI provider
 * 2. Loading stored vectors from knowledge_entries
 * 3. Computing cosine similarity in JavaScript
 * 4. Returning top-K results with file context
 */

import type { ApiProvider } from '@/types';
import type { KnowledgeEntry } from './db';
import { getKnowledgeStats, getKnowledgeEntriesByWorkspace } from './db';
import { embedText, getEmbeddingDimension } from './knowledge-embedder';

export interface KnowledgeSearchResult {
  file_path: string;
  heading: string;
  snippet: string;
  score: number; // cosine similarity (0-1)
  start_line: number | null;
  end_line: number | null;
  chunk_id: string;
}

export interface KnowledgeStatsResult {
  count: number;
  dimension: number;
  embeddingModel: string;
  lastIndexed: string | null;
}

// ---------------------------------------------------------------------------
// Cosine similarity (in-memory)
// ---------------------------------------------------------------------------

function parseVector(json: string): number[] {
  try {
    return JSON.parse(json) as number[];
  } catch {
    return [];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

// ---------------------------------------------------------------------------
// Main search
// ---------------------------------------------------------------------------

/**
 * Perform semantic search over the workspace knowledge base.
 *
 * @param query           User query string
 * @param workspaceDir   The assistant workspace directory path
 * @param provider       The AI provider to use for embedding the query
 * @param model          The embedding model to use
 * @param options.limit   Max results to return (default 5)
 * @param options.threshold Min similarity score (0-1, default 0)
 */
export async function searchKnowledge(
  query: string,
  workspaceDir: string,
  provider: ApiProvider,
  model: string,
  options?: { limit?: number; threshold?: number },
): Promise<KnowledgeSearchResult[]> {
  if (!query.trim()) return [];

  const limit = options?.limit ?? 5;
  const threshold = options?.threshold ?? 0;

  // 1. Embed the query
  const queryVector = await embedText(query, provider, model);

  // 2. Load all stored vectors from DB
  const entries = getKnowledgeEntriesByWorkspace(workspaceDir);

  // 3. Score each entry by cosine similarity
  const scored: Array<{ entry: KnowledgeEntry; score: number }> = [];

  for (const entry of entries) {
    const vector = parseVector(entry.vector_json);
    if (vector.length === 0) continue;

    // Skip if dimension mismatch
    if (vector.length !== queryVector.length) continue;

    const score = cosineSimilarity(queryVector, vector);
    if (score >= threshold) {
      scored.push({ entry, score });
    }
  }

  // 4. Sort by score descending and take top-K
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  return top.map(({ entry, score }) => ({
    file_path: entry.file_path,
    heading: entry.heading,
    snippet: entry.text.slice(0, 300),
    score,
    start_line: entry.start_line,
    end_line: entry.end_line,
    chunk_id: entry.chunk_id,
  }));
}

/**
 * Get knowledge base statistics for a workspace.
 */
export function getKnowledgeStatsForWorkspace(workspaceDir: string): KnowledgeStatsResult {
  const stats = getKnowledgeStats(workspaceDir);
  return {
    count: stats.count,
    dimension: stats.dimension,
    embeddingModel: stats.embeddingModel,
    lastIndexed: stats.lastIndexed,
  };
}

/**
 * Format a search result as a markdown block to inject into the system prompt.
 */
export function formatKnowledgeForPrompt(
  results: KnowledgeSearchResult[],
  maxSnippetLen = 200,
): string {
  if (results.length === 0) return '';

  const blocks = results.map((r) => {
    const lineRange =
      r.start_line != null && r.end_line != null
        ? `:lines ${r.start_line}-${r.end_line}`
        : '';
    const snippet = r.snippet.length > maxSnippetLen
      ? r.snippet.slice(0, maxSnippetLen) + '...'
      : r.snippet;
    return `[file: ${r.file_path}${lineRange}]\n> ${snippet}`;
  });

  return `## Relevant Knowledge\n${blocks.join('\n\n')}`;
}
