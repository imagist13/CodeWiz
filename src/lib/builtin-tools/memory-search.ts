/**
 * builtin-tools/memory-search.ts — Workspace memory search tools (shared).
 */

import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export const MEMORY_SEARCH_SYSTEM_PROMPT = `## 记忆检索

**每次对话的第一轮，必须先调用 codepilot_memory_recent 回顾最近记忆。**

- codepilot_memory_search: 搜索工作区记忆
- codepilot_memory_get: 读取指定记忆文件
- codepilot_memory_recent: 获取最近记忆摘要`;

export function createMemorySearchTools(workspacePath: string) {
  return {
    codepilot_memory_search: tool({
      description: 'Search assistant workspace memory files with keyword matching.',
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        tags: z.array(z.string()).optional(),
        file_type: z.enum(['all', 'daily', 'longterm', 'notes']).optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ query, tags, file_type, limit }) => {
        try {
          const { searchWorkspace } = await import('@/lib/workspace-retrieval');
          const results = await searchWorkspace(workspacePath, query, {
            limit: limit || 5,
          });
          if (!results || results.length === 0) return 'No matching memories found.';
          return results.map((r: { path: string; snippet: string; score: number }) =>
            `**${r.path}** (score: ${r.score.toFixed(2)})\n${r.snippet}`
          ).join('\n\n');
        } catch (err) { return `Search failed: ${err instanceof Error ? err.message : 'unknown'}`; }
      },
    }),

    codepilot_memory_get: tool({
      description: 'Read a specific file from the assistant workspace.',
      inputSchema: z.object({
        file_path: z.string().describe('Path relative to workspace'),
        line_start: z.number().optional(),
        line_end: z.number().optional(),
      }),
      execute: async ({ file_path, line_start, line_end }) => {
        try {
          const fullPath = path.resolve(workspacePath, file_path);
          // Security: ensure path is within workspace
          if (!fullPath.startsWith(path.resolve(workspacePath))) {
            return 'Error: Path is outside workspace.';
          }
          if (!fs.existsSync(fullPath)) return `File not found: ${file_path}`;
          let content = fs.readFileSync(fullPath, 'utf-8');
          if (line_start !== undefined || line_end !== undefined) {
            const lines = content.split('\n');
            content = lines.slice(line_start || 0, line_end).join('\n');
          }
          return content;
        } catch (err) { return `Failed: ${err instanceof Error ? err.message : 'unknown'}`; }
      },
    }),

    codepilot_memory_recent: tool({
      description: 'Get recent daily memories (last 3 days) and long-term memory summary.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const dailyDir = path.join(workspacePath, 'daily');
          if (!fs.existsSync(dailyDir)) return 'No daily memories found.';

          const entries = fs.readdirSync(dailyDir)
            .filter(f => f.endsWith('.md'))
            .sort()
            .slice(-3);

          const parts: string[] = [];
          for (const entry of entries) {
            const content = fs.readFileSync(path.join(dailyDir, entry), 'utf-8');
            parts.push(`### ${entry}\n${content.slice(0, 500)}`);
          }

          // Long-term memory summary
          const ltPath = path.join(workspacePath, 'longterm', 'summary.md');
          if (fs.existsSync(ltPath)) {
            const ltContent = fs.readFileSync(ltPath, 'utf-8');
            parts.push(`### Long-term Memory\n${ltContent.slice(0, 500)}`);
          }

          return parts.join('\n\n') || 'No recent memories.';
        } catch (err) { return `Failed: ${err instanceof Error ? err.message : 'unknown'}`; }
      },
    }),
  };
}
