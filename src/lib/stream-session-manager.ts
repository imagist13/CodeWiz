/**
 * Stream Session Manager — client-side singleton that manages SSE streams
 * independently of React component lifecycle.
 *
 * When a user switches sessions, the old ChatView unmounts but the stream
 * continues running here. The new ChatView (or the same one re-mounted)
 * subscribes to get the current snapshot.
 *
 * Uses globalThis pattern (same as conversation-registry.ts) to survive
 * Next.js HMR without losing state.
 */

import { consumeSSEStream } from '@/hooks/useSSEStream';
import { transferPendingToMessage } from '@/lib/image-ref-store';
import type {
  ToolUseInfo,
  ToolResultInfo,
  SessionStreamSnapshot,
  StreamEvent,
  StreamEventListener,
  TokenUsage,
  PermissionRequestEvent,
  FileAttachment,
  MentionRef,
} from '@/types';

// ==========================================
// Internal types
// ==========================================

interface ActiveStream {
  sessionId: string;
  abortController: AbortController;
  snapshot: SessionStreamSnapshot;
  idleCheckTimer: ReturnType<typeof setInterval> | null;
  lastEventTime: number;
  gcTimer: ReturnType<typeof setTimeout> | null;
  /** Tracked ad-hoc timeouts — cleaned up when the stream ends. */
  pendingTimers: Set<ReturnType<typeof setTimeout>>;
  // Mutable accumulators (snapshot gets new object refs on each emit)
  accumulatedText: string;
  accumulatedThinking: string;
  /** All thinking blocks concatenated (preserved for finalMessageContent) */
  fullThinking: string;
  /** Tracks whether non-thinking content has arrived since last thinking delta */
  thinkingPhaseEnded: boolean;
  toolUsesArray: ToolUseInfo[];
  toolResultsArray: ToolResultInfo[];
  toolOutputAccumulated: string;
  toolTimeoutInfo: { toolName: string; elapsedSeconds: number } | null;
  isIdleTimeout: boolean;
  sendMessageFn: ((content: string, files?: FileAttachment[]) => void) | null;
  rewindPoints: Array<{ userMessageId: string }>;
}

export interface StartStreamParams {
  sessionId: string;
  content: string;
  mode: string;
  model: string;
  providerId: string;
  files?: FileAttachment[];
  mentions?: MentionRef[];
  systemPromptAppend?: string;
  pendingImageNotices?: string[];
  /** When true, backend skips saving user message and title update (assistant auto-trigger) */
  autoTrigger?: boolean;
  /** Called when SDK mode changes (e.g. plan → code) */
  onModeChanged?: (mode: string) => void;
  /** Reference to the outer sendMessage so tool-timeout auto-retry works */
  sendMessageFn?: (content: string, files?: FileAttachment[]) => void;
  /** SDK effort level (low/medium/high/max) — only sent when model supports it */
  effort?: string;
  /** SDK thinking config */
  thinking?: { type: string; budgetTokens?: number };
  /** Enable 1M context window (beta) */
  context1m?: boolean;
  /** Called when init status event provides metadata (tools, slash_commands, skills) */
  onInitMeta?: (meta: { tools?: unknown; slash_commands?: unknown; skills?: unknown }) => void;
  /** Display-only content for user message (e.g. /skillName instead of expanded prompt) */
  displayOverride?: string;
}

// ==========================================
// Singleton via globalThis
// ==========================================

const GLOBAL_KEY = '__streamSessionManager__' as const;
const LISTENERS_KEY = '__streamSessionListeners__' as const;
const STREAM_IDLE_TIMEOUT_MS = 330_000;
const GC_DELAY_MS = 5 * 60 * 1000; // 5 minutes

