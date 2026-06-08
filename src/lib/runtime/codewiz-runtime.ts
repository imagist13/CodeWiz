/**
 * runtime/codewiz-runtime.ts — TypeScript Runtime for codewiz-agent FastAPI backend.
 *
 * Manages the FastAPI subprocess lifecycle, translates SSE events from FastAPI's
 * HarnessEvent format to CodeWiz's SSEEventType format, and implements the
 * AgentRuntime interface so codewiz-agent sessions flow through the same
 * chat/route.ts pipeline as other runtimes.
 *
 * Architecture:
 *   Next.js (chat API) → codewizRuntime.stream() → HTTP POST to FastAPI SSE
 *   FastAPI → SSE → codewiz-runtime (translate) → SSEEvent → client
 */

import type { AgentRuntime, RuntimeStreamOptions } from './types';

const activeAbortControllers = new Map<string, AbortController>();
const activeFetches = new Map<string, AbortController>();

/** Default port for the FastAPI backend; override via FASTAPI_PORT env. */
const DEFAULT_PORT = 18732;
const getPort = () => Number(process.env.FASTAPI_PORT ?? DEFAULT_PORT);

/** How long to wait for FastAPI to start before giving up (ms). */
const STARTUP_TIMEOUT_MS = 15_000;

/** Whether FastAPI subprocess is currently running. */
let pythonProcess: import('child_process').ChildProcess | null = null;
let fastApiReady = false;
let fastApiFailed = false;
let startupPromise: Promise<void> | null = null;

/** Resolve once FastAPI is ready. Reuses the promise across concurrent calls. */
function ensureFastApi(): Promise<void> {
  if (fastApiReady) return Promise.resolve();
  if (fastApiFailed) return Promise.reject(new Error('FastAPI backend failed to start'));
  if (startupPromise) return startupPromise;
  startupPromise = _startFastApi().then(() => { startupPromise = null; });
  return startupPromise;
}

async function _startFastApi(): Promise<void> {
  const { spawn } = await import('child_process');
  const port = getPort();

  console.log('[codewiz-runtime] Starting FastAPI backend on port', port);

  const pySrc = `${__dirname}/../lib/codewiz-agent`;
  pythonProcess = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: pySrc,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env, PYTHONPATH: pySrc },
  });

  let stderr = '';
  pythonProcess.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf-8');
  });

  // Wait for FastAPI to be ready (poll /health until 200)
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        fastApiReady = true;
        console.log('[codewiz-runtime] FastAPI backend ready');
        return;
      }
    } catch {
      // not ready yet
    }
    // Check if process died
    if (pythonProcess?.exitCode !== null) {
      fastApiFailed = true;
      console.error('[codewiz-runtime] FastAPI process exited early:\n' + stderr);
      throw new Error(`FastAPI exited with code ${pythonProcess.exitCode}`);
    }
  }
  fastApiFailed = true;
  pythonProcess?.kill();
  throw new Error(`FastAPI did not start within ${STARTUP_TIMEOUT_MS}ms`);
}

/** Translate FastAPI HarnessEvent type to CodeWiz SSEEventType + payload. */
function translateEvent(rawType: string, data: unknown): { type: string; data: string } | null {
  switch (rawType) {
    case 'message_start':
      return null;

    case 'message_chunk': {
      const chunk = typeof data === 'object' && data !== null ? (data as { chunk?: string }).chunk ?? '' : '';
      return { type: 'text', data: chunk };
    }

    case 'think_start':
      return { type: 'thinking', data: '<' };

    case 'think_chunk': {
      const chunk = typeof data === 'object' && data !== null ? (data as { chunk?: string }).chunk ?? '' : '';
      return { type: 'thinking', data: chunk };
    }

    case 'think_end':
      return { type: 'thinking', data: '>' };

    case 'tool_start': {
      const d = typeof data === 'object' ? data as { name?: string; id?: string } : {};
      return { type: 'tool_use', data: JSON.stringify({ name: d.name, id: d.id }) };
    }

    case 'tool_input': {
      const d = typeof data === 'object' ? data as { name?: string; input?: unknown; id?: string } : {};
      return {
        type: 'tool_result',
        data: JSON.stringify({ name: d.name, input: d.input, id: d.id, content: `Input: ${JSON.stringify(d.input ?? {})}` }),
      };
    }

    case 'tool_output': {
      const d = typeof data === 'object' ? data as { name?: string; output?: unknown; id?: string } : {};
      return {
        type: 'tool_result',
        data: JSON.stringify({ name: d.name, output: d.output, id: d.id, content: typeof d.output === 'string' ? d.output : JSON.stringify(d.output ?? '') }),
      };
    }

    case 'tool_end':
      return null;

    case 'context_info':
      return null;

    case 'error': {
      const msg = typeof data === 'object' && data !== null ? (data as { message?: string }).message ?? String(data) : String(data);
      return { type: 'error', data: msg };
    }

    default:
      return null;
  }
}

