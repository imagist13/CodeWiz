/**
 * runtime/python-agent.ts - Python Agent Session Runtime (Phase 2)
 *
 * Communication protocol with Python subprocess (--session-mode):
 *   - stdin:  JSON-RPC requests
 *   - stdout: JSON-RPC responses + SSE events (both on the same fd)
 *   - stderr: Python logging/debug output
 *
 * Reading strategy: use a background thread to consume SSE lines from stdout
 * and pipe them into a channel. The main thread waits for the JSON-RPC
 * response and then yields the SSE stream. This avoids mixing the JSON-RPC
 * response line into the SSE stream.
 */

import { spawn } from 'child_process';
import { Readable } from 'stream';
import { findPythonExecutable } from './python-chat';
import { resolveProvider } from '../provider-resolver';

interface AgentMessageOptions {
  prompt: string;
  model?: string;
  systemPrompt?: string;
  thinking?:
    | { type: 'adaptive' }
    | { type: 'enabled'; budgetTokens?: number }
    | { type: 'disabled' };
  apiKey?: string;
  baseUrl?: string;
  protocol?: 'anthropic' | 'openai-compatible';
  maxSteps?: number;
  workingDirectory?: string;
  providerId?: string;
  sessionProviderId?: string;
  abortSignal?: AbortSignal;
  onStatusChange?: (status: string) => void;
}

function parseSSELine(raw: string): { type: string; data: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('data: ')) return null;
  try { return JSON.parse(trimmed.slice(6)) as { type: string; data: string }; }
  catch { return null; }
}

function nodeToWebReadable(nodeReadable: Readable): ReadableStream<Buffer> {
  const reader = (nodeReadable as AsyncIterable<Buffer>)[Symbol.asyncIterator]?.();
  if (reader) {
    return new ReadableStream({
      async pull(controller) {
        const { value, done } = await reader.next();
        if (done) controller.close(); else controller.enqueue(value);
      },
      cancel() { (reader as { return?: () => void }).return?.(); },
    });
  }
  return new ReadableStream({
    async pull(controller) {
      const chunk = await new Promise<Buffer | null>((resolve) => {
        const onData = (c: Buffer) => {
          nodeReadable.removeListener('data', onData);
          nodeReadable.removeListener('end', onEnd);
          nodeReadable.removeListener('error', onError);
          resolve(c);
        };
        const onEnd = () => resolve(null);
        const onError = () => resolve(null);
        nodeReadable.on('data', onData);
        nodeReadable.on('end', onEnd);
        nodeReadable.on('error', onError);
      });
      if (chunk === null) controller.close(); else controller.enqueue(chunk);
    },
    cancel() { nodeReadable.destroy(); },
  });
}

export interface PythonAgentSession {
  message(options: AgentMessageOptions): ReadableStream<string>;
  interrupt(): void;
  reset(): void;
  dispose(): void;
}

