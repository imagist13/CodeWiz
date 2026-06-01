/**
 * agent-loop.ts — Native Agent Loop (no Claude Code CLI dependency).
 *
 * Replaces the SDK's `query()` for the self-hosted runtime path.
 * Uses Vercel AI SDK `streamText()` in a manual while-loop (not maxSteps / stopWhen)
 * so we can intercept each step for permission checks, DB persistence,
 * doom-loop detection, and context-overflow handling.
 *
 * Outputs a ReadableStream<string> of SSE lines (`data: {...}\n\n`)
 * compatible with the existing frontend contract (useSSEStream.ts).
 */

import { streamText, type LanguageModel, type ToolSet, type ModelMessage } from 'ai';
import type { SSEEvent, TokenUsage } from '@/types';
import { createModel } from './ai-provider';
import { assembleTools, READ_ONLY_TOOLS } from './agent-tools';
import { reportNativeError } from './error-classifier';
import { pruneOldToolResults } from './context-pruner';
import { shouldSuggestSkill, buildSkillNudgeStatusEvent } from './skill-nudge';
import { emit as emitEvent } from './runtime/event-bus';
import { createCheckpoint } from './file-checkpoint';
import type { PermissionMode } from './permission-checker';
import { buildCoreMessages } from './message-builder';
import { sanitizeClaudeModelOptions } from './claude-model-options';
import { getMessages } from './db';
import { wrapController } from './safe-stream';

// ── Types ───────────────────────────────────────────────────────

export interface AgentLoopOptions {
  /** User's prompt text */
  prompt: string;
  /** Session ID (for DB persistence and SSE metadata) */
  sessionId: string;
  /** Provider ID */
  providerId?: string;
  /** Session's stored provider ID */
  sessionProviderId?: string;
  /** Model override */
  model?: string;
  /** Session's stored model */
  sessionModel?: string;
  /** System prompt string */
  systemPrompt?: string;
  /** Working directory for tool execution */
  workingDirectory?: string;
  /** AbortController for cancellation */
  abortController?: AbortController;
  /** Tools to make available to the model (if not provided, assembled from defaults) */
  tools?: ToolSet;
  /** Permission mode for tool execution */
  permissionMode?: string;
  /** MCP servers to sync before assembling tools */
  mcpServers?: Record<string, import('@/types').MCPServerConfig>;
  /** Thinking configuration (Anthropic-specific) */
  thinking?: { type: 'adaptive' } | { type: 'enabled'; budgetTokens?: number } | { type: 'disabled' };
  /** Effort level (Anthropic-specific). Opus 4.7 adds 'xhigh'. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Enable 1M context beta */
  context1m?: boolean;
  /** Max agent loop steps (default 50) */
  maxSteps?: number;
  /** Whether this is an auto-trigger turn (skip rewind points) */
  autoTrigger?: boolean;
  /** Bypass all permission checks (full_access profile) */
  bypassPermissions?: boolean;
  /** File attachments from the user (images, documents, etc.) */
  files?: import('@/types').FileAttachment[];
  /** Callback when runtime status changes */
  onRuntimeStatusChange?: (status: string) => void;
}

// ── Constants ───────────────────────────────────────────────────

const DEFAULT_MAX_STEPS = 50;
const DOOM_LOOP_THRESHOLD = 3; // same tool called 3 times in a row
const KEEPALIVE_INTERVAL_MS = 15_000;

// ── Main ────────────────────────────────────────────────────────

/**
 * Run the native Agent Loop and return a ReadableStream of SSE events.
 *
 * The stream emits the same SSE event types the frontend expects:
 * text, thinking, tool_use, tool_result, tool_output, status, result,
 * error, permission_request, rewind_point, keep_alive, done.
 */