export const codewizRuntime: AgentRuntime = {
  id: 'codewiz-agent',
  displayName: 'Agent (codewiz)',
  description: 'Tool-calling agent powered by codewiz-agent (FastAPI + MiniMax/LLM).',

  stream(options: RuntimeStreamOptions): ReadableStream<string> {
    const sessionId = options.sessionId;
    const port = getPort();

    const abortCtrl = new AbortController();
    activeAbortControllers.set(sessionId, abortCtrl);
    activeFetches.set(sessionId, abortCtrl);

    const pythonOptions = {
      prompt: options.prompt,
      sessionId,
      model: options.model,
      systemPrompt: options.systemPrompt,
      thinking: options.thinking,
      apiKey: '', // FastAPI resolves credentials from its own config / DB
      baseUrl: `http://127.0.0.1:${port}`,
    };

    return new ReadableStream<string>({
      async start(controller) {
        try {
          await ensureFastApi();

          // Forward abort signal
          options.abortController?.signal.addEventListener('abort', () => abortCtrl.abort());

          const resp = await fetch(
            `http://127.0.0.1:${port}/api/bridge/chat/${sessionId}/stream`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
              body: JSON.stringify({ message: options.prompt, session_id: sessionId }),
              signal: abortCtrl.signal,
            }
          );

          if (!resp.ok) {
            const errText = await resp.text();
            controller.enqueue(`data: ${JSON.stringify({ type: 'error', data: `HTTP ${resp.status}: ${errText}` })}\n\n`);
            controller.enqueue(`data: ${JSON.stringify({ type: 'done', data: '' })}\n\n`);
            controller.close();
            return;
          }

          if (!resp.body) {
            controller.enqueue(`data: ${JSON.stringify({ type: 'error', data: 'No response body from FastAPI' })}\n\n`);
            controller.enqueue(`data: ${JSON.stringify({ type: 'done', data: '' })}\n\n`);
            controller.close();
            return;
          }

          let lineBuffer = '';
          const reader = resp.body.getReader();
          const decoder = new TextDecoder('utf-8');

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const text = lineBuffer + decoder.decode(value, { stream: true });
              const lines = text.split('\n');
              lineBuffer = lines.pop() ?? '';

              for (const rawLine of lines) {
                const trimmed = rawLine.trim();
                if (!trimmed.startsWith('data: ')) continue;
                try {
                  const parsed = JSON.parse(trimmed.slice(6));
                  // parsed is a HarnessEvent: { type: string, data: unknown }
                  const { type: rawType, data } = parsed;
                  const translated = translateEvent(rawType as string, data);
                  if (translated) {
                    controller.enqueue(`data: ${JSON.stringify(translated)}\n\n`);
                  }
                } catch {
                  // skip malformed line
                }
              }
            }

            // Flush buffer
            if (lineBuffer.trim().startsWith('data: ')) {
              try {
                const parsed = JSON.parse(lineBuffer.trim().slice(6));
                const { type: rawType, data } = parsed;
                const translated = translateEvent(rawType as string, data);
                if (translated) {
                  controller.enqueue(`data: ${JSON.stringify(translated)}\n\n`);
                }
              } catch { /* skip */ }
            }
          } finally {
            reader.releaseLock();
          }

          controller.enqueue(`data: ${JSON.stringify({ type: 'done', data: '' })}\n\n`);
          controller.close();
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            controller.enqueue(`data: ${JSON.stringify({ type: 'done', data: '' })}\n\n`);
          } else {
            controller.enqueue(`data: ${JSON.stringify({ type: 'error', data: String(err) })}\n\n`);
            controller.enqueue(`data: ${JSON.stringify({ type: 'done', data: '' })}\n\n`);
          }
          controller.close();
        } finally {
          activeAbortControllers.delete(sessionId);
          activeFetches.delete(sessionId);
        }
      },

      cancel() {
        // Called by ReadableStream cancel() on early teardown
        abortCtrl.abort();
        activeAbortControllers.delete(sessionId);
        activeFetches.delete(sessionId);
      },
    });
  },

  interrupt(sessionId: string): void {
    const ctrl = activeAbortControllers.get(sessionId) ?? activeFetches.get(sessionId);
    if (ctrl) ctrl.abort();
  },

  isAvailable(): boolean {
    // FastAPI availability: check if it is already running (port in use) or can be started
    return true; // Runtime will handle startup on first use
  },

  dispose(): void {
    for (const [, ctrl] of activeAbortControllers) ctrl.abort();
    for (const [, ctrl] of activeFetches) ctrl.abort();
    activeAbortControllers.clear();
    activeFetches.clear();
    if (pythonProcess) {
      pythonProcess.kill('SIGTERM');
      pythonProcess = null;
    }
    fastApiReady = false;
    fastApiFailed = false;
    startupPromise = null;
  },
};
