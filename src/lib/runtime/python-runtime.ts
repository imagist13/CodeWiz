/**
 * runtime/python-runtime.ts — Python Agent Runtime.
 *
 * Phase 1: One-shot per-request invocation (chat only, no tools).
 * Phase 2 (planned): Session-based multi-turn agent loop via Python session subprocess.
 *
 * Currently delegates to python-chat.ts for fast one-shot responses.
 * The python-agent.ts session infrastructure is in place for when
 * multi-turn tool-use is needed.
 */

import type { AgentRuntime, RuntimeStreamOptions } from './types';
import { pythonChat } from './python-chat';
import { findPythonExecutable } from './python-chat';
import { resolveProvider } from '../provider-resolver';
import { wrapController } from '../safe-stream';

const activeAbortControllers = new Map<string, AbortController>();

export const pythonRuntime: AgentRuntime = {
  id: 'python-agent',
  displayName: 'Python Agent',
  description: 'Python agent — invokes Claude via codepilot-agent CLI (one-shot per request).',

  stream(options: RuntimeStreamOptions): ReadableStream<string> {
    return pythonChatStream(options);
  },

  interrupt(sessionId: string): void {
    const ac = activeAbortControllers.get(sessionId);
    if (ac) ac.abort();
  },

  isAvailable(): boolean {
    return !!findPythonExecutable();
  },

  dispose(): void {
    for (const [, ac] of activeAbortControllers) {
      ac.abort();
    }
    activeAbortControllers.clear();
  },
};

/** One-shot: spawn a Python subprocess for a single request. */
function pythonChatStream(options: RuntimeStreamOptions): ReadableStream<string> {
  const resolved = resolveProvider({
    providerId: options.providerId,
    sessionProviderId: options.sessionProviderId,
    model: options.model,
    sessionModel: undefined,
  });

  let apiKey = '';
  let baseUrl: string | undefined;

  if (resolved.provider) {
    apiKey = resolved.provider.api_key || '';
    baseUrl = resolved.provider.base_url || undefined;
  }
  if (!apiKey) {
    apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['OPENAI_API_KEY'] || '';
  }
  if (!baseUrl) {
    baseUrl = process.env['ANTHROPIC_BASE_URL'] || process.env['OPENAI_BASE_URL'] || undefined;
  }

  if (!apiKey) {
    const errorPayload = JSON.stringify({
      type: 'error',
      data: JSON.stringify({
        category: 'NO_CREDENTIALS',
        userMessage: 'No API key found. Configure a provider in CodePilot settings.',
        actionHint: 'Open Settings > Provider to add your API key.',
        retryable: false,
      }),
    });
    const donePayload = JSON.stringify({ type: 'done', data: '' });
    return new ReadableStream({
      start(c) {
        c.enqueue(`data: ${errorPayload}\n\n`);
        c.enqueue(`data: ${donePayload}\n\n`);
        c.close();
      },
    });
  }

  const model = options.model || resolved.model || resolved.upstreamModel || undefined;
  const protocol = resolved.protocol === 'openai-compatible'
    ? ('openai-compatible' as const)
    : ('anthropic' as const);
  const abortController = options.abortController || new AbortController();

  activeAbortControllers.set(options.sessionId, abortController);

  const pythonOptions = {
    prompt: options.prompt,
    sessionId: options.sessionId,
    model,
    systemPrompt: options.systemPrompt,
    thinking: options.thinking,
    apiKey,
    baseUrl,
    protocol,
    maxTokens: 8192,
    abortController,
  };

  const upstream = pythonChat(pythonOptions);
  const reader = upstream.getReader();

  return new ReadableStream<string>({
    async start(controllerRaw) {
      const controller = wrapController(controllerRaw);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          if (controller.closed) break;
        }
      } finally {
        activeAbortControllers.delete(options.sessionId);
        controller.close();
      }
    },
    cancel() {
      activeAbortControllers.delete(options.sessionId);
    },
  });
}