export function createPythonAgentSession(sessionId: string): PythonAgentSession {
  const pythonExe = findPythonExecutable();
  if (!pythonExe) throw new Error('Python 3.9+ not found. Install codepilot-agent.');

  let apiKey = '';
  let baseUrl: string | undefined;
  try {
    const resolved = resolveProvider({ providerId: undefined, sessionProviderId: undefined, model: undefined, sessionModel: undefined });
    if (resolved.provider) { apiKey = resolved.provider.api_key || ''; baseUrl = resolved.provider.base_url || undefined; }
    if (!apiKey) apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['OPENAI_API_KEY'] || '';
    if (!baseUrl) baseUrl = process.env['ANTHROPIC_BASE_URL'] || process.env['OPENAI_BASE_URL'] || undefined;
  } catch {
    apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['OPENAI_API_KEY'] || '';
    baseUrl = process.env['ANTHROPIC_BASE_URL'] || process.env['OPENAI_BASE_URL'] || undefined;
  }

  const child = spawn(pythonExe, ['-m', 'codepilot_agent.cli', '--session-mode'], {
    env: { ...process.env, ANTHROPIC_API_KEY: apiKey, ...(baseUrl ? { ANTHROPIC_BASE_URL: baseUrl } : {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });

  const stderrChunks: string[] = [];
  child.stderr?.on('data', (chunk: Buffer) => { stderrChunks.push(chunk.toString('utf-8')); });
  let disposed = false;
  child.on('error', (err) => { console.error('[python-agent] subprocess error:', err); });
  child.on('exit', (code) => {
    if (!disposed) console.warn('[python-agent] subprocess exited: ' + code);
    else console.log('[python-agent] subprocess exited cleanly');
  });

  // ── Read stdout in a background thread to consume SSE lines ─────────────────
  // We run a thread that reads all SSE lines from stdout and enqueues them.
  // The main thread waits for the JSON-RPC response line first.
  //
  // Protocol on stdout:
  //   1. JSON-RPC response:  {"jsonrpc":"2.0","id":N,"result":{...}}
  //      or                  {"jsonrpc":"2.0","id":N,"error":{...}}
  //   2. Zero or more SSE lines:  data: {"type":"...",...}\n\n

  /** Pending request queue: maps id -> { resolve, reject } */
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  /** Lines already consumed from stdout before we started listening */
  const preConsumedLines: string[] = [];

  /** SSE lines that have been buffered by the reader thread */
  const sseQueue: string[] = [];
  let sseQueueDone = false;
  let sseReaderError: Error | null = null;

  /** Read from stdout in the main thread, dispatching lines */
  function readFromStdout(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Try to parse as JSON-RPC response
    try {
      const resp = JSON.parse(trimmed);
      if (resp && resp.jsonrpc === '2.0' && resp.id !== undefined) {
        const pendingReq = pending.get(resp.id as number);
        if (pendingReq) {
          pending.delete(resp.id as number);
          if (resp.error) {
            pendingReq.reject(new Error((resp.error as { message?: string }).message || String(resp.error)));
          } else {
            pendingReq.resolve(resp.result);
          }
          return; // JSON-RPC response consumed, do NOT forward as SSE
        }
      }
    } catch {
      // Not JSON-RPC, treat as SSE line
    }

    // SSE line
    sseQueue.push(trimmed + '\n');
  }

  // Consume stdout lines and route them
  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8');
    const lines = text.split('\n');
    for (const line of lines) {
      readFromStdout(line);
    }
  });

  child.stdout?.on('end', () => {
    sseQueueDone = true;
    // Log any remaining stderr
    const stderr = stderrChunks.join('');
    if (stderr) console.warn('[python-agent] stderr:', stderr);
  });

  function sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!child.stdin) { reject(new Error('stdin not available')); return; }
      if (disposed) { reject(new Error('session disposed')); return; }
      const id = reqId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  let reqId = 1;

  return {
    message(options: AgentMessageOptions): ReadableStream<string> {
      return new ReadableStream<string>({
        start(controller) {
          // Build params
          const params: Record<string, unknown> = { session_id: sessionId, prompt: options.prompt };
          if (options.model) params.model = options.model;
          if (options.systemPrompt) params.system_prompt = options.systemPrompt;
          if (options.thinking) params.thinking = options.thinking;
          if (options.maxSteps) params.max_steps = options.maxSteps;
          if (options.workingDirectory) params.working_directory = options.workingDirectory;

          // Send request — response is handled by pending map above
          sendRequest('message', params).catch((err) => {
            const errPayload = JSON.stringify({
              type: 'error',
              data: JSON.stringify({ category: 'AGENT_ERROR', userMessage: String(err), details: String(err) }),
            });
            try { controller.enqueue('data: ' + errPayload + '\n\n'); } catch { /* closed */ }
          });

          // Forward SSE lines to the controller as they arrive
          const pump = () => {
            try {
              while (true) {
                if (sseReaderError) break;
                const line = sseQueue.shift();
                if (line !== undefined) {
                  // Validate it's actually an SSE line
                  const parsed = parseSSELine(line);
                  if (parsed) controller.enqueue(line);
                  else controller.enqueue(line); // forward even if not parsed
                  continue;
                }
                if (sseQueueDone) {
                  controller.close();
                  break;
                }
                // Queue is empty, wait and retry
                setTimeout(pump, 10);
                return;
              }
            } catch { /* controller closed */ }
          };
          pump();
        },
        cancel() { /* subprocess keeps running */ },
      });
    },

    interrupt(): void { sendRequest('interrupt', {}).catch(() => {}); },
    reset(): void { sendRequest('reset', { session_id: sessionId }).catch(() => {}); },
    dispose(): void {
      disposed = true;
      child.kill('SIGTERM');
      child.stdin?.end();
    },
  };
}
