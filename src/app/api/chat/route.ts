import { NextRequest } from 'next/server';
import { streamClaude } from '@/lib/claude-client';
import { addMessage, getMessages, getSession, getSessionSummary, updateSessionTitle, updateSdkSessionId, updateSessionModel, updateSessionProvider, updateSessionProviderId, getSetting, acquireSessionLock, renewSessionLock, releaseSessionLock, setSessionRuntimeStatus, syncSdkTasks } from '@/lib/db';
import { resolveProvider as resolveProviderUnified } from '@/lib/provider-resolver';
import { notifySessionStart, notifySessionComplete, notifySessionError } from '@/lib/telegram-bot';
import { extractCompletion } from '@/lib/onboarding-completion';
import { loadCodePilotMcpServers, loadAllMcpServers } from '@/lib/mcp-loader';
import { assembleContext } from '@/lib/context-assembler';
import { buildContextCompressedStatus } from '@/lib/context-compressor';
import type { SendMessageRequest, SSEEvent, TokenUsage, MessageContentBlock, FileAttachment, ClaudeStreamOptions, MediaBlock } from '@/types';
import { saveMediaToLibrary } from '@/lib/media-saver';
import { wrapController } from '@/lib/safe-stream';
import { ensureSchedulerRunning } from '@/lib/task-scheduler';
import { predictNativeRuntime } from '@/lib/runtime';
import { hasCodePilotProvider } from '@/lib/provider-presence';