function getStreamsMap(): Map<string, ActiveStream> {
  if (!(globalThis as Record<string, unknown>)[GLOBAL_KEY]) {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = new Map<string, ActiveStream>();
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<string, ActiveStream>;
}

/** Listener registry — persists independently of stream entries so GC doesn't orphan listeners */
function getListenersMap(): Map<string, Set<StreamEventListener>> {
  if (!(globalThis as Record<string, unknown>)[LISTENERS_KEY]) {
    (globalThis as Record<string, unknown>)[LISTENERS_KEY] = new Map<string, Set<StreamEventListener>>();
  }
  return (globalThis as Record<string, unknown>)[LISTENERS_KEY] as Map<string, Set<StreamEventListener>>;
}

// ==========================================
// Helpers
// ==========================================

function buildSnapshot(stream: ActiveStream): SessionStreamSnapshot {
  return {
    sessionId: stream.sessionId,
    phase: stream.snapshot.phase,
    streamingContent: stream.accumulatedText,
    streamingThinkingContent: stream.accumulatedThinking,
    toolUses: [...stream.toolUsesArray],
    toolResults: [...stream.toolResultsArray],
    streamingToolOutput: stream.toolOutputAccumulated,
    statusText: stream.snapshot.statusText,
    pendingPermission: stream.snapshot.pendingPermission,
    permissionResolved: stream.snapshot.permissionResolved,
    tokenUsage: stream.snapshot.tokenUsage,
    startedAt: stream.snapshot.startedAt,
    completedAt: stream.snapshot.completedAt,
    error: stream.snapshot.error,
    finalMessageContent: stream.snapshot.finalMessageContent,
    terminalReason: stream.snapshot.terminalReason,
    rateLimitInfo: stream.snapshot.rateLimitInfo,
    contextUsageSnapshot: stream.snapshot.contextUsageSnapshot,
  };
}

function emit(stream: ActiveStream, type: StreamEvent['type']) {
  const snapshot = buildSnapshot(stream);
  stream.snapshot = snapshot; // store latest
  const event: StreamEvent = { type, sessionId: stream.sessionId, snapshot };
  const listeners = getListenersMap().get(stream.sessionId);
  if (listeners) {
    for (const listener of listeners) {
      try { listener(event); } catch { /* listener error */ }
    }
  }
  // Also dispatch window event for AppShell
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('stream-session-event', { detail: event }));
  }
}

function scheduleGC(stream: ActiveStream) {
  if (stream.gcTimer) clearTimeout(stream.gcTimer);
  stream.gcTimer = setTimeout(() => {
    const map = getStreamsMap();
    const current = map.get(stream.sessionId);
    if (current === stream && current.snapshot.phase !== 'active') {
      map.delete(stream.sessionId);
    }
  }, GC_DELAY_MS);
}

function cleanupTimers(stream: ActiveStream) {
  if (stream.idleCheckTimer) {
    clearInterval(stream.idleCheckTimer);
    stream.idleCheckTimer = null;
  }
  // Clear all tracked ad-hoc timeouts
  for (const t of stream.pendingTimers) {
    clearTimeout(t);
  }
  stream.pendingTimers.clear();
}

/** Schedule a tracked timeout on the stream. Auto-removes itself after firing. */
function streamTimeout(stream: ActiveStream, fn: () => void, ms: number): void {
  const id = setTimeout(() => {
    stream.pendingTimers.delete(id);
    fn();
  }, ms);
  stream.pendingTimers.add(id);
}

// ==========================================
// Public API
// ==========================================

