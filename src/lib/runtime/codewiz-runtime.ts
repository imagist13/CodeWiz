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
 *
 * Node.js-only code (child_process) is isolated in codewiz-process.ts and
 * imported dynamically so this module stays compatible with the browser build.
 */

import type { AgentRuntime, RuntimeStreamOptions } from './types';

const activeAbortControllers = new Map<string, AbortController>();
const activeFetches = new Map<string, AbortController>();

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

    const abortCtrl = new AbortController();
    activeAbortControllers.set(sessionId, abortCtrl);
    activeFetches.set(sessionId, abortCtrl);

    return new ReadableStream<string>({
      async start(controller) {
        try {
          // Dynamic import keeps Node.js-only code out of the browser bundle
          const { ensureFastApi, getFastApiPort } = await import('./codewiz-process');
          const port = getFastApiPort();
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
    return true;
  },

  dispose(): void {
    for (const [, ctrl] of activeAbortControllers) ctrl.abort();
    for (const [, ctrl] of activeFetches) ctrl.abort();
    activeAbortControllers.clear();
    activeFetches.clear();
    // Import and call disposal synchronously — safe since dispose() is only
    // called on server shutdown, not in the browser.
    import('./codewiz-process').then(({ disposeFastApi }) => disposeFastApi()).catch(() => {});
  },
};
