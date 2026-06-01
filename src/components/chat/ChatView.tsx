'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Message, MessagesResponse, FileAttachment, SessionStreamSnapshot, MentionRef } from '@/types';
import { MessageList } from './MessageList';
import { TerminalReasonChip } from './TerminalReasonChip';
import { RateLimitBanner } from './RateLimitBanner';
import { MessageInput } from './MessageInput';
import { ChatComposerActionBar } from './ChatComposerActionBar';
import { ModeIndicator } from './ModeIndicator';
import { ChatPermissionSelector } from './ChatPermissionSelector';
import { ContextUsageIndicator } from './ContextUsageIndicator';
import { RuntimeBadge } from './RuntimeBadge';
import { ImageGenToggle } from './ImageGenToggle';
import { Button } from '@/components/ui/button';
import { usePanel } from '@/hooks/usePanel';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n';
import { PermissionPrompt } from './PermissionPrompt';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BatchExecutionDashboard, BatchContextSync } from './batch-image-gen';
import { setLastGeneratedImages, loadLastGenerated } from '@/lib/image-ref-store';
import { useChatCommands } from '@/hooks/useChatCommands';
import { useAssistantTrigger } from '@/hooks/useAssistantTrigger';
import { useStreamSubscription } from '@/hooks/useStreamSubscription';
import {
  startStream,
  stopStream,
  getSnapshot,
  getRewindPoints,
  respondToPermission,
} from '@/lib/stream-session-manager';

interface QueuedMessage {
  content: string;
  files?: FileAttachment[];
  systemPromptAppend?: string;
  displayOverride?: string;
  mentions?: MentionRef[];
}

interface ChatViewProps {
  sessionId: string;
  initialMessages?: Message[];
  initialHasMore?: boolean;
  modelName?: string;
  providerId?: string;
  initialPermissionProfile?: 'default' | 'full_access';
  initialMode?: 'code' | 'plan';
  initialHasSummary?: boolean;
}

/** Maximum messages kept in React state. Older messages are trimmed and reloaded on scroll. */
const MAX_MESSAGES_IN_MEMORY = 300;