export function startStream(params: StartStreamParams): void {
  const map = getStreamsMap();
  const existing = map.get(params.sessionId);

  // If already streaming this session, abort old stream first
  if (existing && existing.snapshot.phase === 'active') {
    existing.abortController.abort();
    cleanupTimers(existing);
  }

  const abortController = new AbortController();

  const stream: ActiveStream = {
    sessionId: params.sessionId,
    abortController,
    snapshot: {
      sessionId: params.sessionId,
      phase: 'active',
      streamingContent: '',
      streamingThinkingContent: '',
      toolUses: [],
      toolResults: [],
      streamingToolOutput: '',
      statusText: undefined,
      pendingPermission: null,
      permissionResolved: null,
      tokenUsage: null,
      startedAt: Date.now(),
      completedAt: null,
      error: null,
      finalMessageContent: null,
    },
    idleCheckTimer: null,
    lastEventTime: Date.now(),
    gcTimer: null,
    pendingTimers: new Set(),
    accumulatedText: '',
    accumulatedThinking: '',
    fullThinking: '',
    thinkingPhaseEnded: false,
    toolUsesArray: [],
    toolResultsArray: [],
    toolOutputAccumulated: '',
    toolTimeoutInfo: null,
    isIdleTimeout: false,
    sendMessageFn: params.sendMessageFn ?? null,
    rewindPoints: [],
  };

  map.set(params.sessionId, stream);
  emit(stream, 'phase-changed');

  // Run the stream in background (non-blocking)
  runStream(stream, params).catch(() => {});
}