// Start the task scheduler on first API call
ensureSchedulerRunning();
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let activeSessionId: string | undefined;
  let activeLockId: string | undefined;

  try {
    const body: SendMessageRequest & { files?: FileAttachment[]; toolTimeout?: number; provider_id?: string; systemPromptAppend?: string; autoTrigger?: boolean; thinking?: unknown; effort?: string; enableFileCheckpointing?: boolean; displayOverride?: string; context_1m?: boolean } = await request.json();
    const { session_id, content, model, mode, files, toolTimeout, provider_id, systemPromptAppend, autoTrigger, thinking, effort, enableFileCheckpointing, displayOverride, context_1m } = body;

    console.log('[chat API] content length:', content.length, 'first 200 chars:', content.slice(0, 200));
    console.log('[chat API] systemPromptAppend:', systemPromptAppend ? `${systemPromptAppend.length} chars` : 'none');

    if (!session_id || !content) {
      return new Response(JSON.stringify({ error: 'session_id and content are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Precondition: CodePilot must have a provider configured. ~/.claude/settings.json
    // (cc-switch, CLI login) is intentionally NOT counted — users with only that source
    // are redirected to the setup flow to add a proper CodePilot provider.
    if (!hasCodePilotProvider()) {
      return new Response(
        JSON.stringify({
          error: 'No provider configured in CodePilot.',
          code: 'NEEDS_PROVIDER_SETUP',
          actionHint: 'open_setup_center',
          initialCard: 'provider',
        }),
        { status: 412, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const session = getSession(session_id);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Acquire exclusive lock for this session to prevent concurrent requests
    const lockId = crypto.randomBytes(8).toString('hex');
    const lockAcquired = acquireSessionLock(session_id, lockId, `chat-${process.pid}`, 600);
    if (!lockAcquired) {
      return new Response(
        JSON.stringify({ error: 'Session is busy processing another request', code: 'SESSION_BUSY' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }
    activeSessionId = session_id;
    activeLockId = lockId;
    setSessionRuntimeStatus(session_id, 'running');

    // ── /compact command handler ────────────────────────────────────
    if (content.trim() === '/compact') {
      try {
        const { compressConversation, resetCompressionState, filterHistoryByCompactBoundary } = await import('@/lib/context-compressor');
        const { getMessages: getDbMessages, getSessionSummary: getDbSummary, updateSessionSummary: updateDbSummary } = await import('@/lib/db');
        // Note: addMessage is intentionally NOT imported here. Neither the
        // success path nor the no-op path persists slash-command feedback
        // to DB — both are UI artifacts that would otherwise land after
        // context_summary_boundary_rowid and leak into the model's
        // transcript on subsequent turns. Repeated /compact calls would
        // accumulate those rows and eventually get folded into the next
        // summary. SSE frames convey the outcome to the user; the DB stays
        // clean. See the regression test in
        // context-compressor-handoff.test.ts that scans this block for
        // any addMessage/addDbMessage call.

        resetCompressionState(session_id);
        const { messages: allMsgs } = getDbMessages(session_id, { limit: 200, excludeHeartbeatAck: true });
        const existingSummaryData = getDbSummary(session_id);

        // If a prior summary exists, only compress rows strictly after its
        // coverage boundary. Without this, a second /compact would feed
        // existingSummary + messages already covered by existingSummary +
        // newer messages into the summarizer and duplicate the old context
        // inside the new summary. This mirrors the auto pre-compression
        // path (which filters by boundary via filterHistoryByCompactBoundary
        // before estimating / compressing).
        const rowsToCompactCandidate = filterHistoryByCompactBoundary({
          history: allMsgs,
          summary: existingSummaryData.summary,
          summaryBoundaryRowid: existingSummaryData.boundaryRowid,
        });

        if (rowsToCompactCandidate.length < 4) {
          // Short path: either the whole conversation is short, or it's
          // already compacted and there's not enough NEW material to
          // warrant another pass. Either way: no compression, no SDK
          // session invalidation, no context_compressed event. hasSummary
          // must not flip because nothing new got summarized.
          //
          // Do NOT addDbMessage this notice. It's a UI artifact like the
          // success-path confirmation. Persisting it would land a row
          // AFTER context_summary_boundary_rowid, and on the next
          // fallback/estimation pass the filter would keep it as real
          // assistant context. Repeated /compact in an already-compacted
          // session would accumulate these rows and the next real compact
          // would fold them into the summary. SSE delivers the message
          // to the user on this turn; the DB transcript stays clean.
          const msg = existingSummaryData.summary
            ? '上下文已经压缩过，新消息不多，暂不需要再次压缩。'
            : '对话还很短，暂不需要压缩。';
          releaseSessionLock(session_id, lockId);
          setSessionRuntimeStatus(session_id, 'idle');
          const sseData = `data: ${JSON.stringify({ type: 'text', data: msg })}\n\ndata: ${JSON.stringify({ type: 'done' })}\n\n`;
          return new Response(sseData, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }

        const msgData = rowsToCompactCandidate.map(m => ({ role: m.role, content: m.content }));
        const result = await compressConversation({
          sessionId: session_id,
          messages: msgData,
          existingSummary: existingSummaryData.summary || undefined,
          providerId: provider_id || session.provider_id || undefined,
          sessionModel: model || session.model || undefined,
        });

        // Coverage boundary = rowid of the last message actually compressed
        // in THIS pass (the last of rowsToCompactCandidate). If the filter
        // returned nothing (shouldn't happen — short path above covers it)
        // fall back to the existing boundary rather than resetting to 0.
        const compactBoundaryRowid =
          rowsToCompactCandidate[rowsToCompactCandidate.length - 1]._rowid
          ?? existingSummaryData.boundaryRowid
          ?? 0;
        // Do NOT persist the confirmation message to DB. It's a UI artifact
        // — the summary + SSE frame already convey the outcome. Persisting it
        // as an assistant message would leak "上下文已压缩..." into the
        // transcript the model sees on subsequent turns (rowid > boundary
        // → kept by filter). Claude Code's own /compact handler behaves the
        // same way: slash-command feedback stays out of the model's context.
        const msg = `上下文已压缩。压缩了 ${result.messagesCompressed} 条消息，预计节省 ~${Math.round(result.estimatedTokensSaved / 1000)}K tokens。`;
        updateDbSummary(session_id, result.summary, compactBoundaryRowid);
        // Invalidate the SDK session so the next user message does NOT resume
        // the old (pre-compaction) transcript. Without this, the Claude Code
        // SDK keeps using its own full history on resume and our fresh summary
        // would never reach the model — reactive compact would re-trigger on
        // the very next turn. See feedback_db_migration_safety note: we only
        // clear the session-id link, never the underlying messages.
        updateSdkSessionId(session_id, '');
        releaseSessionLock(session_id, lockId);
        setSessionRuntimeStatus(session_id, 'idle');
        // Emit context_compressed BEFORE the text event so the SSE consumer
        // (useSSEStream) updates hasSummary via the dedicated dispatch path
        // before the text arrives and the stream terminates.
        const compressedStatusFrame = `data: ${JSON.stringify({
          type: 'status',
          data: JSON.stringify(buildContextCompressedStatus({
            messagesCompressed: result.messagesCompressed,
            tokensSaved: result.estimatedTokensSaved,
          })),
        })}\n\n`;
        const sseData = compressedStatusFrame
          + `data: ${JSON.stringify({ type: 'text', data: msg })}\n\n`
          + `data: ${JSON.stringify({ type: 'done' })}\n\n`;
        return new Response(sseData, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
      } catch (compactErr) {
        console.error('[chat API] /compact failed:', compactErr);
        releaseSessionLock(session_id, lockId);
        setSessionRuntimeStatus(session_id, 'idle');
        return new Response(JSON.stringify({ error: 'Compression failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Telegram notification: session started (fire-and-forget)
    // Skip for auto-trigger turns (onboarding/heartbeat) — these are invisible system triggers
    const telegramNotifyOpts = {
      sessionId: session_id,
      sessionTitle: session.title !== 'New Chat' ? session.title : content.slice(0, 50),
      workingDirectory: session.working_directory,
    };
    if (!autoTrigger) {
      notifySessionStart(telegramNotifyOpts).catch(() => {});
    }

    // Save user message — persist file metadata so attachments survive page reload
    // Skip saving for autoTrigger messages (invisible system triggers for assistant hooks)
    // Use displayOverride for DB storage if provided (e.g. /skillName instead of expanded prompt)
    let savedContent = displayOverride || content;
    let fileMeta: Array<{ id: string; name: string; type: string; size: number; filePath: string }> | undefined;
    if (!autoTrigger) {
      if (files && files.length > 0) {
        const workDir = session.working_directory;
        const uploadDir = path.join(workDir, '.codepilot-uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        fileMeta = files.map((f) => {
          const safeName = path.basename(f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = path.join(uploadDir, `${Date.now()}-${safeName}`);
          const buffer = Buffer.from(f.data, 'base64');
          fs.writeFileSync(filePath, buffer);
          return { id: f.id, name: f.name, type: f.type, size: buffer.length, filePath };
        });
        savedContent = `<!--files:${JSON.stringify(fileMeta)}-->${displayOverride || content}`;
      }
      addMessage(session_id, 'user', savedContent);

      // Auto-generate title from first message if still default
      if (session.title === 'New Chat') {
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
        updateSessionTitle(session_id, title);
      }
    }

    // Determine model: request override > session model > default setting
    let effectiveModel = model || session.model || getSetting('default_model') || undefined;

    // When Claude Code is disabled, sessions with env-provider models (sonnet/opus/haiku)
    // can't use them anymore. Fall back to default model from first available provider.
    const cliDisabled = getSetting('cli_enabled') === 'false';
    const ENV_MODELS = new Set(['sonnet', 'opus', 'haiku']);
    const effectiveProviderId_pre = provider_id || session.provider_id || '';
    if (cliDisabled && effectiveModel && ENV_MODELS.has(effectiveModel) && (!effectiveProviderId_pre || effectiveProviderId_pre === 'env')) {
      effectiveModel = getSetting('default_model') || undefined;
      // If default model is also env-only, clear it
      if (effectiveModel && ENV_MODELS.has(effectiveModel)) {
        effectiveModel = undefined;
      }
    }

    // Persist model and provider to session so usage stats can group by model+provider.
    // This runs on every message but the DB writes are cheap (single UPDATE by PK).
    if (effectiveModel && effectiveModel !== session.model) {
      updateSessionModel(session_id, effectiveModel);
    }

    // Resolve provider via unified resolver (same logic for chat, bridge, onboarding, etc.)
    const effectiveProviderId = provider_id || session.provider_id || '';
    const resolved = resolveProviderUnified({
      providerId: effectiveProviderId || undefined,
      sessionProviderId: session.provider_id || undefined,
      model: model || undefined,
      sessionModel: session.model || undefined,
    });
    const resolvedProvider = resolved.provider;

    const providerName = resolvedProvider?.name || '';
    if (providerName !== (session.provider_name || '')) {
      updateSessionProvider(session_id, providerName);
    }
    const persistProviderId = effectiveProviderId || provider_id || '';
    if (persistProviderId !== (session.provider_id || '')) {
      updateSessionProviderId(session_id, persistProviderId);
    }

    // Resolve permission mode from request body (sent by frontend on each message)
    // or fall back to session's persisted mode from DB.
    // Request body mode takes priority to avoid race condition: user switches mode
    // then immediately sends — the PATCH may not have landed in DB yet.
    const effectiveMode = mode || session.mode || 'code';
    const permissionMode = effectiveMode === 'plan' ? 'plan' : 'acceptEdits';

    // Plan mode takes precedence over full_access: if the user explicitly chose
    // Plan, they expect no tool execution regardless of permission profile.
    const bypassPermissions = session.permission_profile === 'full_access' && effectiveMode !== 'plan';
    const systemPromptOverride: string | undefined = undefined;

    const abortController = new AbortController();

    // Handle client disconnect
    request.signal.addEventListener('abort', () => {
      abortController.abort();
    });

    // Convert file attachments to the format expected by streamClaude.
    // Include filePath from the already-saved files so claude-client can
    // reference the on-disk copies instead of writing them again.
    const fileAttachments: FileAttachment[] | undefined = files && files.length > 0
      ? files.map((f, i) => {
          const meta = fileMeta?.find((m: { id: string }) => m.id === f.id);
          return {
            id: f.id || `file-${Date.now()}-${i}`,
            name: f.name,
            type: f.type,
            size: f.size,
            data: meta?.filePath ? '' : f.data, // Clear base64 once written to disk — claude-client reads from filePath on demand
            filePath: meta?.filePath,
          };
        })
      : undefined;

    // Load conversation history from DB as fallback context.
    // Fetch up to 200 messages (DB query is cheap); actual truncation is done
    // by buildFallbackContext using a token budget, not a fixed message count.
    const { messages: recentMsgs } = getMessages(session_id, { limit: 200, excludeHeartbeatAck: true });
    // Load session summary for compression-aware fallback (needed before the
    // compact-boundary filter below).
    const sessionSummaryData = getSessionSummary(session_id);

    // Exclude the user message we just saved (last in the list) — it's already the prompt
    const historyBeforeBoundary = recentMsgs.slice(0, -1);
    // Drop history at-or-before the coverage boundary
    // (context_summary_boundary_rowid — the rowid of the last message
    // actually covered by the summary). Rowid, not timestamp: disambiguates
    // same-second writes. See filterHistoryByCompactBoundary doc.
    const { filterHistoryByCompactBoundary } = await import('@/lib/context-compressor');
    const historyAfterBoundary = filterHistoryByCompactBoundary({
      history: historyBeforeBoundary,
      summary: sessionSummaryData.summary,
      summaryBoundaryRowid: sessionSummaryData.boundaryRowid,
    });
    if (historyAfterBoundary.length < historyBeforeBoundary.length) {
      console.log(`[chat API] Compact boundary filter: dropped ${historyBeforeBoundary.length - historyAfterBoundary.length} messages at-or-before rowid ${sessionSummaryData.boundaryRowid}, kept ${historyAfterBoundary.length}`);
    }
    // Preserve _rowid through to streamClaude: if a CONTEXT_TOO_LONG
    // reactive compact fires inside streamClaude on this turn, it needs the
    // rowids in conversationHistory to write a correct
    // context_summary_boundary_rowid. Without this, reactive compact would
    // fall back to the "preserve existing boundary" degraded path.
    const historyMsgs = historyAfterBoundary.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      _rowid: m._rowid,
    }));

    // Detect actual image agent mode by checking for the specific design agent prompt,
    // not just any systemPromptAppend (which could come from CLI badges or skills).
    const isImageAgentMode = !!systemPromptAppend && systemPromptAppend.includes('image-gen-request');

    // Unified context assembly — extracts workspace, CLI tools, widget prompt
    const assembled = await assembleContext({
      session,
      entryPoint: 'desktop',
      userPrompt: content,
      systemPromptAppend,
      conversationHistory: historyMsgs,
      imageAgentMode: isImageAgentMode,
      autoTrigger: !!autoTrigger,
    });
    const finalSystemPrompt = assembled.systemPrompt;
    const generativeUIEnabled = assembled.generativeUIEnabled;
    const assistantProjectInstructions = assembled.assistantProjectInstructions;
    const isAssistantProject = assembled.isAssistantProject;

    // Load MCP servers for the predicted runtime:
    // - SDK Runtime: only needs servers with ${...} env placeholders (SDK loads the rest via settingSources)
    // - Native Runtime: needs ALL servers (it manages MCP connections independently)
    // Note: was a lazy `require()` previously; converted to static import after
    // Turbopack's CJS↔ESM interop started returning `{ default: ... }` shape
    // and broke "predictNativeRuntime is not a function" at runtime.
    const mcpServers = predictNativeRuntime(effectiveProviderId)
      ? loadAllMcpServers()
      : loadCodePilotMcpServers();

    // ── Context compression check ───────────────────────────────────
    // Estimate next-turn context size and compress if over threshold.
    let activeSessionSummary = sessionSummaryData.summary || undefined;
    let fallbackTokenBudget: number | undefined;
    let compressionOccurred = false;
    let compressionStats: { messagesCompressed: number; tokensSaved: number } | null = null;

    // Stream handoff variables. Default to the resume path (use the stored SDK
    // session, full history). When auto-compression succeeds below, these get
    // switched to the fresh-session path via planStreamHandoffAfterCompaction:
    // sdkSessionId = undefined (force fresh SDK session so our new summary is
    // actually seen by the model) and conversationHistory = messagesToKeep
    // (avoid feeding the summary + the turns that summary already covers).
    let streamSdkSessionId: string | undefined = session.sdk_session_id || undefined;
    let streamConversationHistory: typeof historyMsgs = historyMsgs;

    try {
      const { estimateContextTokens } = await import('@/lib/context-estimator');
      const { getContextWindow } = await import('@/lib/model-context');
      const { needsCompression, compressConversation } = await import('@/lib/context-compressor');
      const { updateSessionSummary } = await import('@/lib/db');

      const modelForWindow = resolved.upstreamModel || resolved.model || effectiveModel || 'sonnet';
      // Pass upstream explicitly so alias lookups (e.g. 'opus') resolve to
      // the correct per-provider window — first-party opus → 4.7 (1M) vs
      // Bedrock/Vertex opus → 4.6 (200K).
      const contextWindow = getContextWindow(modelForWindow, {
        context1m: context_1m,
        upstream: resolved.upstreamModel,
      }) || 200000;

      // Estimate using normalized content (matches what buildFallbackContext actually sends).
      // Raw transcript overestimates tool-heavy conversations because normalize + microcompact
      // strip metadata and truncate old tool results significantly.
      const { normalizeMessageContent, microCompactMessage } = await import('@/lib/message-normalizer');
      const { roughTokenEstimate } = await import('@/lib/context-estimator');
      const normalizedHistory = historyMsgs.map((m, i) => ({
        role: m.role,
        content: microCompactMessage(m.role, normalizeMessageContent(m.role, m.content), historyMsgs.length - 1 - i),
      }));

      const estimate = estimateContextTokens({
        systemPrompt: finalSystemPrompt,
        history: normalizedHistory,
        currentUserMessage: content,
        sessionSummary: activeSessionSummary,
      });

      // Budget for history = 70% of window minus system prompt, summary, and current user message.
      // buildFallbackContext adds summary + prompt on top of the history, so we must account for them.
      fallbackTokenBudget = Math.floor(
        contextWindow * 0.7 - estimate.breakdown.system - estimate.breakdown.summary - estimate.breakdown.userMessage
      );

      if (needsCompression(estimate.total, contextWindow, session_id)) {
        console.log(`[chat API] Context at ${((estimate.total / contextWindow) * 100).toFixed(1)}% — triggering compression`);

        // Slice keep/compress on the raw DB rows (with _rowid) FIRST, then
        // map to {role, content} when calling compressConversation. This
        // preserves rowid on rowsToCompress so we can write the true
        // coverage boundary below. historyMsgs[i] corresponds 1:1 to
        // historyAfterBoundary[i] (same filter result, the map at L299
        // just drops fields).
        const recentBudget = Math.floor(contextWindow * 0.5);
        const rowsToKeep: typeof historyAfterBoundary = [];
        let keptTokens = 0;
        for (let i = normalizedHistory.length - 1; i >= 0; i--) {
          const msgTokens = roughTokenEstimate(normalizedHistory[i].content) + 10;
          if (keptTokens + msgTokens > recentBudget) break;
          rowsToKeep.unshift(historyAfterBoundary[i]);
          keptTokens += msgTokens;
        }
        const rowsToCompress = historyAfterBoundary.slice(0, historyAfterBoundary.length - rowsToKeep.length);
        // messagesToKeep must carry _rowid through — if a reactive compact
        // fires on this same turn (CONTEXT_TOO_LONG retry) it will see
        // these rows as conversationHistory and need the rowids to write a
        // correct boundary. messagesToCompress only feeds compressConversation
        // which needs role/content; no need to plumb _rowid there.
        const messagesToKeep = rowsToKeep.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content, _rowid: m._rowid }));
        const messagesToCompress = rowsToCompress.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        if (messagesToCompress.length > 0) {
          try {
            const result = await compressConversation({
              sessionId: session_id,
              messages: messagesToCompress,
              existingSummary: activeSessionSummary,
              providerId: effectiveProviderId || undefined,
              sessionModel: effectiveModel || undefined,
            });
            activeSessionSummary = result.summary;
            // Coverage boundary = rowid of the last message actually in
            // messagesToCompress. rowid, not timestamp: rowsToCompress.last
            // and rowsToKeep.first may share a second on fast paths and the
            // strict-gt filter would mis-classify one of them. Do NOT use
            // summary WRITE time: the current user turn was addMessage'd
            // just before this branch ran and sits at a created_at slightly
            // earlier than "now", which would silently drop it on the next
            // turn's filter. The user turn has rowid strictly greater than
            // any row in rowsToCompress, so the rowid boundary naturally
            // spares it.
            const autoCompactBoundaryRowid = rowsToCompress[rowsToCompress.length - 1]._rowid ?? 0;
            updateSessionSummary(session_id, result.summary, autoCompactBoundaryRowid);
            // Recalculate budget with new (larger) summary
            const newSummaryTokens = roughTokenEstimate(result.summary);
            const userMsgTokens = roughTokenEstimate(content);
            fallbackTokenBudget = Math.floor(
              contextWindow * 0.7 - estimate.breakdown.system - newSummaryTokens - userMsgTokens
            );
            // Flag so we can notify frontend via a leading SSE event
            compressionOccurred = true;
            compressionStats = {
              messagesCompressed: result.messagesCompressed,
              tokensSaved: result.estimatedTokensSaved,
            };

            // Force this turn AND all subsequent turns off SDK resume — see
            // planStreamHandoffAfterCompaction for the rationale.
            updateSdkSessionId(session_id, '');
            const { planStreamHandoffAfterCompaction } = await import('@/lib/context-compressor');
            const handoff = planStreamHandoffAfterCompaction({
              compressed: true,
              originalHistory: historyMsgs,
              messagesToKeep,
              originalSdkSessionId: streamSdkSessionId,
            });
            streamSdkSessionId = handoff.sdkSessionId;
            streamConversationHistory = handoff.conversationHistory;

            console.log(`[chat API] Compressed ${result.messagesCompressed} messages, saved ~${result.estimatedTokensSaved} tokens; cleared SDK session, switching to fresh query with summary + ${messagesToKeep.length} recent turns`);
          } catch (compErr) {
            console.warn('[chat API] Compression failed, proceeding without:', compErr);
          }
        }
      }
    } catch (estimateErr) {
      console.warn('[chat API] Context estimation failed, proceeding without compression:', estimateErr);
    }

    // Stream Claude response, using SDK session ID for resume if available
    console.log('[chat API] streamClaude params:', {
      promptLength: content.length,
      promptFirst200: content.slice(0, 200),
      // Log the handoff value, not the DB value — after auto-compaction these
      // diverge and the handoff is what streamClaude actually receives.
      sdkSessionId: streamSdkSessionId || 'none',
      compressionOccurred,
      historyMessageCount: streamConversationHistory.length,
      systemPromptLength: finalSystemPrompt?.length || 0,
      systemPromptFirst200: finalSystemPrompt?.slice(0, 200) || 'none',
    });
    const stream = streamClaude({
      prompt: content,
      sessionId: session_id,
      sdkSessionId: streamSdkSessionId,
      model: resolved.upstreamModel || resolved.model || effectiveModel,
      systemPrompt: finalSystemPrompt,
      workingDirectory: session.sdk_cwd || session.working_directory || undefined,
      abortController,
      permissionMode,
      files: fileAttachments,
      imageAgentMode: isImageAgentMode,
      toolTimeoutSeconds: toolTimeout || 300,
      provider: resolvedProvider,
      providerId: effectiveProviderId || undefined,
      sessionProviderId: session.provider_id || undefined,
      mcpServers,
      conversationHistory: streamConversationHistory,
      sessionSummary: activeSessionSummary,
      // Plumbed through so reactive compact (CONTEXT_TOO_LONG retry inside
      // streamClaude) can preserve the already-established boundary when
      // conversationHistory has no _rowid to derive a new one from. Prevents
      // a degraded reactive compact from silently resetting a real boundary
      // back to 0 and regressing the next turn's filter to passthrough.
      sessionSummaryBoundaryRowid: sessionSummaryData.boundaryRowid,
      fallbackTokenBudget,
      bypassPermissions,
      thinking: thinking as ClaudeStreamOptions['thinking'],
      effort: effort as ClaudeStreamOptions['effort'],
      context1m: context_1m,
      generativeUI: generativeUIEnabled,
      enableFileCheckpointing: enableFileCheckpointing ?? true,
      autoTrigger: !!autoTrigger,
      onRuntimeStatusChange: (status: string) => {
        try { setSessionRuntimeStatus(session_id, status); } catch { /* best effort */ }
      },
    });

    // Tee the stream: one for client, one for collecting the response
    const [streamForClient, streamForCollect] = stream.tee();

    // Periodically renew the session lock so long-running tasks don't expire
    const lockRenewalInterval = setInterval(() => {
      try { renewSessionLock(session_id, lockId, 600); } catch { /* best effort */ }
    }, 60_000);

    // Save assistant message in background, with cleanup callback to release lock
    const isHeartbeatTurn = !!autoTrigger && content.includes('心跳检查');
    collectStreamResponse(streamForCollect, session_id, telegramNotifyOpts, () => {
      clearInterval(lockRenewalInterval);
      releaseSessionLock(session_id, lockId);
      setSessionRuntimeStatus(session_id, 'idle');
    }, { isHeartbeatTurn, suppressNotifications: !!autoTrigger });

    // If auto-compression happened, prepend a notification event to the stream.
    // The message is human-readable so the browser status bar shows something
    // meaningful, and includes structured data for future rich UI handling.
    const responseStream = compressionOccurred
      ? new ReadableStream<string>({
          async start(controllerRaw) {
            const controller = wrapController(controllerRaw);
            controller.enqueue(`data: ${JSON.stringify({
              type: 'status',
              data: JSON.stringify(buildContextCompressedStatus({
                messagesCompressed: compressionStats?.messagesCompressed ?? 0,
                tokensSaved: compressionStats?.tokensSaved ?? 0,
              })),
            })}\n\n`);
            const reader = streamForClient.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
                if (controller.closed) break; // consumer aborted
              }
            } finally {
              controller.close();
            }
          },
        })
      : streamForClient;

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    // Release lock and reset status on error (only if lock was acquired)
    if (activeSessionId && activeLockId) {
      try {
        releaseSessionLock(activeSessionId, activeLockId);
        setSessionRuntimeStatus(activeSessionId, 'idle', error instanceof Error ? error.message : 'Unknown error');
      } catch { /* best effort */ }
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function collectStreamResponse(
  stream: ReadableStream<string>,
  sessionId: string,
  telegramOpts: { sessionId?: string; sessionTitle?: string; workingDirectory?: string },
  onComplete?: () => void,
  opts?: { isHeartbeatTurn?: boolean; suppressNotifications?: boolean },
) {
  const reader = stream.getReader();
  const contentBlocks: MessageContentBlock[] = [];
  let currentText = '';
  let thinkingText = '';
  /** Tracks whether non-thinking content arrived since last thinking delta (for phase separation) */
  let thinkingPhaseEnded = false;
  let tokenUsage: TokenUsage | null = null;
  let hasError = false;
  let errorMessage = '';
  let lastSavedAssistantMsgId: string | null = null;
  // Dedup layer: skip duplicate tool_result events by tool_use_id
  const seenToolResultIds = new Set<string>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = value.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            if (event.type === 'permission_request' || event.type === 'tool_output') {
              // Skip permission_request and tool_output events - not saved as message content
            } else if (event.type === 'thinking') {
              // Accumulate thinking content with phase separation (--- between phases)
              if (thinkingPhaseEnded) {
                if (thinkingText) thinkingText += '\n\n---\n\n';
                thinkingPhaseEnded = false;
              }
              thinkingText += event.data;
            } else if (event.type === 'text') {
              currentText += event.data;
              if (thinkingText) thinkingPhaseEnded = true;
            } else if (event.type === 'tool_use') {
              if (thinkingText) thinkingPhaseEnded = true;
              // Flush any accumulated text before the tool use block
              if (currentText.trim()) {
                contentBlocks.push({ type: 'text', text: currentText });
                currentText = '';
              }
              try {
                const toolData = JSON.parse(event.data);
                contentBlocks.push({
                  type: 'tool_use',
                  id: toolData.id,
                  name: toolData.name,
                  input: toolData.input,
                });
              } catch {
                // skip malformed tool_use data
              }
            } else if (event.type === 'tool_result') {
              try {
                const resultData = JSON.parse(event.data);

                // Save media blocks to library, replace base64 with local paths
                let savedMedia: MediaBlock[] | undefined;
                if (Array.isArray(resultData.media) && resultData.media.length > 0) {
                  savedMedia = [];
                  for (const block of resultData.media as MediaBlock[]) {
                    if (block.data) {
                      try {
                        const saved = saveMediaToLibrary(block, { sessionId });
                        savedMedia.push({
                          type: block.type,
                          mimeType: block.mimeType,
                          localPath: saved.localPath,
                          mediaId: saved.mediaId,
                        });
                      } catch (saveErr) {
                        console.warn('[chat/route] Failed to save media block:', saveErr);
                        savedMedia.push(block); // Keep original if save fails
                      }
                    } else {
                      savedMedia.push(block);
                    }
                  }
                }

                const newBlock: MessageContentBlock = {
                  type: 'tool_result' as const,
                  tool_use_id: resultData.tool_use_id,
                  content: resultData.content,
                  is_error: resultData.is_error || false,
                  ...(savedMedia && savedMedia.length > 0 ? { media: savedMedia } : {}),
                };
                // Last-wins: if same tool_use_id already exists, replace it
                // (user handler's result may be more complete than PostToolUse's)
                if (seenToolResultIds.has(resultData.tool_use_id)) {
                  const idx = contentBlocks.findIndex(
                    (b) => b.type === 'tool_result' && 'tool_use_id' in b && b.tool_use_id === resultData.tool_use_id
                  );
                  if (idx >= 0) {
                    contentBlocks[idx] = newBlock;
                  }
                } else {
                  seenToolResultIds.add(resultData.tool_use_id);
                  contentBlocks.push(newBlock);
                }
              } catch {
                // skip malformed tool_result data
              }
            } else if (event.type === 'status') {
              // Capture SDK session_id and model from init event and persist them
              try {
                const statusData = JSON.parse(event.data);
                if (statusData.session_id) {
                  updateSdkSessionId(sessionId, statusData.session_id);
                }
                if (statusData.model) {
                  updateSessionModel(sessionId, statusData.model);
                }
              } catch {
                // skip malformed status data
              }
            } else if (event.type === 'task_update') {
              // Sync SDK TodoWrite tasks to local DB
              try {
                const taskData = JSON.parse(event.data);
                if (taskData.session_id && taskData.todos) {
                  syncSdkTasks(taskData.session_id, taskData.todos);
                }
              } catch {
                // skip malformed task_update data
              }
            } else if (event.type === 'error') {
              hasError = true;
              errorMessage = event.data || 'Unknown error';
            } else if (event.type === 'result') {
              try {
                const resultData = JSON.parse(event.data);
                if (resultData.usage) {
                  tokenUsage = resultData.usage;
                }
                if (resultData.is_error) {
                  hasError = true;
                }
                // Also capture session_id from result if we missed it from init
                if (resultData.session_id) {
                  updateSdkSessionId(sessionId, resultData.session_id);
                }
                // Memory flush tracking: log high turn counts for assistant sessions.
                // The progressive update instructions already tell the model to
                // proactively write important info to daily memory files.
                if (resultData.num_turns >= 25) {
                  console.log(`[chat API] High turn count (${resultData.num_turns}) for session ${sessionId}`);
                }
              } catch {
                // skip malformed result data
              }
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    }

    // Flush any remaining text
    if (currentText.trim()) {
      contentBlocks.push({ type: 'text', text: currentText });
    }

    // Prepend thinking block if accumulated during stream
    if (thinkingText.trim()) {
      contentBlocks.unshift({ type: 'thinking', thinking: thinkingText.trim() });
    }

    if (contentBlocks.length > 0) {
      // If the message is text-only (no tool calls), store as plain text
      // for backward compatibility with existing message rendering.
      // Strip soft-heartbeat marker from text blocks before persisting (both paths)
      const heartbeatMarkerRe = /\s*<!--\s*heartbeat-done\s*-->\s*/g;
      const cleanedBlocks = contentBlocks.map(b =>
        b.type === 'text' && 'text' in b ? { ...b, text: (b.text as string).replace(heartbeatMarkerRe, '') } : b
      );

      // If it contains tool calls or thinking blocks, store as structured JSON.
      const hasStructuredBlocks = cleanedBlocks.some(
        (b) => b.type === 'tool_use' || b.type === 'tool_result' || b.type === 'thinking'
      );

      const content = hasStructuredBlocks
        ? JSON.stringify(cleanedBlocks)
        : cleanedBlocks
            .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
            .map((b) => b.text)
            .join('')
            .trim();

      if (content) {
        const savedMsg = addMessage(
          sessionId,
          'assistant',
          content,
          tokenUsage ? JSON.stringify(tokenUsage) : null,
        );
        lastSavedAssistantMsgId = savedMsg.id;
      }
    }
  } catch (e) {
    hasError = true;
    errorMessage = e instanceof Error ? e.message : 'Stream reading error';
    // Stream reading error - best effort save (same structured-block handling as happy path)
    if (currentText.trim()) {
      contentBlocks.push({ type: 'text', text: currentText });
    }
    if (thinkingText.trim()) {
      contentBlocks.unshift({ type: 'thinking', thinking: thinkingText.trim() });
    }
    if (contentBlocks.length > 0) {
      const hbRe = /\s*<!--\s*heartbeat-done\s*-->\s*/g;
      const errCleanedBlocks = contentBlocks.map(b =>
        b.type === 'text' && 'text' in b ? { ...b, text: (b.text as string).replace(hbRe, '') } : b
      );
      const hasStructuredBlocks = errCleanedBlocks.some(
        (b) => b.type === 'tool_use' || b.type === 'tool_result' || b.type === 'thinking'
      );
      const content = hasStructuredBlocks
        ? JSON.stringify(errCleanedBlocks)
        : errCleanedBlocks
            .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
            .map((b) => b.text)
            .join('')
            .trim();
      if (content) {
        addMessage(sessionId, 'assistant', content);
      }
    }
  } finally {
    // ── Server-side completion detection (reliable path) ──
    // After persisting the assistant message, check for onboarding/checkin
    // fences and process them directly on the server. This ensures completion
    // is captured even if the frontend misses it (page refresh, parse failure, etc.).
    try {
      const fullText = contentBlocks
        .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // 1. Check for onboarding-complete fence
      const completion = extractCompletion(fullText);
      if (completion) {
        const workspacePath = getSetting('assistant_workspace_path');
        const session = getSession(sessionId);
        if (workspacePath && session && session.working_directory === workspacePath) {
          await processCompletionServerSide(completion, workspacePath, sessionId);
        }
      }

      // 2a. Soft heartbeat: for normal turns in assistant projects, mark heartbeat done
      // only if the AI's response actually mentions heartbeat-related content.
      if (!opts?.isHeartbeatTurn && !hasError && fullText.trim().length > 0) {
        try {
          const workspacePath = getSetting('assistant_workspace_path');
          const session = getSession(sessionId);
          if (workspacePath && session && session.working_directory === workspacePath) {
            const { loadState, saveState, shouldRunHeartbeat } = await import('@/lib/assistant-workspace');
            const { getLocalDateString } = await import('@/lib/utils');
            const st = loadState(workspacePath);
            if (shouldRunHeartbeat(st)) {
              // Only mark done if the AI included the heartbeat-done marker.
              // The soft hint instructs the AI to append <!-- heartbeat-done --> when it checks in.
              const didCheck = fullText.includes('<!-- heartbeat-done -->');
              if (didCheck) {
                st.lastHeartbeatDate = getLocalDateString();
                saveState(workspacePath, st);
              }
            }
          }
        } catch { /* best effort */ }
      }

      // 2b. Heartbeat state update — ONLY for actual heartbeat turns, and ONLY on success
      if (opts?.isHeartbeatTurn && !hasError && fullText.trim().length > 0) {
        try {
          const workspacePath = getSetting('assistant_workspace_path');
          const session = getSession(sessionId);
          if (workspacePath && session && session.working_directory === workspacePath) {
            const { stripHeartbeatToken } = await import('@/lib/heartbeat');
            const { loadState, saveState } = await import('@/lib/assistant-workspace');
            const { getLocalDateString } = await import('@/lib/utils');
            const stripped = stripHeartbeatToken(fullText);

            const st = loadState(workspacePath);
            st.lastHeartbeatDate = getLocalDateString();

            if (stripped.shouldSkip && lastSavedAssistantMsgId) {
              // Pure HEARTBEAT_OK — mark ONLY the assistant reply as ack
              // (auto-trigger messages are not persisted, so we only have the reply)
              try {
                const { updateMessageHeartbeatAck } = await import('@/lib/db');
                updateMessageHeartbeatAck(lastSavedAssistantMsgId, true);
              } catch { /* best effort */ }
            } else if (!stripped.shouldSkip) {
              // Has real content — record for dedup
              st.lastHeartbeatText = stripped.text;
              st.lastHeartbeatSentAt = Date.now();
            }

            // Clear hookTriggeredSessionId
            if (st.hookTriggeredSessionId === sessionId || !st.hookTriggeredSessionId) {
              st.hookTriggeredSessionId = undefined;
              st.hookTriggeredAt = undefined;
            }
            saveState(workspacePath, st);
          }
        } catch {
          // best effort heartbeat state update
        }
      }
    } catch (e) {
      console.error('[chat API] Server-side completion detection failed:', e);
    }

    // Memory extraction: auto-extract durable memories every N turns (assistant projects only)
    if (!opts?.isHeartbeatTurn && !opts?.suppressNotifications) {
      try {
        const workspacePath = getSetting('assistant_workspace_path');
        const session = getSession(sessionId);
        if (workspacePath && session && session.working_directory === workspacePath) {
          const { shouldExtractMemory, hasMemoryWritesInResponse, extractMemories } = await import('@/lib/memory-extractor');

          const fullTextForMemory = contentBlocks
            .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
            .map((b) => b.text)
            .join('');

          // For memory-write detection, serialize ALL blocks (including tool_use/tool_result)
          // so that hasMemoryWritesInResponse can see memory file paths in tool calls.
          const fullResponseForWriteCheck = JSON.stringify(contentBlocks);

          // Load buddy rarity for extraction interval
          let buddyRarity: string | undefined;
          try {
            const { loadState } = await import('@/lib/assistant-workspace');
            const st = loadState(workspacePath);
            buddyRarity = st.buddy?.rarity;
          } catch { /* ignore */ }

          // Only extract if: interval met + AI didn't already write memory this turn
          if (shouldExtractMemory(buddyRarity, sessionId) && !hasMemoryWritesInResponse(fullResponseForWriteCheck)) {
            const { getMessages: getMsgs } = await import('@/lib/db');
            const { messages: recent } = getMsgs(sessionId, { limit: 6, excludeHeartbeatAck: true });
            const recentForExtraction = recent.map(m => ({ role: m.role, content: m.content }));

            // Fire-and-forget: don't block the response
            extractMemories(recentForExtraction, workspacePath).catch(() => {});
          }
        }
      } catch { /* best effort */ }
    }

    // Telegram notifications: completion or error (fire-and-forget)
    // Suppressed for auto-trigger turns (onboarding/heartbeat) — invisible system flows
    if (!opts?.suppressNotifications) {
      if (hasError) {
        notifySessionError(errorMessage, telegramOpts).catch(() => {});
      } else {
        const textSummary = contentBlocks
          .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim();
        notifySessionComplete(textSummary || undefined, telegramOpts).catch(() => {});
      }
    }
    onComplete?.();
  }
}

/**
 * Process a detected onboarding/checkin completion on the server side.
 * Calls the shared processor functions directly — no HTTP round-trip needed.
 *
 * Both processors are internally idempotent:
 * - processOnboarding checks state.onboardingComplete
 * - processCheckin checks state.lastCheckInDate === today
 */
async function processCompletionServerSide(
  completion: import('@/lib/onboarding-completion').ExtractedCompletion,
  _workspacePath: string,
  sessionId: string,
): Promise<void> {
  try {
    if (completion.type === 'onboarding') {
      const { processOnboarding } = await import('@/lib/onboarding-processor');
      console.log('[chat API] Server-side onboarding completion detected');
      await processOnboarding(completion.answers, sessionId);
      console.log('[chat API] Server-side onboarding completion succeeded');
    } else if (completion.type === 'checkin') {
      const { processCheckin } = await import('@/lib/checkin-processor');
      console.log('[chat API] Server-side checkin completion detected');
      await processCheckin(completion.answers, sessionId);
      console.log('[chat API] Server-side checkin completion succeeded');
    }

    // Clear hookTriggeredSessionId directly (no HTTP needed).
    // CAS: only clear if we are still the owner — prevents wiping another
    // tab's legitimate lock when completions arrive out of order.
    try {
      const { loadState, saveState } = await import('@/lib/assistant-workspace');
      const { getSetting: getSettingDirect } = await import('@/lib/db');
      const wsPath = getSettingDirect('assistant_workspace_path');
      if (wsPath) {
        const state = loadState(wsPath);
        if (state.hookTriggeredSessionId === sessionId || !state.hookTriggeredSessionId) {
          state.hookTriggeredSessionId = undefined;
          state.hookTriggeredAt = undefined;
          saveState(wsPath, state);
        }
      }
    } catch {
      // Best effort
    }
  } catch (e) {
    console.error(`[chat API] Server-side ${completion.type} processing failed:`, e);
  }
}
