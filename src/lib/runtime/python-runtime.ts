/**
 * runtime/python-runtime.ts — Python Agent Runtime.
 *
 * Phase 1 scope:
 *   ✅ One-shot per-request invocation
 *   ✅ Environment-variable credential injection
 *   ✅ SSE event passthrough
 *   ✅ Abort/interrupt support
 *   ✅ Python availability detection
 */

import type { AgentRuntime, RuntimeStreamOptions } from './types';
import { pythonChat } from './python-chat';
import { findPythonExecutable } from './python-chat';
import { resolveProvider } from '../provider-resolver';
import { getSetting } from '../db';

const activeAbortControllers = new Map<string, AbortController>();

export const pythonRuntime: AgentRuntime = {
  id: 'python-agent',
  displayName: 'Python Agent',
  description: 'Lightweight Python chat runtime via Anthropic/MiniMax API. No CLI tools or MCP.',

  stream(options: RuntimeStreamOptions): ReadableStream<string> {
    // Resolve provider (mirrors the logic used by native/sdks)
    const resolved = resolveProvider({
      providerId: options.providerId,
      sessionProviderId: options.sessionProviderId,
      model: options.model,
      sessionModel: undefined,
    });

    // Extract credentials:
    // - From explicit provider record: api_key + base_url
    // - From env vars as fallback (cc-switch path, no active provider)
    let apiKey = '';
    let baseUrl: string | undefined;

    if (resolved.provider) {
      apiKey = resolved.provider.api_key || '';
      baseUrl = resolved.provider.base_url || undefined;
    }

    // Fallback to env vars if no provider record
    if (!apiKey) {
      apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['OPENAI_API_KEY'] || '';
    }
    if (!baseUrl) {
      baseUrl = process.env['ANTHROPIC_BASE_URL'] || process.env['OPENAI_BASE_URL'] || undefined;
    }

    if (!apiKey) {
      // Emit a structured error as a ReadableStream so the caller can handle it uniformly
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

    // Map RuntimeStreamOptions → PythonChatOptions
    const pythonOptions = {
      prompt: options.prompt,
      sessionId: options.sessionId,
      model: options.model || resolved.model || resolved.upstreamModel || undefined,
      systemPrompt: options.systemPrompt,
      thinking: options.thinking,
      apiKey,
      baseUrl,
      protocol:
        resolved.protocol === 'openai-compatible'
          ? ('openai-compatible' as const)
          : ('anthropic' as const),
      maxTokens: 8192,
      abortController: options.abortController,
    };

    return pythonChat(pythonOptions);
  },

  interrupt(sessionId: string): void {
    const ac = activeAbortControllers.get(sessionId);
    if (ac) ac.abort();
  },

  isAvailable(): boolean {
    return !!findPythonExecutable();
  },

  dispose(): void {
    for (const [sessionId, ac] of activeAbortControllers) {
      ac.abort();
      activeAbortControllers.delete(sessionId);
    }
  },
};