async function runStream(stream: ActiveStream, params: StartStreamParams): Promise<void> {
  const markActive = () => { stream.lastEventTime = Date.now(); };

  // Idle timeout checker
  stream.idleCheckTimer = setInterval(() => {
    if (Date.now() - stream.lastEventTime >= STREAM_IDLE_TIMEOUT_MS) {
      cleanupTimers(stream);
      stream.isIdleTimeout = true;
      stream.abortController.abort();
    }
  }, 10_000);

  // Flush pending image notices
  let effectiveContent = params.content;
  if (params.pendingImageNotices && params.pendingImageNotices.length > 0) {
    const notices = params.pendingImageNotices.join('\n\n');
    effectiveContent = `${notices}\n\n---\n\n${params.content}`;
  }

  // Adaptive text emit throttle — avoids excessive React re-renders during fast streaming.
  // Defined before try/catch so flushTextThrottle is accessible in the error path.
  const TEXT_THROTTLE_MS = 100;
  let textEmitTimer: ReturnType<typeof setTimeout> | null = null;
  let textDirty = false;

  const emitTextUpdate = () => {
    textDirty = false;
    emit(stream, 'snapshot-updated');
  };

  const throttledTextEmit = () => {
    textDirty = true;
    if (!textEmitTimer) {
      textEmitTimer = setTimeout(() => {
        textEmitTimer = null;
        if (textDirty) emitTextUpdate();
      }, TEXT_THROTTLE_MS);
    }
  };

  const flushTextThrottle = () => {
    if (textEmitTimer) {
      clearTimeout(textEmitTimer);
      textEmitTimer = null;
    }
    if (textDirty) emitTextUpdate();
  };

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: params.sessionId,
        content: effectiveContent,
        mode: params.mode,
        model: params.model,
        provider_id: params.providerId,
        ...(params.files && params.files.length > 0 ? { files: params.files } : {}),
        ...(params.mentions && params.mentions.length > 0 ? { mentions: params.mentions } : {}),
        ...(params.systemPromptAppend ? { systemPromptAppend: params.systemPromptAppend } : {}),
        ...(params.autoTrigger ? { autoTrigger: true } : {}),
        ...(params.effort ? { effort: params.effort } : {}),
        ...(params.thinking ? { thinking: params.thinking } : {}),
        ...(params.context1m ? { context_1m: true } : {}),
        ...(params.displayOverride ? { displayOverride: params.displayOverride } : {}),
      }),
      signal: stream.abortController.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (err?.code === 'NEEDS_PROVIDER_SETUP' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-setup-center', {
          detail: { initialCard: err.initialCard ?? 'provider' },
        }));
      }
      throw new Error(err?.error || 'Failed to send message');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const result = await consumeSSEStream(reader, {
      onText: (acc) => {
        markActive();
        stream.accumulatedText = acc;
        stream.thinkingPhaseEnded = true;
        throttledTextEmit();
      },
      onThinking: (delta) => {
        markActive();
        // If non-thinking content has arrived since last thinking delta,
        // this is a new thinking phase (e.g. after a tool_use round-trip).
        // Reset the live accumulator so the UI shows only the current phase.
        if (stream.thinkingPhaseEnded) {
          // Save previous thinking to full history before resetting
          if (stream.accumulatedThinking) {
            stream.fullThinking += (stream.fullThinking ? '\n\n---\n\n' : '') + stream.accumulatedThinking;
          }
          stream.accumulatedThinking = '';
          stream.thinkingPhaseEnded = false;
        }
        stream.accumulatedThinking += delta;
        emit(stream, 'snapshot-updated');
      },
      onToolUse: (tool) => {
        markActive();
        flushTextThrottle(); // Ensure text is up-to-date before tool events
        stream.thinkingPhaseEnded = true;
        stream.toolOutputAccumulated = '';
        if (!stream.toolUsesArray.some(t => t.id === tool.id)) {
          stream.toolUsesArray = [...stream.toolUsesArray, tool];
        }
        emit(stream, 'snapshot-updated');
      },
      onToolResult: (res) => {
        markActive();
        stream.toolOutputAccumulated = '';
        const existingIdx = stream.toolResultsArray.findIndex(r => r.tool_use_id === res.tool_use_id);
        if (existingIdx >= 0) {
          const next = [...stream.toolResultsArray];
          next[existingIdx] = res;
          stream.toolResultsArray = next;
        } else {
          stream.toolResultsArray = [...stream.toolResultsArray, res];
        }
        emit(stream, 'snapshot-updated');
        // Refresh file tree after each tool completes
        window.dispatchEvent(new Event('refresh-file-tree'));
      },
      onToolOutput: (data) => {
        markActive();
        const next = stream.toolOutputAccumulated + (stream.toolOutputAccumulated ? '\n' : '') + data;
        stream.toolOutputAccumulated = next.length > 2000 ? next.slice(-2000) : next;
        emit(stream, 'snapshot-updated');
      },
      onToolProgress: (toolName, elapsed) => {
        markActive();
        stream.snapshot = { ...stream.snapshot, statusText: `Running ${toolName}... (${elapsed}s)` };
        emit(stream, 'snapshot-updated');
      },
      onSkillNudge: (data) => {
        // Broadcast as window event — ChatView listens and renders a
        // persistent banner. We don't use the snapshot because the nudge
        // should persist after the stream completes (snapshot gets cleared).
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('skill-nudge', {
            detail: { sessionId: params.sessionId, ...data },
          }));
        }
      },
      onContextCompressed: (data) => {
        markActive();
        // Dispatch the 'context-compressed' window event that ChatView
        // uses to flip hasSummary state and show the context indicator.
        // Also show a brief human-readable status line so the user knows
        // compression happened.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('context-compressed', {
            detail: { sessionId: params.sessionId, ...data },
          }));
        }
        // Show the compression message briefly in the status bar
        if (data.message) {
          stream.snapshot = { ...stream.snapshot, statusText: data.message };
          emit(stream, 'snapshot-updated');
          streamTimeout(stream, () => {
            if (stream.snapshot.statusText === data.message) {
              stream.snapshot = { ...stream.snapshot, statusText: undefined };
              emit(stream, 'snapshot-updated');
            }
          }, 5000); // Show for 5s so user can read it
        }
      },
      onStatus: (text) => {
        markActive();
        if (text === 'context_compressing_retry') {
          // Show a brief status while PTL auto-retry is in progress
          stream.snapshot = { ...stream.snapshot, statusText: 'Compressing context...' };
          emit(stream, 'snapshot-updated');
          return;
        }
        if (text?.startsWith('Connected (')) {
          stream.snapshot = { ...stream.snapshot, statusText: text };
          emit(stream, 'snapshot-updated');
          streamTimeout(stream, () => {
            // Only clear if still the same status
            if (stream.snapshot.statusText === text) {
              stream.snapshot = { ...stream.snapshot, statusText: undefined };
              emit(stream, 'snapshot-updated');
            }
          }, 2000);
        } else {
          stream.snapshot = { ...stream.snapshot, statusText: text };
          emit(stream, 'snapshot-updated');
        }
      },
      onResult: (usage, meta) => {
        markActive();
        stream.snapshot = {
          ...stream.snapshot,
          tokenUsage: usage,
          ...(meta?.terminalReason ? { terminalReason: meta.terminalReason } : {}),
        };
      },
      onRateLimit: (info) => {
        markActive();
        stream.snapshot = { ...stream.snapshot, rateLimitInfo: info };
        emit(stream, 'snapshot-updated');
      },
      onContextUsage: (snap) => {
        markActive();
        stream.snapshot = { ...stream.snapshot, contextUsageSnapshot: snap };
        emit(stream, 'snapshot-updated');
      },
      onPermissionRequest: (permData) => {
        markActive();
        stream.snapshot = {
          ...stream.snapshot,
          pendingPermission: permData,
          permissionResolved: null,
        };
        emit(stream, 'permission-request');
      },
      onToolTimeout: (toolName, elapsedSeconds) => {
        markActive();
        stream.toolTimeoutInfo = { toolName, elapsedSeconds };
      },
      onModeChanged: (sdkMode) => {
        markActive();
        if (params.onModeChanged) {
          params.onModeChanged(sdkMode);
        }
      },
      onTaskUpdate: () => {
        markActive();
        window.dispatchEvent(new CustomEvent('tasks-updated'));
      },
      onRewindPoint: (sdkUserMessageId) => {
        markActive();
        stream.rewindPoints = [...stream.rewindPoints, { userMessageId: sdkUserMessageId }];
      },
      onKeepAlive: () => {
        markActive();
      },
      onError: (acc) => {
        markActive();
        stream.accumulatedText = acc;
        emit(stream, 'snapshot-updated');
      },
      onInitMeta: (meta) => {
        markActive();
        params.onInitMeta?.(meta);
      },
    });

    // Flush any pending throttled text update before building final content
    flushTextThrottle();

    // Stream completed successfully — build final message content
    const accumulated = result.accumulated;
    const finalToolUses = stream.toolUsesArray;
    const finalToolResults = stream.toolResultsArray;
    const hasTools = finalToolUses.length > 0 || finalToolResults.length > 0;

    let messageContent = accumulated.trim();
    // Combine all thinking phases for persistence
    const allThinking = [stream.fullThinking, stream.accumulatedThinking]
      .filter(s => s.trim()).join('\n\n---\n\n');
    const hasThinking = allThinking.length > 0;
    if ((hasTools || hasThinking) && (messageContent || hasThinking)) {
      const contentBlocks: Array<Record<string, unknown>> = [];
      // Include thinking block if present — rendered as collapsed Reasoning in MessageItem
      if (hasThinking) {
        contentBlocks.push({ type: 'thinking', thinking: allThinking });
      }
      if (accumulated.trim()) {
        contentBlocks.push({ type: 'text', text: accumulated.trim() });
      }
      for (const tu of finalToolUses) {
        contentBlocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
        const tr = finalToolResults.find(r => r.tool_use_id === tu.id);
        if (tr) {
          contentBlocks.push({
            type: 'tool_result',
            tool_use_id: tr.tool_use_id,
            content: tr.content,
            ...(tr.is_error ? { is_error: true } : {}),
            ...(tr.media && tr.media.length > 0 ? { media: tr.media } : {}),
          });
        }
      }
      messageContent = JSON.stringify(contentBlocks);
    }

    // Update snapshot with completion info
    stream.snapshot = {
      ...buildSnapshot(stream),
      phase: 'completed',
      completedAt: Date.now(),
      tokenUsage: result.tokenUsage,
      finalMessageContent: messageContent || null,
      statusText: undefined,
      pendingPermission: null,
      permissionResolved: null,
    };
    stream.accumulatedText = '';
    stream.accumulatedThinking = '';
    stream.fullThinking = '';
    stream.thinkingPhaseEnded = false;
    stream.toolUsesArray = [];
    stream.toolResultsArray = [];
    stream.toolOutputAccumulated = '';

    cleanupTimers(stream);
    emit(stream, 'completed');
    scheduleGC(stream);

    // Refresh file tree after completion
    window.dispatchEvent(new CustomEvent('refresh-file-tree'));

  } catch (error) {
    flushTextThrottle();
    cleanupTimers(stream);

    // Helper: build finalMessageContent preserving any accumulated thinking.
    // On error/stop branches we previously only serialized accumulatedText,
    // silently dropping reasoning blocks that the user had already seen.
    const buildFinalContent = (textContent: string | null): string | null => {
      const allThinking = [stream.fullThinking, stream.accumulatedThinking]
        .filter(s => s.trim()).join('\n\n---\n\n');
      if (!allThinking) return textContent;
      // Wrap as content-block JSON so MessageItem can render the thinking block
      const blocks: Array<Record<string, unknown>> = [];
      blocks.push({ type: 'thinking', thinking: allThinking });
      if (textContent) blocks.push({ type: 'text', text: textContent });
      return JSON.stringify(blocks);
    };

    if (error instanceof DOMException && error.name === 'AbortError') {
      if (stream.isIdleTimeout) {
        // Idle timeout
        const idleSecs = Math.round(STREAM_IDLE_TIMEOUT_MS / 1000);
        const textPart = stream.accumulatedText.trim()
          ? stream.accumulatedText.trim() + `\n\n**Error:** Stream idle timeout — no response for ${idleSecs}s. The connection may have dropped.`
          : `**Error:** Stream idle timeout — no response for ${idleSecs}s. The connection may have dropped.`;

        stream.snapshot = {
          ...buildSnapshot(stream),
          phase: 'error',
          completedAt: Date.now(),
          error: `Stream idle timeout (${idleSecs}s)`,
          finalMessageContent: buildFinalContent(textPart),
          statusText: undefined,
          pendingPermission: null,
          permissionResolved: null,
        };
        stream.accumulatedText = '';
        stream.accumulatedThinking = '';
        stream.fullThinking = '';
        stream.toolUsesArray = [];
        stream.toolResultsArray = [];
        stream.toolOutputAccumulated = '';
        emit(stream, 'completed');
        // Clear stale SDK session so next message starts fresh
        fetch(`/api/chat/sessions/${encodeURIComponent(stream.sessionId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdk_session_id: '' }),
        }).catch(() => {});
        scheduleGC(stream);
      } else if (stream.toolTimeoutInfo) {
        // Tool timeout — auto-retry
        const timeoutInfo = stream.toolTimeoutInfo;
        const textPart = stream.accumulatedText.trim()
          ? stream.accumulatedText.trim() + `\n\n*(tool ${timeoutInfo.toolName} timed out after ${timeoutInfo.elapsedSeconds}s)*`
          : null;

        stream.snapshot = {
          ...buildSnapshot(stream),
          phase: 'stopped',
          completedAt: Date.now(),
          finalMessageContent: buildFinalContent(textPart),
          statusText: undefined,
          pendingPermission: null,
          permissionResolved: null,
        };
        stream.accumulatedText = '';
        stream.accumulatedThinking = '';
        stream.fullThinking = '';
        stream.toolUsesArray = [];
        stream.toolResultsArray = [];
        stream.toolOutputAccumulated = '';
        stream.toolTimeoutInfo = null;
        emit(stream, 'completed');
        scheduleGC(stream);

        // Auto-retry via sendMessageFn
        if (stream.sendMessageFn) {
          const fn = stream.sendMessageFn;
          streamTimeout(stream, () => {
            fn(
              `The previous tool "${timeoutInfo.toolName}" timed out after ${timeoutInfo.elapsedSeconds} seconds. Please try a different approach to accomplish the task. Avoid repeating the same operation that got stuck.`
            );
          }, 500);
        }
      } else {
        // User manually stopped — add partial content with "(generation stopped)"
        const textPart = stream.accumulatedText.trim()
          ? stream.accumulatedText.trim() + '\n\n*(generation stopped)*'
          : null;

        stream.snapshot = {
          ...buildSnapshot(stream),
          phase: 'stopped',
          completedAt: Date.now(),
          finalMessageContent: buildFinalContent(textPart),
          statusText: undefined,
          pendingPermission: null,
          permissionResolved: null,
        };
        stream.accumulatedText = '';
        stream.accumulatedThinking = '';
        stream.fullThinking = '';
        stream.toolUsesArray = [];
        stream.toolResultsArray = [];
        stream.toolOutputAccumulated = '';
        emit(stream, 'completed');
        scheduleGC(stream);
      }
    } else {
      // Non-abort error
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      stream.snapshot = {
        ...buildSnapshot(stream),
        phase: 'error',
        completedAt: Date.now(),
        error: errMsg,
        finalMessageContent: buildFinalContent(`**Error:** ${errMsg}`),
        statusText: undefined,
        pendingPermission: null,
        permissionResolved: null,
      };
      stream.accumulatedText = '';
      stream.accumulatedThinking = '';
      stream.fullThinking = '';
      stream.toolUsesArray = [];
      stream.toolResultsArray = [];
      stream.toolOutputAccumulated = '';
      emit(stream, 'completed');
      scheduleGC(stream);
    }
  }
}

// ==========================================
// Stop
// ==========================================

export function stopStream(sessionId: string): void {
  const stream = getStreamsMap().get(sessionId);
  if (stream && stream.snapshot.phase === 'active') {
    // Try graceful interrupt first, fallback to abort
    fetch('/api/chat/interrupt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {
      // Interrupt failed, force abort
    }).finally(() => {
      // Always abort after a short delay to ensure cleanup
      streamTimeout(stream, () => {
        if (stream.snapshot.phase === 'active') {
          stream.abortController.abort();
        }
      }, 2000);
    });
  }
}

// ==========================================
// Subscribe
// ==========================================

export function subscribe(sessionId: string, listener: StreamEventListener): () => void {
  const listenersMap = getListenersMap();
  let listeners = listenersMap.get(sessionId);
  if (!listeners) {
    listeners = new Set();
    listenersMap.set(sessionId, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners!.delete(listener);
    if (listeners!.size === 0) {
      listenersMap.delete(sessionId);
    }
  };
}

// ==========================================
// Snapshot access
// ==========================================

export function getSnapshot(sessionId: string): SessionStreamSnapshot | null {
  const stream = getStreamsMap().get(sessionId);
  if (!stream) return null;
  // Don't return stale placeholder entries
  if (stream.snapshot.startedAt === 0) return null;
  return stream.snapshot;
}

export function isStreamActive(sessionId: string): boolean {
  const stream = getStreamsMap().get(sessionId);
  return stream?.snapshot.phase === 'active' || false;
}

export function getRewindPoints(sessionId: string): Array<{ userMessageId: string }> {
  const stream = getStreamsMap().get(sessionId);
  return stream?.rewindPoints ?? [];
}

export function getActiveSessionIds(): string[] {
  const ids: string[] = [];
  for (const [id, stream] of getStreamsMap()) {
    if (stream.snapshot.phase === 'active') {
      ids.push(id);
    }
  }
  return ids;
}

// ==========================================
// Permission response
// ==========================================

export async function respondToPermission(
  sessionId: string,
  decision: 'allow' | 'allow_session' | 'deny',
  updatedInput?: Record<string, unknown>,
  denyMessage?: string,
): Promise<void> {
  const stream = getStreamsMap().get(sessionId);
  if (!stream || !stream.snapshot.pendingPermission) return;

  const perm = stream.snapshot.pendingPermission;

  const body = {
    permissionRequestId: perm.permissionRequestId,
    decision: decision === 'deny'
      ? { behavior: 'deny' as const, message: denyMessage || 'User denied permission' }
      : {
          behavior: 'allow' as const,
          ...(decision === 'allow_session' && perm.suggestions
            ? { updatedPermissions: perm.suggestions }
            : {}),
          ...(updatedInput ? { updatedInput } : {}),
        },
  };

  // Update snapshot immediately
  stream.snapshot = {
    ...stream.snapshot,
    permissionResolved: decision === 'deny' ? 'deny' : 'allow',
  };
  emit(stream, 'snapshot-updated');

  try {
    await fetch('/api/chat/permission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Best effort
  }

  // Clear permission state after delay (only if no new request arrived)
  const answeredId = perm.permissionRequestId;
  streamTimeout(stream, () => {
    if (stream.snapshot.pendingPermission?.permissionRequestId === answeredId) {
      stream.snapshot = {
        ...stream.snapshot,
        pendingPermission: null,
        permissionResolved: null,
      };
      emit(stream, 'snapshot-updated');
    }
  }, 1000);
}

// ==========================================
// Cleanup
// ==========================================

export function clearSnapshot(sessionId: string): void {
  const stream = getStreamsMap().get(sessionId);
  if (stream && stream.snapshot.phase !== 'active') {
    if (stream.gcTimer) clearTimeout(stream.gcTimer);
    // Reset the snapshot (listeners are in a separate registry)
    stream.snapshot = {
      ...stream.snapshot,
      startedAt: 0,
      finalMessageContent: null,
    };
  }
}

/**
 * Seed a snapshot with initial patch for paths that don't go through
 * startStream() — currently only the first-message flow in
 * `app/chat/page.tsx`, which hand-parses SSE, creates a session row, and
 * redirects to /chat/[id]. Without this seed, the snapshot the redirected
 * ChatView reads is null and first-turn signals (terminal_reason,
 * rate_limit_info) never reach the chip/banner UI.
 *
 * Registers a minimal ActiveStream with phase='completed' if none exists.
 * If a full stream is already registered (shouldn't normally happen on
 * first turn), just merges the patch into the existing snapshot.
 */
export function seedSnapshotPatch(
  sessionId: string,
  patch: Partial<SessionStreamSnapshot>,
): void {
  const map = getStreamsMap();
  const existing = map.get(sessionId);
  if (existing) {
    existing.snapshot = { ...existing.snapshot, ...patch };
    emit(existing, 'snapshot-updated');
    return;
  }
  // Register a placeholder stream. It's not 'active' so the ChatView will
  // treat it as post-stream state; no subscription wiring needed because
  // the ChatView that reads it will re-subscribe on mount (its own useEffect).
  const placeholder: ActiveStream = {
    sessionId,
    abortController: new AbortController(),
    idleCheckTimer: null,
    lastEventTime: Date.now(),
    gcTimer: null,
    pendingTimers: new Set(),
    accumulatedText: '',
    accumulatedThinking: '',
    fullThinking: '',
    thinkingPhaseEnded: false,
    toolUsesArray: [],
    toolResultsArray: [],
    toolOutputAccumulated: '',
    toolTimeoutInfo: null,
    isIdleTimeout: false,
    sendMessageFn: null,
    rewindPoints: [],
    snapshot: {
      sessionId,
      phase: 'completed',
      streamingContent: '',
      streamingThinkingContent: '',
      toolUses: [],
      toolResults: [],
      streamingToolOutput: '',
      statusText: undefined,
      pendingPermission: null,
      permissionResolved: null,
      tokenUsage: null,
      startedAt: Date.now(),
      completedAt: Date.now(),
      error: null,
      finalMessageContent: null,
      ...patch,
    },
  };
  map.set(sessionId, placeholder);
}