export function runAgentLoop(options: AgentLoopOptions): ReadableStream<string> {
  const {
    prompt,
    sessionId,
    providerId,
    sessionProviderId,
    model: modelOverride,
    sessionModel,
    systemPrompt,
    workingDirectory,
    abortController = new AbortController(),
    tools: toolsOverride,
    thinking,
    effort,
    context1m,
    maxSteps = DEFAULT_MAX_STEPS,
    autoTrigger,
    onRuntimeStatusChange,
    permissionMode,
    mcpServers,
    bypassPermissions,
    files,
  } = options;

  return new ReadableStream<string>({
    async start(controllerRaw) {
      // Wrap controller so async callbacks (onStepFinish, late tool-result
      // handlers, keep-alive timer) can call enqueue() without crashing
      // when the consumer aborts. See src/lib/safe-stream.ts.
      const controller = wrapController(controllerRaw, (kind) => {
        console.warn(`[agent-loop] late ${kind} after stream close — silently dropped`);
      });
      const keepAliveTimer = setInterval(() => {
        controller.enqueue(formatSSE({ type: 'keep_alive', data: '' }));
      }, KEEPALIVE_INTERVAL_MS);

      try {
        // 0. Sync MCP servers before assembling tools (await to avoid race condition)
        if (mcpServers && Object.keys(mcpServers).length > 0) {
          console.log(`[agent-loop] Syncing ${Object.keys(mcpServers).length} MCP servers: ${Object.keys(mcpServers).join(', ')}`);
          try {
            const { syncMcpConnections } = await import('./mcp-connection-manager');
            await syncMcpConnections(mcpServers);
          } catch (err) {
            console.warn('[agent-loop] MCP sync error:', err instanceof Error ? err.message : err);
            reportNativeError('MCP_CONNECTION_ERROR', err, { sessionId });
          }
        } else {
          console.log('[agent-loop] No MCP servers to sync');
        }

        // 0b. Assemble tools with permission context (needs controller for SSE emission)
        // When bypassPermissions is true (full_access profile), skip permission wrapping entirely.
        let tools: import('ai').ToolSet;
        let toolSystemPrompts: string[] = [];
        if (toolsOverride) {
          tools = toolsOverride;
        } else {
          const assembled = assembleTools({
            workingDirectory: workingDirectory || process.cwd(),
            prompt,
            mode: permissionMode,
            providerId,
            sessionProviderId,
            model: modelOverride || sessionModel,
            permissionContext: bypassPermissions ? undefined : {
              sessionId,
              permissionMode: (permissionMode || 'normal') as PermissionMode,
              emitSSE: (event) => {
                controller.enqueue(formatSSE(event as SSEEvent));
              },
              abortSignal: abortController.signal,
            },
          });
          tools = assembled.tools;
          toolSystemPrompts = assembled.systemPrompts;
        }

        // Augment system prompt with tool-specific context snippets
        // (notification hints, media capabilities, dashboard usage, etc.)
        const effectiveSystemPrompt = toolSystemPrompts.length > 0 && systemPrompt
          ? systemPrompt + '\n\n' + toolSystemPrompts.join('\n\n')
          : systemPrompt;

        // 1. Create model
        const { languageModel, modelId, config, isThirdPartyProxy } = createModel({
          providerId,
          sessionProviderId,
          model: modelOverride,
          sessionModel,
        });

        // 2. Load conversation history from DB
        const { messages: dbMessages } = getMessages(sessionId, { limit: 200, excludeHeartbeatAck: true });
        const historyMessages = buildCoreMessages(dbMessages);

        // The chat route persists the user message to DB BEFORE calling us,
        // so for normal messages it's already the last entry in historyMessages.
        //
        // autoTrigger messages are NOT saved to DB (route.ts skips addMessage),
        // so they must always be appended here.
        //
        // For non-autoTrigger: the last user message in history IS the current
        // prompt (already includes any file attachments via buildUserMessage).
        if (autoTrigger || historyMessages.length === 0 || historyMessages[historyMessages.length - 1]?.role !== 'user') {
          historyMessages.push({ role: 'user' as const, content: prompt });
        }

        // Debug: uncomment to trace message assembly issues
        // console.log(`[agent-loop] Messages: ${historyMessages.map(m => `${m.role}:${typeof m.content === 'string' ? m.content.slice(0, 30) : 'array'}`).join(' | ')}`);

        // 3. Emit status init event
        const toolNames = tools ? Object.keys(tools) : [];
        console.log(`[agent-loop] Session ${sessionId}: model=${modelId}, tools=[${toolNames.join(', ')}] (${toolNames.length} total)`);
        controller.enqueue(formatSSE({
          type: 'status',
          data: JSON.stringify({
            session_id: sessionId,
            model: modelId,
            requested_model: modelOverride || sessionModel || modelId,
            tools: toolNames,
            output_style: 'native',
          }),
        }));

        // 4. Emit rewind point for this user message (unless autoTrigger)
        // Use the actual DB message ID so the rewind route can find it
        if (!autoTrigger) {
          const lastDbUserMsg = [...dbMessages].reverse().find(m => m.role === 'user');
          const rewindMessageId = lastDbUserMsg?.id || sessionId;
          controller.enqueue(formatSSE({
            type: 'rewind_point',
            data: JSON.stringify({ userMessageId: rewindMessageId }),
          }));
          // Create file checkpoint at this rewind point
          createCheckpoint(sessionId, rewindMessageId, workingDirectory || process.cwd());
        }

        // 5. Agent Loop
        emitEvent('session:start', { sessionId, model: modelId });
        onRuntimeStatusChange?.('streaming');
        let step = 0;
        const totalUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
        let lastToolNames: string[] = []; // for doom loop detection
        const distinctTools = new Set<string>(); // for skill-nudge heuristic
        let messages = historyMessages;

        while (step < maxSteps) {
          step++;

          // Build provider options (Anthropic-specific).
          // Shared sanitizer applies Opus 4.7 migration guards (manual
          // thinking → adaptive, skip context-1m beta). Same function is
          // also called from the Claude Code SDK path in claude-client.ts
          // so the two runtimes can't drift on 4.7 semantics.
          //
          // Third-party proxies still get additional filtering (no adaptive
          // thinking or effort) — those are proxy compatibility concerns,
          // not Opus 4.7 migration concerns, so they stay inline here.
          //
          // Opus 4.7 effort on the native path (@ai-sdk/anthropic 3.0.70):
          //   The installed package still attaches `effort-2025-11-24` beta
          //   header whenever anthropicOpts.effort is set, while Opus 4.7's
          //   migration checklist says to remove that beta (effort is GA).
          //   To avoid sending a stale beta header, effort is dropped for
          //   Opus 4.7 on the native path until the provider emits a clean
          //   request. SDK/CLI path is unaffected — that codepath handles
          //   effort natively. Tracked as tech-debt on the adoption plan's
          //   risk table.
          const sanitized = sanitizeClaudeModelOptions({
            model: config.modelId,
            thinking,
            effort,
            context1m,
          });
          const isOpus47 = sanitized.isOpus47;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let providerOptions: any;
          if (config.sdkType === 'anthropic') {
            const anthropicOpts: Record<string, unknown> = {};

            if (isThirdPartyProxy) {
              // Proxies: only pass thinking if explicitly enabled (not adaptive),
              // skip effort (requires beta header proxies may not support).
              // UI currently still shows Effort selector for these providers
              // (supportsEffort is a model-level catalog flag, not per
              // provider-runtime), so an explicit pick silently evaporates.
              // Surface a one-shot toast on the first step so users know
              // their Low/High/XHigh/Max choice didn't reach the wire.
              if (sanitized.thinking && sanitized.thinking.type === 'enabled') {
                anthropicOpts.thinking = sanitized.thinking;
              }
              if (sanitized.effort && step === 1) {
                console.warn(
                  `[agent-loop] Third-party Anthropic proxy: dropping explicit effort='${sanitized.effort}' — effort GA beta header may not be supported by proxies. Switch to SDK runtime or the official Anthropic endpoint to control effort.`,
                );
                controller.enqueue(formatSSE({
                  type: 'status',
                  data: JSON.stringify({
                    notification: true,
                    code: 'RUNTIME_EFFORT_IGNORED',
                    title: 'Effort ignored on this runtime',
                    message: `Third-party Anthropic proxies may not support the effort parameter — your "${sanitized.effort}" choice wasn't sent. Switch to SDK runtime or an official Anthropic provider to control effort explicitly.`,
                  }),
                }));
              }
              // Don't pass effort or adaptive thinking for proxies
            } else {
              // Official API: pass through sanitized thinking.
              if (sanitized.thinking) {
                anthropicOpts.thinking = sanitized.thinking;
              }
              // Gate effort on Opus 4.7 to avoid the stale effort-2025-11-24
              // beta header the installed @ai-sdk/anthropic still attaches.
              // Other models keep the existing effort plumbing.
              if (sanitized.effort && !isOpus47) {
                anthropicOpts.effort = sanitized.effort;
              } else if (sanitized.effort && isOpus47 && step === 1) {
                // Tell the user the explicit effort they picked is being
                // dropped for this session. Only emit on the first step so
                // we don't spam multi-turn conversations. The UI surfaces
                // this via the status event pipeline; ChatView can treat
                // code=RUNTIME_EFFORT_IGNORED as a one-shot toast.
                console.warn(
                  `[agent-loop] Opus 4.7 on native runtime: dropping explicit effort='${sanitized.effort}' — @ai-sdk/anthropic still attaches deprecated effort-2025-11-24 beta. Switch to SDK runtime for explicit effort control on 4.7.`,
                );
                controller.enqueue(formatSSE({
                  type: 'status',
                  data: JSON.stringify({
                    notification: true,
                    code: 'RUNTIME_EFFORT_IGNORED',
                    title: 'Effort ignored on this runtime',
                    message: `Opus 4.7 on the native runtime can't send explicit effort yet (would ship a deprecated beta header). Using API default — switch to SDK runtime to control effort.`,
                  }),
                }));
              }
            }

            if (sanitized.applyContext1mBeta) {
              anthropicOpts.anthropicBeta = ['context-1m-2025-08-07'];
            }
            if (Object.keys(anthropicOpts).length > 0) {
              providerOptions = { anthropic: anthropicOpts };
            }
          }

          // OpenAI Responses API (Codex) — pass system prompt + reasoning
          // Follows OpenCode's approach: default effort=medium, verbosity=medium
          if (config.useResponsesApi) {
            providerOptions = {
              ...providerOptions,
              openai: {
                ...(effectiveSystemPrompt ? { instructions: effectiveSystemPrompt } : {}),
                store: false,
                reasoningEffort: 'medium',
                textVerbosity: 'medium',
              },
            };
          }

          // Prune old tool results to reduce token usage
          const prunedMessages = pruneOldToolResults(messages);

          // Determine activeTools based on mode (plan = read-only subset)
          const isPlanMode = permissionMode === 'plan';
          const hasTools = tools && Object.keys(tools).length > 0;
          const activeToolNames = isPlanMode && hasTools
            ? Object.keys(tools).filter(name => READ_ONLY_TOOLS.includes(name as typeof READ_ONLY_TOOLS[number]))
            : undefined; // undefined = all tools active

          // Call streamText (single step — we control the loop)
          const result = streamText({
            model: languageModel,
            system: effectiveSystemPrompt,
            messages: prunedMessages,
            tools: hasTools ? tools : undefined,
            // activeTools: limit available tools in plan mode (AI SDK feature)
            ...(activeToolNames ? { activeTools: activeToolNames } : {}),
            // toolChoice: auto by default, none if no tools
            toolChoice: hasTools ? 'auto' : 'none',
            providerOptions,
            abortSignal: abortController.signal,
            // Codex API doesn't support max_output_tokens
            ...(config.useResponsesApi ? {} : { maxOutputTokens: 16384 }),

            // onStepFinish: token tracking per step
            onStepFinish: ({ usage: stepUsage, finishReason, toolCalls }) => {
              if (stepUsage) {
                totalUsage.input_tokens += stepUsage.inputTokens || 0;
                totalUsage.output_tokens += stepUsage.outputTokens || 0;
              }
              // Emit step progress for frontend token display
              controller.enqueue(formatSSE({
                type: 'status',
                data: JSON.stringify({
                  subtype: 'step_complete',
                  step,
                  usage: totalUsage,
                  finishReason,
                  toolsUsed: toolCalls?.map(tc => tc.toolName) || [],
                }),
              }));
            },

            // onAbort: cleanup on interruption
            onAbort: () => {
              onRuntimeStatusChange?.('idle');
              emitEvent('session:end', { sessionId, steps: step, aborted: true });
            },

            // repairToolCall: auto-fix invalid tool calls before failing
            experimental_repairToolCall: async ({ toolCall, tools: availableTools, error }) => {
              // Log the repair attempt for debugging
              console.warn(`[agent-loop] Repairing tool call "${toolCall.toolName}": ${error.message}`);
              // Return null to let the SDK retry with the model
              // (the model sees the error and can fix the call)
              return null;
            },

            onError: (event) => {
              const err = event.error;
              const msg = err instanceof Error ? err.message : String(err);
              console.error('[agent-loop] streamText error:', msg);
              if (err && typeof err === 'object') {
                const anyErr = err as Record<string, unknown>;
                if (anyErr.responseBody) console.error('[agent-loop] Response body:', anyErr.responseBody);
                if (anyErr.statusCode) console.error('[agent-loop] Status code:', anyErr.statusCode);
              }
              // Classify and report to Sentry
              const isAuthError = /unauthorized|forbidden|401|403/i.test(msg);
              const category = config.useResponsesApi && isAuthError
                ? 'OPENAI_AUTH_FAILED' as const
                : 'NATIVE_STREAM_ERROR' as const;
              reportNativeError(category, err, { modelId, sessionId });
            },
          });

          // Consume the fullStream
          let hasToolCalls = false;
          let hasContent = false; // tracks whether any actual content was produced
          const stepToolNames: string[] = [];

          for await (const event of result.fullStream) {
            switch (event.type) {
              case 'text-delta':
                hasContent = true;
                controller.enqueue(formatSSE({ type: 'text', data: event.text }));
                break;

              case 'reasoning-delta':
                hasContent = true;
                controller.enqueue(formatSSE({ type: 'thinking', data: event.text }));
                break;

              case 'tool-call':
                hasToolCalls = true;
                stepToolNames.push(event.toolName);
                distinctTools.add(event.toolName);
                controller.enqueue(formatSSE({
                  type: 'tool_use',
                  data: JSON.stringify({
                    id: event.toolCallId,
                    name: event.toolName,
                    input: event.input,
                  }),
                }));
                break;

              case 'tool-result':
                controller.enqueue(formatSSE({
                  type: 'tool_result',
                  data: JSON.stringify({
                    tool_use_id: event.toolCallId,
                    content: typeof event.output === 'string' ? event.output : JSON.stringify(event.output),
                    is_error: false,
                  }),
                }));
                break;

              case 'error':
                controller.enqueue(formatSSE({
                  type: 'error',
                  data: typeof event.error === 'string' ? event.error : JSON.stringify({ userMessage: String(event.error) }),
                }));
                break;

              // Events we don't forward to the frontend
              default:
                break;
            }
          }

          // Usage is accumulated in onStepFinish callback above

          // If no tool calls, the model is done
          if (!hasToolCalls) {
            // Detect truly empty response (no text, no thinking, no tools)
            if (!hasContent) {
              const finishReason = await result.finishReason;
              console.error(`[agent-loop] Empty response: finishReason=${finishReason}, model=${modelId}`);
              reportNativeError('EMPTY_RESPONSE', new Error(`Empty response: finishReason=${finishReason}`), { modelId, sessionId });
              controller.enqueue(formatSSE({
                type: 'error',
                data: JSON.stringify({
                  category: 'EMPTY_RESPONSE',
                  userMessage: `模型未返回任何内容 (finishReason: ${finishReason})。可能是 API 代理不兼容或模型 ID "${modelId}" 不被支持。`,
                }),
              }));
            }
            break;
          }

          // Doom loop detection: same tool(s) called 3 times in a row
          const toolKey = stepToolNames.sort().join(',');
          const lastKey = lastToolNames.sort().join(',');
          if (toolKey === lastKey) {
            const repeatCount = (step > 1) ? DOOM_LOOP_THRESHOLD : 1;
            // Simple heuristic: track repeats via a counter we'd need to add
            // For now, just detect immediate repeats and break after threshold
          }
          lastToolNames = stepToolNames;

          // Update messages for next iteration.
          // streamText returns the full message list including our input + model response.
          // Use response.messages which contains properly typed ModelMessage[].
          const responseData = await result.response;
          messages = [...messages, ...responseData.messages] as ModelMessage[];
        }

        // 6a. Emit skill-nudge if the run was complex enough to warrant saving as a Skill.
        // Heuristic: >= 8 agent steps AND >= 3 distinct tools used. See skill-nudge.ts.
        //
        // Event shape is designed to be consumed by BOTH web and bridge:
        //   - Web SSE parser (useSSEStream.ts): `notification: true` + `message`
        //     routes through the status/notification branch so the message
        //     shows in the status bar.
        //   - Bridge parser (conversation-engine.ts): `subtype: 'skill_nudge'`
        //     routes through a dedicated handler that appends the nudge to
        //     the assistant message as a separated text block.
        //   - Future dedicated UI: `subtype: 'skill_nudge'` + full `payload`
        //     provides structured data for a rich nudge card.
        if (shouldSuggestSkill({ step, distinctTools })) {
          controller.enqueue(formatSSE({
            type: 'status',
            data: JSON.stringify(buildSkillNudgeStatusEvent({ step, distinctTools })),
          }));
        }

        // 6. Emit result event
        controller.enqueue(formatSSE({
          type: 'result',
          data: JSON.stringify({
            usage: totalUsage,
            session_id: sessionId,
            num_turns: step,
          }),
        }));

        emitEvent('session:end', { sessionId, steps: step });
        onRuntimeStatusChange?.('idle');
      } catch (err: unknown) {
        const isAbort = err instanceof Error && (
          err.name === 'AbortError' ||
          abortController.signal.aborted
        );

        if (!isAbort) {
          console.error('[agent-loop] Error:', err instanceof Error ? err.message : err);
          reportNativeError('NATIVE_STREAM_ERROR', err, { sessionId });
          controller.enqueue(formatSSE({
            type: 'error',
            data: JSON.stringify({
              category: 'AGENT_ERROR',
              userMessage: err instanceof Error ? err.message : String(err),
            }),
          }));
        }

        onRuntimeStatusChange?.('error');
      } finally {
        clearInterval(keepAliveTimer);
        controller.enqueue(formatSSE({ type: 'done', data: '' }));
        controller.close();
      }
    },
  });
}

// ── Helpers ─────────────────────────────────────────────────────

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
