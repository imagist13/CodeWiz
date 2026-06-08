/**
 * runtime/codewiz-runtime.ts — CodeWiz Agent Runtime (FastAPI backend proxy).
 *
 * Proxies chat requests to the codewiz-agent FastAPI backend running on a
 * local port. The backend is started on first use via codewiz-process.ts.
 * This file is Node.js-only (imported via dynamic import in route.ts).
 */

import type { AgentRuntime, RuntimeStreamOptions } from './types';
import { ensureFastApi, disposeFastApi, getFastApiPort } from './codewiz-process';

const activeAbortControllers = new Map<string, AbortController>();

export const codewizRuntime: AgentRuntime = {
  id: 'codewiz-agent',
  displayName: 'CodeWiz Agent',
  description: 'Local FastAPI agent runtime with code analysis and generation tools.',

  stream(options: RuntimeStreamOptions): ReadableStream<string> {
    // ensureFastApi() is async but we must return synchronously.
    // Kick it off immediately — the backend will be ready before the
    // first SSE chunk is consumed, or the stream handles the error.
    void ensureFastApi().catch((err) =>
      console.error('[codewiz-runtime] Backend startup failed:', err)
    );

    const abortCtrl = options.abortController || new AbortController();
    activeAbortControllers.set(options.sessionId, abortCtrl);
    const sessionId = options.sessionId;

    return new ReadableStream<string>({
      async start(controller) {
        const port = getFastApiPort();
        const url = `http://127.0.0.1:${port}/api/v1/bridge/chat/${sessionId}/stream`;

        // Wait for the backend to be ready (synchronously inside start)
        try {
          await ensureFastApi();
        } catch (err) {
          const errorPayload = JSON.stringify({
            type: 'error',
            data: JSON.stringify({
              category: 'STARTUP_ERROR',
              userMessage: 'Failed to start codewiz-agent backend',
              actionHint: String(err),
              retryable: false,
            }),
          });
          const donePayload = JSON.stringify({ type: 'done', data: '' });
          try {
            controller.enqueue(`data: ${errorPayload}\n\n`);
            controller.enqueue(`data: ${donePayload}\n\n`);
          } catch { /* already closed */ }
          controller.close();
          activeAbortControllers.delete(sessionId);
          return;
        }

        let fetchResponse: Response;
        try {
          fetchResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: options.prompt, session_id: sessionId }),
            signal: abortCtrl.signal,
          });
        } catch (err) {
          const errorPayload = JSON.stringify({
            type: 'error',
            data: JSON.stringify({
              category: 'CONNECTION_ERROR',
              userMessage: 'Failed to connect to codewiz-agent backend',
              actionHint: String(err),
              retryable: true,
            }),
          });
          const donePayload = JSON.stringify({ type: 'done', data: '' });
          try {
            controller.enqueue(`data: ${errorPayload}\n\n`);
            controller.enqueue(`data: ${donePayload}\n\n`);
          } catch { /* already closed */ }
          controller.close();
          activeAbortControllers.delete(sessionId);
          return;
        }

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text().catch(() => 'Unknown error');
          const errorPayload = JSON.stringify({
            type: 'error',
            data: JSON.stringify({
              category: 'BACKEND_ERROR',
              userMessage: `codewiz-agent error: ${fetchResponse.status}`,
              actionHint: errorText,
              retryable: false,
            }),
          });
          const donePayload = JSON.stringify({ type: 'done', data: '' });
          try {
            controller.enqueue(`data: ${errorPayload}\n\n`);
            controller.enqueue(`data: ${donePayload}\n\n`);
          } catch { /* already closed */ }
          controller.close();
          activeAbortControllers.delete(sessionId);
          return;
        }

        if (!fetchResponse.body) {
          controller.close();
          activeAbortControllers.delete(sessionId);
          return;
        }

        const reader = fetchResponse.body.getReader();
        const textDecoder = new TextDecoder();
        let buffer = '';

        const readChunk = (): void => {
          reader.read().then(({ done, value }) => {
            if (done || abortCtrl.signal.aborted) {
              activeAbortControllers.delete(sessionId);
              controller.close();
              return;
            }

            buffer += textDecoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const fastapiEvent = JSON.parse(line.slice(6));
                  const runtimeEvent = mapFastAPIEvent(fastapiEvent);
                  if (runtimeEvent) {
                    controller.enqueue(`data: ${JSON.stringify(runtimeEvent)}\n\n`);
                  }
                } catch {
                  // passthrough malformed lines as-is
                  controller.enqueue(line + '\n');
                }
              }
            }

            readChunk();
          }).catch((err) => {
            activeAbortControllers.delete(sessionId);
            controller.close();
            console.error('[codewiz-runtime] Stream read error:', err);
          });
        };

        readChunk();
      },
    });
  },

  interrupt(sessionId: string): void {
    const ctrl = activeAbortControllers.get(sessionId);
    if (ctrl) {
      ctrl.abort();
      activeAbortControllers.delete(sessionId);
    }
  },

  isAvailable(): boolean {
    try {
      const { execSync } = require('child_process');
      execSync('python --version', { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },

  dispose(): void {
    for (const [, ctrl] of activeAbortControllers) {
      ctrl.abort();
    }
    activeAbortControllers.clear();
    disposeFastApi();
  },
};

/**
 * Map FastAPI backend event schema to the RuntimeStream SSE event contract.
 */
function mapFastAPIEvent(fastapiEvent: Record<string, unknown>): { type: string; data: string } | null {
  const eventType = String(fastapiEvent.event ?? fastapiEvent.type ?? '');

  switch (eventType) {
    case 'text':
    case 'text_generation':
      return { type: 'text', data: String(fastapiEvent.data ?? '') };

    case 'tool_use':
    case 'tool_call':
      return {
        type: 'tool_use',
        data: JSON.stringify({
          id: fastapiEvent.id ?? '',
          name: fastapiEvent.name ?? fastapiEvent.tool ?? '',
          input: fastapiEvent.input ?? {},
        }),
      };

    case 'tool_result':
    case 'tool_output':
      return {
        type: 'tool_result',
        data: JSON.stringify({
          tool_use_id: fastapiEvent.tool_use_id ?? '',
          content: fastapiEvent.content ?? '',
          is_error: fastapiEvent.is_error ?? false,
        }),
      };

    case 'status':
    case 'runtime_status':
      return {
        type: 'status',
        data: typeof fastapiEvent.data === 'string'
          ? fastapiEvent.data
          : JSON.stringify(fastapiEvent.data ?? {}),
      };

    case 'error':
      return {
        type: 'error',
        data: typeof fastapiEvent.data === 'string'
          ? fastapiEvent.data
          : JSON.stringify(fastapiEvent.data ?? 'Unknown error'),
      };

    case 'done':
    case 'completion':
    case 'finish':
      return { type: 'done', data: '' };

    default:
      return null;
  }
}