export function ChatView({ sessionId, initialMessages = [], initialHasMore = false, modelName, providerId, initialPermissionProfile, initialMode, initialHasSummary }: ChatViewProps) {
  const { setStreamingSessionId, workingDirectory, setPendingApprovalSessionId, setDashboardPanelOpen, setFileTreeOpen, setIsAssistantWorkspace } = usePanel();
  const { t } = useTranslation();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [permissionProfile, setPermissionProfile] = useState<'default' | 'full_access'>(initialPermissionProfile || 'default');

  // Whether this session's working directory matches the configured assistant workspace
  const [isAssistantProject, setIsAssistantProject] = useState(false);
  const [assistantName, setAssistantName] = useState('');

  // Workspace mismatch banner state
  const [workspaceMismatchPath, setWorkspaceMismatchPath] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  /** Tracks whether the tail (newest messages) was trimmed during a prepend. */
  const tailTrimmedRef = useRef(false);

  /**
   * Capped message setter for append paths (user send, stream completion, commands).
   *
   * - Normal case: trims head (oldest) when exceeding cap, sets hasMore = true.
   * - If tail was previously trimmed by a prepend (user scrolled far up): re-fetches
   *   the latest messages from DB as a fresh base, then applies the append on top.
   *   This slides the window back to the bottom without losing the new message.
   */
  /**
   * Reconcile the message window with DB after tail was trimmed.
   * Preserves local-only cmd-* messages (/help, /cost) since they're never persisted.
   * Called with a delay to ensure pending persists have completed.
   */
  const reconcileWithDb = useCallback(() => {
    fetch(`/api/chat/sessions/${sessionId}/messages?limit=50`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.messages) return;
        setHasMore(data.hasMore ?? true);
        const dbMessages: Message[] = data.messages;
        setMessages(current => {
          const localCommands = current.filter(m => m.id.startsWith('cmd-'));
          if (localCommands.length === 0) return dbMessages;
          const merged = [...dbMessages, ...localCommands];
          return merged.length > MAX_MESSAGES_IN_MEMORY
            ? merged.slice(-MAX_MESSAGES_IN_MEMORY)
            : merged;
        });
      })
      .catch(() => { /* keep current state as-is */ });
  }, [sessionId]);

  const cappedSetMessages: typeof setMessages = useCallback((action) => {
    setMessages((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (next.length > MAX_MESSAGES_IN_MEMORY) {
        setHasMore(true);
        return next.slice(-MAX_MESSAGES_IN_MEMORY);
      }
      return next;
    });
  }, []);
  const [mode, setMode] = useState<string>(initialMode || 'code');
  const [currentModel, setCurrentModel] = useState(() => modelName || (typeof window !== 'undefined' ? localStorage.getItem('codepilot:last-model') : null) || 'sonnet');
  const [currentProviderId, setCurrentProviderId] = useState(() => providerId || (typeof window !== 'undefined' ? localStorage.getItem('codepilot:last-provider-id') : null) || '');
  const [selectedEffort, setSelectedEffort] = useState<string | undefined>(undefined);
  const [thinkingMode, setThinkingMode] = useState<string>('adaptive');
  const [context1m, setContext1m] = useState(false);
  const [hasSummary, setHasSummary] = useState(initialHasSummary || false);

  // Sync model/provider when session data loads
  useEffect(() => { if (modelName) setCurrentModel(modelName); }, [modelName]);
  useEffect(() => { if (providerId) setCurrentProviderId(providerId); }, [providerId]);

  // Fetch provider-specific options (with abort to prevent stale responses on fast switch)
  useEffect(() => {
    const pid = currentProviderId || 'env';
    const controller = new AbortController();
    fetch(`/api/providers/options?providerId=${encodeURIComponent(pid)}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!controller.signal.aborted) {
          setThinkingMode(data?.options?.thinking_mode || 'adaptive');
          setContext1m(!!data?.options?.context_1m);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [currentProviderId]);

  // Resolve upstream model ID for the current model/provider so the context
  // indicator can disambiguate alias windows (first-party opus = 1M vs
  // Bedrock/Vertex opus = 200K). /api/providers/models already returns
  // upstreamModelId per model on the returned groups.
  const [currentModelUpstream, setCurrentModelUpstream] = useState<string | undefined>(undefined);
  useEffect(() => {
    const pid = currentProviderId || 'env';
    const controller = new AbortController();
    fetch('/api/providers/models', { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (controller.signal.aborted) return;
        const group = data?.groups?.find((g: { provider_id: string }) => g.provider_id === pid);
        const model = group?.models?.find((m: { value: string }) => m.value === currentModel);
        setCurrentModelUpstream(model?.upstreamModelId);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [currentProviderId, currentModel]);
  useEffect(() => { if (initialPermissionProfile) setPermissionProfile(initialPermissionProfile); }, [initialPermissionProfile]);

  // Restore session-scoped last-generated images from sessionStorage
  useEffect(() => { loadLastGenerated(sessionId); }, [sessionId]);

  // Stream snapshot from the manager — drives all streaming UI
  const [streamSnapshot, setStreamSnapshot] = useState<SessionStreamSnapshot | null>(
    () => getSnapshot(sessionId)
  );

  // Derive rendering state from snapshot
  const isStreaming = streamSnapshot?.phase === 'active';
  const streamingContent = streamSnapshot?.streamingContent ?? '';
  const toolUses = streamSnapshot?.toolUses ?? [];
  const toolResults = streamSnapshot?.toolResults ?? [];
  const streamingToolOutput = streamSnapshot?.streamingToolOutput ?? '';
  const streamingThinkingContent = streamSnapshot?.streamingThinkingContent ?? '';
  const statusText = streamSnapshot?.statusText;
  const pendingPermission = streamSnapshot?.pendingPermission ?? null;
  const permissionResolved = streamSnapshot?.permissionResolved ?? null;
  const rewindPoints = getRewindPoints(sessionId);

  // ── Skill nudge banner ──
  // Listens for 'skill-nudge' window events dispatched by stream-session-manager
  // when the agent loop completes a complex multi-step workflow.
  const [skillNudge, setSkillNudge] = useState<{
    message: string;
    step: number;
    distinctToolCount: number;
    toolNames: string[];
  } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sessionId === sessionId) {
        setSkillNudge({
          message: detail.message || '',
          step: detail.step || 0,
          distinctToolCount: detail.distinctToolCount || 0,
          toolNames: detail.toolNames || [],
        });
      }
    };
    window.addEventListener('skill-nudge', handler);
    return () => window.removeEventListener('skill-nudge', handler);
  }, [sessionId]);

  // Clear nudge when starting a new message (new workflow begins)
  useEffect(() => {
    if (isStreaming) setSkillNudge(null);
  }, [isStreaming]);

  // ── Message queue — allows sending while AI is responding ──
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const dequeuingRef = useRef(false);

  // Pending image generation notices
  const pendingImageNoticesRef = useRef<string[]>([]);
  const sendMessageRef = useRef<(content: string, files?: FileAttachment[], systemPromptAppend?: string, displayOverride?: string, mentions?: MentionRef[]) => Promise<void>>(undefined);
  const initMetaRef = useRef<{ tools?: unknown; slash_commands?: unknown; skills?: unknown } | null>(null);

  const handleModeChange = useCallback((newMode: string) => {
    setMode(newMode);
    if (sessionId) {
      fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      }).then(() => {
        window.dispatchEvent(new CustomEvent('session-updated'));
      }).catch(() => { /* silent */ });

      fetch('/api/chat/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, mode: newMode }),
      }).catch(() => { /* silent */ });
    }
  }, [sessionId]);

  const handleProviderModelChange = useCallback((newProviderId: string, model: string) => {
    setCurrentProviderId(newProviderId);
    setCurrentModel(model);
    fetch(`/api/chat/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, provider_id: newProviderId }),
    }).catch(() => {});
  }, [sessionId]);

  // ── Extracted hooks ──

  const handleStreamCompleted = useCallback((phase: string) => {
    // Only reconcile on normal completion — both messages are persisted.
    // Error/stopped/idle-timeout paths emit 'completed' before the server
    // has persisted partial output, so reconciliation would race.
    if (tailTrimmedRef.current && phase === 'completed') {
      tailTrimmedRef.current = false;
      reconcileWithDb();
    }
  }, [reconcileWithDb]);

  useStreamSubscription({
    sessionId,
    setStreamSnapshot,
    setStreamingSessionId,
    setPendingApprovalSessionId,
    setMessages: cappedSetMessages,
    onStreamCompleted: handleStreamCompleted,
  });

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initialMessages.length > 0 && !initializedRef.current) {
      initializedRef.current = true;
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  useEffect(() => { setHasMore(initialHasMore); }, [initialHasMore]);

  // Detect compression from multiple sources:
  // 1. Auto-compression: stream-session-manager dispatches 'context-compressed' event
  // 2. Manual /compact: response message contains the compression marker
  useEffect(() => {
    if (!hasSummary && messages.some(m => m.role === 'assistant' && m.content.includes('上下文已压缩'))) {
      setHasSummary(true);
    }
  }, [messages, hasSummary]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sessionId === sessionId) {
        setHasSummary(true);
        // Phase 1b: if the user asked for "compress and retry", kick off
        // the retry now that compression actually finished. Stored flag
        // + last user message are consumed once so we can't replay
        // twice. Staleness protection uses (a) the arming-flag gate in
        // the sendMessage wrapper to clear pending state on any
        // subsequent user action, (b) the 45s timeout on the arm, and
        // (c) the session-switch clear — no per-request / compact run
        // id is wired through the SSE contract, so we rely on those
        // three clears rather than a correlation token.
        if (pendingRetryAfterCompactRef.current && pendingRetryMessageRef.current) {
          const msg = pendingRetryMessageRef.current;
          clearPendingRetry();
          // Small delay so compression SSE pipeline flushes before next send.
          setTimeout(() => {
            sendMessageRef.current?.(msg);
          }, 100);
        }
      }
    };
    window.addEventListener('context-compressed', handler);
    return () => window.removeEventListener('context-compressed', handler);
  }, [sessionId]);

  // Phase 1b — TerminalReason action state
  // Refs (not state) so the context-compressed handler above can read the
  // latest value without re-subscribing.
  const pendingRetryAfterCompactRef = useRef(false);
  const pendingRetryMessageRef = useRef<string | null>(null);
  /** Timeout handle so we don't leak a pending retry if /compact never
   *  emits context-compressed (e.g. network error, user cancels). */
  const pendingRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True for the synchronous window where compress_and_retry is arming
   *  its own /compact call. Used by the sendMessage wrapper to avoid
   *  clearing the pending state we just set. Resets to false right after
   *  the sendMessageRef call returns (sendMessage runs its synchronous
   *  prefix — including the wrapper's stale-retry check — before the
   *  control returns here). */
  const retryArmingInProgressRef = useRef(false);

  const clearPendingRetry = useCallback(() => {
    pendingRetryAfterCompactRef.current = false;
    pendingRetryMessageRef.current = null;
    if (pendingRetryTimerRef.current) {
      clearTimeout(pendingRetryTimerRef.current);
      pendingRetryTimerRef.current = null;
    }
  }, []);

  // Safety: drop any pending retry state on session switch — stale
  // cross-session replay would be nonsense.
  useEffect(() => {
    clearPendingRetry();
  }, [sessionId, clearPendingRetry]);
  const [pendingTerminalAction, setPendingTerminalAction] = useState<{
    actionId: import('./TerminalReasonChip').TerminalActionId;
    lastUserMessage: string;
  } | null>(null);
  // Phase 2 — user can dismiss the rate-limit banner; keeps it from
  // re-rendering on snapshot updates within the same session. Resets on
  // session switch because the snapshot state itself resets.
  const [rateLimitDismissed, setRateLimitDismissed] = useState(false);
  useEffect(() => { setRateLimitDismissed(false); }, [sessionId]);

  // Find the most recent user message — replay target for retry actions.
  const findLastUserMessage = useCallback((): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].content;
    }
    return null;
  }, [messages]);

  // Execute an action after confirmation (or immediately for non-destructive ones).
  const runTerminalAction = useCallback((actionId: import('./TerminalReasonChip').TerminalActionId, lastUserMessage: string | null) => {
    switch (actionId) {
      case 'compress_and_retry': {
        if (!lastUserMessage) return;
        // Arm the retry. Safety nets for stale-replay:
        //   - 45s timeout (in case /compact never emits context-compressed)
        //   - session switch clears it (useEffect with clearPendingRetry)
        //   - any subsequent user-initiated sendMessage clears it
        //     (including manual /compact or compress_only — per round-13
        //     Codex review: we can't rely on content equality to
        //     distinguish internal vs manual /compact since a user can
        //     type /compact themselves)
        pendingRetryAfterCompactRef.current = true;
        pendingRetryMessageRef.current = lastUserMessage;
        if (pendingRetryTimerRef.current) clearTimeout(pendingRetryTimerRef.current);
        pendingRetryTimerRef.current = setTimeout(() => {
          console.warn('[chat] compress-and-retry timed out — pending retry cleared');
          clearPendingRetry();
        }, 45_000);
        // Mark the synchronous arming window so the sendMessage wrapper
        // below skips its stale-retry clear on THIS call. The wrapper's
        // check is synchronous (runs before the first await in
        // sendMessage), so resetting the flag right after the call is
        // sufficient — no microtask deferral needed.
        retryArmingInProgressRef.current = true;
        try {
          sendMessageRef.current?.('/compact');
        } finally {
          retryArmingInProgressRef.current = false;
        }
        break;
      }
      case 'compress_only':
        // User chose "just compress, don't replay" — drop any previously
        // armed compress_and_retry so its pendingRetryMessage can't ride
        // on THIS compact's context-compressed event.
        clearPendingRetry();
        sendMessageRef.current?.('/compact');
        break;
      case 'enable_1m_and_retry':
        if (!lastUserMessage) return;
        setContext1m(true);
        // Persist per-provider so future sessions keep 1M until user opts out.
        fetch(`/api/providers/options?providerId=${encodeURIComponent(currentProviderId || 'env')}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ options: { context_1m: true } }),
        }).catch(() => {});
        setTimeout(() => sendMessageRef.current?.(lastUserMessage), 50);
        break;
      case 'switch_to_sonnet':
        if (!lastUserMessage) return;
        setCurrentModel('sonnet');
        setTimeout(() => sendMessageRef.current?.(lastUserMessage), 50);
        break;
      case 'continue_max_turns':
        sendMessageRef.current?.('continue');
        break;
      case 'retry_simple':
        if (!lastUserMessage) return;
        sendMessageRef.current?.(lastUserMessage);
        break;
      case 'open_hook_settings':
        router.push('/settings');
        break;
      case 'retry_image_upload':
        // No attachments API exposure here yet — surface a toast nudging
        // the user to re-drag the image. Full wire lands with Phase 2's
        // attachment UX work.
        import('@/hooks/useToast').then(({ showToast }) => {
          showToast({ type: 'info', message: t('terminalAction.retryImageUpload' as TranslationKey), duration: 4000 });
        }).catch(() => {});
        break;
    }
  }, [currentProviderId, router, t]);

  // Entry point from the chip. Destructive actions route through confirm
  // dialog; non-destructive ones run immediately.
  const CONFIRM_REQUIRED = new Set<import('./TerminalReasonChip').TerminalActionId>([
    'compress_and_retry',
    'enable_1m_and_retry',
    'switch_to_sonnet',
    'retry_simple',
  ]);

  const handleTerminalAction = useCallback((actionId: import('./TerminalReasonChip').TerminalActionId) => {
    const lastUserMessage = findLastUserMessage();
    if (CONFIRM_REQUIRED.has(actionId) && lastUserMessage) {
      setPendingTerminalAction({ actionId, lastUserMessage });
    } else {
      runTerminalAction(actionId, lastUserMessage);
    }
  }, [findLastUserMessage, runTerminalAction]);

  const buildThinkingConfig = useCallback((): { type: string } | undefined => {
    if (!thinkingMode || thinkingMode === 'adaptive') return { type: 'adaptive' };
    if (thinkingMode === 'enabled') return { type: 'enabled' };
    if (thinkingMode === 'disabled') return { type: 'disabled' };
    return undefined;
  }, [thinkingMode]);

  const checkAssistantTrigger = useAssistantTrigger({
    sessionId,
    workingDirectory,
    isStreaming,
    mode,
    currentModel,
    currentProviderId,
    initialMessages,
    handleModeChange,
    buildThinkingConfig,
    sendMessageRef,
    initMetaRef,
  });

  // Detect workspace mismatch
  useEffect(() => {
    if (!workingDirectory) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/workspace');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        if (data.path && workingDirectory !== data.path) {
          setIsAssistantProject(false);
          setIsAssistantWorkspace(false);
          const inspectRes = await fetch(`/api/workspace/inspect?path=${encodeURIComponent(workingDirectory)}`);
          if (!inspectRes.ok || cancelled) return;
          const inspectData = await inspectRes.json();
          if (inspectData.hasAssistantData) {
            setWorkspaceMismatchPath(data.path);
          } else {
            setWorkspaceMismatchPath(null);
          }
        } else {
          // workingDirectory matches assistant workspace path
          const isAssistant = !!data.path;
          setIsAssistantProject(isAssistant);
          setWorkspaceMismatchPath(null);
          setIsAssistantWorkspace(isAssistant);
          // Default panel is now controlled by the user's "Default Side Panel" setting
          // in chat/[id]/page.tsx — no longer force-override for assistant workspaces.
          // Load assistant name for avatar display
          if (data.path) {
            try {
              const summaryRes = await fetch('/api/workspace/summary');
              if (summaryRes.ok && !cancelled) {
                const summary = await summaryRes.json();
                setAssistantName(summary.name || '');
                // Store buddy emoji globally for MessageItem avatar rendering
                // Store buddy info globally for MessageItem avatar rendering
                (globalThis as Record<string, unknown>).__codepilot_buddy_info__ = summary.buddy
                  ? { emoji: summary.buddy.emoji, species: summary.buddy.species, rarity: summary.buddy.rarity }
                  : undefined;
              }
            } catch { /* ignore */ }
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [workingDirectory]);

  // Listen for workspace-switched events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.newPath && workingDirectory && workingDirectory === detail.oldPath) {
        setWorkspaceMismatchPath(detail.newPath);
      }
    };
    window.addEventListener('assistant-workspace-switched', handler);
    return () => window.removeEventListener('assistant-workspace-switched', handler);
  }, [workingDirectory]);

  const handleOpenNewAssistant = useCallback(async () => {
    try {
      const model = typeof window !== 'undefined' ? localStorage.getItem('codepilot:last-model') || '' : '';
      const provider_id = typeof window !== 'undefined' ? localStorage.getItem('codepilot:last-provider-id') || '' : '';
      const res = await fetch('/api/workspace/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'checkin', model, provider_id }),
      });
      if (res.ok) {
        const data = await res.json();
        window.dispatchEvent(new CustomEvent('session-created'));
        router.push(`/chat/${data.session.id}`);
      }
    } catch (e) {
      console.error('[ChatView] Failed to open assistant session:', e);
    }
  }, [router]);

  const loadEarlierMessages = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || messages.length === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const earliest = messages[0];
      const earliestRowId = (earliest as Message & { _rowid?: number })._rowid;
      if (!earliestRowId) return;
      const res = await fetch(`/api/chat/sessions/${sessionId}/messages?limit=100&before=${earliestRowId}`);
      if (!res.ok) return;
      const data: MessagesResponse = await res.json();
      setHasMore(data.hasMore ?? false);
      if (data.messages.length > 0) {
        setMessages(prev => {
          const merged = [...data.messages, ...prev];
          if (merged.length > MAX_MESSAGES_IN_MEMORY) {
            // Trim newest messages off the tail — they'll be restored when
            // the next append triggers cappedSetMessages (re-fetches from DB).
            tailTrimmedRef.current = true;
            return merged.slice(0, MAX_MESSAGES_IN_MEMORY);
          }
          return merged;
        });
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [sessionId, messages, hasMore]);

  const stopStreaming = useCallback(() => { stopStream(sessionId); }, [sessionId]);

  const handlePermissionResponse = useCallback(
    async (decision: 'allow' | 'allow_session' | 'deny', updatedInput?: Record<string, unknown>, denyMessage?: string) => {
      setPendingApprovalSessionId('');
      await respondToPermission(sessionId, decision, updatedInput, denyMessage);
    },
    [sessionId, setPendingApprovalSessionId]
  );

  /** Start an API stream for the given content. Does NOT add a user message to the list. */
  const doStartStream = useCallback(
    (content: string, files?: FileAttachment[], systemPromptAppend?: string, displayOverride?: string, mentions?: MentionRef[]) => {
      const notices = pendingImageNoticesRef.current.length > 0
        ? [...pendingImageNoticesRef.current]
        : undefined;
      if (notices) pendingImageNoticesRef.current = [];

      startStream({
        sessionId,
        content,
        mode,
        model: currentModel,
        providerId: currentProviderId,
        files,
        systemPromptAppend,
        pendingImageNotices: notices,
        // 'auto' sentinel means "no explicit effort" — filter it here so
        // the CLI applies its per-model default (Opus 4.7 → xhigh, etc.)
        effort: selectedEffort && selectedEffort !== 'auto' ? selectedEffort : undefined,
        thinking: buildThinkingConfig(),
        context1m,
        displayOverride,
        mentions,
        onModeChanged: (sdkMode) => {
          const uiMode = sdkMode === 'plan' ? 'plan' : 'code';
          handleModeChange(uiMode);
        },
        sendMessageFn: (retryContent: string, retryFiles?: FileAttachment[]) => {
          sendMessageRef.current?.(retryContent, retryFiles);
        },
        onInitMeta: (meta) => {
          initMetaRef.current = meta;
          console.log('[ChatView] SDK init meta received:', meta);
        },
      });
    },
    [sessionId, mode, currentModel, currentProviderId, selectedEffort, context1m, buildThinkingConfig, handleModeChange]
  );

  const sendMessage = useCallback(
    async (content: string, files?: FileAttachment[], systemPromptAppend?: string, displayOverride?: string, mentions?: MentionRef[]) => {
      const displayUserContent = displayOverride || content;
      let displayContent = displayUserContent;
      if (files && files.length > 0) {
        const fileMeta = files.map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size }));
        displayContent = `<!--files:${JSON.stringify(fileMeta)}-->${displayUserContent}`;
      }

      // Phase 1b safety: if a compress_and_retry is armed, drop it
      // whenever the user sends ANY new content — including a manual
      // /compact typed themselves or a "仅压缩" click. Without this, a
      // retry queued by Action Chip would piggyback on a later
      // user-initiated /compact's context-compressed event and replay
      // the old lastUserMessage out of order.
      //
      // The retryArmingInProgressRef flag excludes the one
      // synchronous call the compress_and_retry action itself makes
      // through this wrapper — that call must NOT clear the state it
      // just set. runTerminalAction flips the flag on before calling
      // sendMessageRef and off again right after.
      if (pendingRetryAfterCompactRef.current && !retryArmingInProgressRef.current) {
        clearPendingRetry();
      }

      // Queue message if currently streaming — hold above input, send after completion
      if (isStreaming) {
        setMessageQueue((prev) => [...prev, { content, files, systemPromptAppend, displayOverride, mentions }]);
        return;
      }

      const userMessage: Message = {
        id: 'temp-' + Date.now(),
        session_id: sessionId,
        role: 'user',
        content: displayContent,
        created_at: new Date().toISOString(),
        token_usage: null,
      };
      cappedSetMessages((prev) => [...prev, userMessage]);
      doStartStream(content, files, systemPromptAppend, displayOverride, mentions);
    },
    [sessionId, isStreaming, doStartStream, cappedSetMessages]
  );

  sendMessageRef.current = sendMessage;

  // ── Dequeue: when streaming finishes and queue is non-empty, send next ──
  useEffect(() => {
    if (!isStreaming && messageQueue.length > 0 && !dequeuingRef.current) {
      dequeuingRef.current = true;
      const [next, ...rest] = messageQueue;
      setMessageQueue(rest);
      // Add the queued message to the conversation as a normal user message
      const displayUserContent = next.displayOverride || next.content;
      let displayContent = displayUserContent;
      if (next.files && next.files.length > 0) {
        const fileMeta = next.files.map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size }));
        displayContent = `<!--files:${JSON.stringify(fileMeta)}-->${displayUserContent}`;
      }
      const userMessage: Message = {
        id: 'temp-' + Date.now(),
        session_id: sessionId,
        role: 'user',
        content: displayContent,
        created_at: new Date().toISOString(),
        token_usage: null,
      };
      cappedSetMessages((prev) => [...prev, userMessage]);
      doStartStream(next.content, next.files, next.systemPromptAppend, next.displayOverride, next.mentions);
    }
    if (isStreaming) {
      dequeuingRef.current = false;
    }
  }, [isStreaming, messageQueue, doStartStream, cappedSetMessages, sessionId]);

  // Expose widget drill-down bridge: widgets can call window.__widgetSendMessage(text)
  // to trigger follow-up questions (e.g. clicking a node to get deeper explanation)
  // Hardened: type-checked, length-limited, rate-limited, sanitized.
  useEffect(() => {
    let lastCallTime = 0;
    const RATE_LIMIT_MS = 2000;
    const MAX_LENGTH = 500;

    const bridge = (text: unknown) => {
      if (typeof text !== 'string') return;
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > MAX_LENGTH) return;

      // Rate limit: max one message per 2 seconds
      const now = Date.now();
      if (now - lastCallTime < RATE_LIMIT_MS) return;
      lastCallTime = now;

      sendMessageRef.current?.(trimmed);
    };
    (window as unknown as Record<string, unknown>).__widgetSendMessage = bridge;
    return () => {
      delete (window as unknown as Record<string, unknown>).__widgetSendMessage;
    };
  }, []);

  // Listen for widget pin requests from PinnableWidget buttons.
  // The AI model receives the widget code + instructions and calls the
  // codepilot_dashboard_pin MCP tool to complete the pin operation.
  useEffect(() => {
    const handler = (e: Event) => {
      const { widgetCode, title } = (e as CustomEvent).detail || {};
      if (!widgetCode || !sendMessageRef.current) return;

      const instruction = `请将下面的可视化组件固定到项目看板。\n\n标题建议：${title || 'Untitled'}\n\n组件代码：\n${widgetCode}`;
      sendMessageRef.current(instruction, undefined, undefined, `📌 固定「${title || 'Widget'}」到看板`);
    };
    window.addEventListener('widget-pin-request', handler);
    return () => window.removeEventListener('widget-pin-request', handler);
  }, []);

  // Listen for dashboard widget drilldown (click title → conversation)
  useEffect(() => {
    const handler = (e: Event) => {
      const { title, dataContract } = (e as CustomEvent).detail || {};
      if (!title || !sendMessageRef.current) return;
      sendMessageRef.current(
        `请深入分析看板组件「${title}」的数据。\n数据契约：${dataContract || '无'}`,
        undefined, undefined,
        `🔍 分析「${title}」`,
      );
    };
    window.addEventListener('dashboard-widget-drilldown', handler);
    return () => window.removeEventListener('dashboard-widget-drilldown', handler);
  }, []);

  // Listen for dashboard command input
  useEffect(() => {
    const handler = (e: Event) => {
      const { text } = (e as CustomEvent).detail || {};
      if (!text || !sendMessageRef.current) return;
      sendMessageRef.current(text, undefined, undefined, text);
    };
    window.addEventListener('dashboard-command', handler);
    return () => window.removeEventListener('dashboard-command', handler);
  }, []);

  const handleCommand = useChatCommands({ sessionId, messages, setMessages: cappedSetMessages, sendMessage });

  // Listen for image generation completion
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const paths = (detail.images || [])
        .map((img: { localPath?: string }) => img.localPath)
        .filter(Boolean);
      const pathInfo = paths.length > 0 ? `\nGenerated image file paths:\n${paths.map((p: string) => `- ${p}`).join('\n')}` : '';
      const notice = `[Image generation completed]\n- Prompt: "${detail.prompt}"\n- Aspect ratio: ${detail.aspectRatio}\n- Resolution: ${detail.resolution}${pathInfo}`;

      if (paths.length > 0) {
        setLastGeneratedImages(sessionId, paths);
      }

      pendingImageNoticesRef.current.push(notice);

      const dbNotice = `[__IMAGE_GEN_NOTICE__ prompt: "${detail.prompt}", aspect ratio: ${detail.aspectRatio}, resolution: ${detail.resolution}${paths.length > 0 ? `, file path: ${paths.join(', ')}` : ''}]`;
      fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, role: 'user', content: dbNotice }),
      }).catch(() => {});
    };
    window.addEventListener('image-gen-completed', handler);
    return () => window.removeEventListener('image-gen-completed', handler);
  }, [sessionId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Workspace mismatch banner */}
      {workspaceMismatchPath && (
        <div className="flex items-center justify-between gap-3 border-b border-status-warning/30 bg-status-warning-muted px-4 py-2">
          <span className="text-xs text-status-warning-foreground">
            {t('assistant.switchedBanner', { path: workspaceMismatchPath })}
          </span>
          <Button
            onClick={handleOpenNewAssistant}
            className="shrink-0 rounded-md bg-status-warning px-3 py-1 text-xs font-medium text-white hover:bg-status-warning/80 transition-colors"
          >
            {t('assistant.openNewAssistant')}
          </Button>
        </div>
      )}
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        toolUses={toolUses}
        toolResults={toolResults}
        streamingToolOutput={streamingToolOutput}
        streamingThinkingContent={streamingThinkingContent}
        statusText={statusText}
        onForceStop={stopStreaming}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadEarlierMessages}
        rewindPoints={rewindPoints}
        sessionId={sessionId}
        startedAt={streamSnapshot?.startedAt}
        isAssistantProject={isAssistantProject}
        assistantName={assistantName}
      />
      {/* End-of-turn terminal reason chip (only shown when stream is not active) */}
      {!isStreaming && (
        <TerminalReasonChip
          reason={streamSnapshot?.terminalReason}
          onAction={handleTerminalAction}
        />
      )}
      {/* Permission prompt */}
      <PermissionPrompt
        pendingPermission={pendingPermission}
        permissionResolved={permissionResolved}
        onPermissionResponse={handlePermissionResponse}
        toolUses={toolUses}
        permissionProfile={permissionProfile}
      />
      {/* Phase 1b — confirmation dialog for destructive chip actions */}
      <AlertDialog
        open={pendingTerminalAction !== null}
        onOpenChange={(open) => { if (!open) setPendingTerminalAction(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('terminalAction.confirmTitle' as TranslationKey)}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTerminalAction?.actionId === 'compress_and_retry' && t('terminalAction.confirmCompressAndRetry' as TranslationKey)}
              {pendingTerminalAction?.actionId === 'enable_1m_and_retry' && t('terminalAction.confirmEnable1mAndRetry' as TranslationKey)}
              {pendingTerminalAction?.actionId === 'switch_to_sonnet' && t('terminalAction.confirmSwitchToSonnet' as TranslationKey)}
              {pendingTerminalAction?.actionId === 'retry_simple' && t('terminalAction.confirmRetry' as TranslationKey)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('terminalAction.confirmCancel' as TranslationKey)}</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingTerminalAction) {
                runTerminalAction(pendingTerminalAction.actionId, pendingTerminalAction.lastUserMessage);
                setPendingTerminalAction(null);
              }
            }}>
              {t('terminalAction.confirmCta' as TranslationKey)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Skill nudge banner — shown after complex multi-step workflows */}
      {skillNudge && !isStreaming && (
        <div className="mx-auto w-full max-w-3xl border-t border-border bg-background px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex-1 text-sm text-muted-foreground">
              {t('skillNudge.message')
                .replace('{step}', String(skillNudge.step))
                .replace('{toolCount}', String(skillNudge.distinctToolCount))}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setSkillNudge(null);
                  sendMessageRef.current?.(t('skillNudge.savePrompt'));
                }}
              >
                {t('skillNudge.saveButton')}
              </Button>
              <button
                type="button"
                onClick={() => setSkillNudge(null)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Batch image generation panels */}
      <BatchExecutionDashboard />
      <BatchContextSync />

      {/* Queued message banner — shown above input when messages are waiting */}
      {messageQueue.length > 0 && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-1">
          {messageQueue.map((qm, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" className="shrink-0 text-muted-foreground"><path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88Zm64-88a8 8 0 0 1-8 8H128a8 8 0 0 1-8-8V72a8 8 0 0 1 16 0v48h56a8 8 0 0 1 0 16Z"/></svg>
              <span className="flex-1 truncate text-sm text-muted-foreground">
                {(qm.displayOverride || qm.content).length > 80
                  ? (qm.displayOverride || qm.content).slice(0, 77) + '...'
                  : (qm.displayOverride || qm.content)}
              </span>
              <button
                type="button"
                onClick={() => setMessageQueue((prev) => prev.filter((_, idx) => idx !== i))}
                className="shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
                aria-label={t('messageQueue.cancel' as TranslationKey)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Phase 2 — subscription rate-limit banner (allowed_warning / rejected) */}
      {!rateLimitDismissed && streamSnapshot?.rateLimitInfo && streamSnapshot.rateLimitInfo.status !== 'allowed' && (
        <RateLimitBanner
          info={streamSnapshot.rateLimitInfo}
          onRequestSwitchToSonnet={() => {
            const lastUserMessage = findLastUserMessage();
            if (lastUserMessage) {
              setPendingTerminalAction({ actionId: 'switch_to_sonnet', lastUserMessage });
            } else {
              setCurrentModel('sonnet');
            }
          }}
          onDismiss={() => setRateLimitDismissed(true)}
        />
      )}
      <MessageInput
        key={sessionId}
        onSend={sendMessage}
        onCommand={handleCommand}
        onStop={stopStreaming}
        disabled={false}
        isStreaming={isStreaming}
        sessionId={sessionId}
        modelName={currentModel}
        onModelChange={setCurrentModel}
        providerId={currentProviderId}
        onProviderModelChange={handleProviderModelChange}
        workingDirectory={workingDirectory}
        onAssistantTrigger={checkAssistantTrigger}
        effort={selectedEffort}
        onEffortChange={setSelectedEffort}
        sdkInitMeta={initMetaRef.current}
        isAssistantProject={isAssistantProject}
        hasMessages={messages.length > 0}
      />
      <ChatComposerActionBar
        left={<><ModeIndicator mode={mode} onModeChange={handleModeChange} disabled={isStreaming} /><ImageGenToggle /></>}
        center={
          <ChatPermissionSelector
            sessionId={sessionId}
            permissionProfile={permissionProfile}
            onPermissionChange={setPermissionProfile}
          />
        }
        right={
          <div className="flex items-center gap-1">
            <RuntimeBadge providerId={currentProviderId} />
            <ContextUsageIndicator
              messages={messages}
              modelName={currentModel}
              context1m={context1m}
              hasSummary={hasSummary}
              upstreamModelId={currentModelUpstream}
              contextUsageSnapshot={streamSnapshot?.contextUsageSnapshot}
            />
          </div>
        }
      />
    </div>
  );
}
