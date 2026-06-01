'use client';

import { useRef, useState, useCallback, useEffect, useMemo, type KeyboardEvent, type FormEvent } from 'react';
import { Terminal } from "@/components/ui/icon";
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
} from '@/components/ai-elements/prompt-input';
import type { ChatStatus } from 'ai';
import type { FileAttachment, MentionRef } from '@/types';
import { SlashCommandButton } from './SlashCommandButton';
import { SlashCommandPopover } from './SlashCommandPopover';
import { CliToolsPopover } from './CliToolsPopover';
import { ModelSelectorDropdown } from './ModelSelectorDropdown';
import { EffortSelectorDropdown } from './EffortSelectorDropdown';
import { FileAwareSubmitButton, AttachFileButton, FileTreeAttachmentBridge, FileAttachmentsCapsules, CliBadge, ComposerBadgeRow } from './MessageInputParts';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useImageGen } from '@/hooks/useImageGen';
import { PENDING_KEY, setRefImages, deleteRefImages } from '@/lib/image-ref-store';
import { IMAGE_AGENT_SYSTEM_PROMPT } from '@/lib/constants/image-agent-prompt';
import { dataUrlToFileAttachment } from '@/lib/file-utils';
import { usePopoverState } from '@/hooks/usePopoverState';
import { useProviderModels } from '@/hooks/useProviderModels';
import { useCommandBadge } from '@/hooks/useCommandBadge';
import { useCliToolsFetch } from '@/hooks/useCliToolsFetch';
import { useSlashCommands } from '@/hooks/useSlashCommands';
import { resolveKeyAction, cycleIndex, resolveDirectSlash, dispatchBadge, buildCliAppend, parseMentionRefs, dedupeMentionsByPath } from '@/lib/message-input-logic';
import { QuickActions } from './QuickActions';

const MAX_MENTION_FILE_BYTES = 256 * 1024; // 256KB per @file mention
const MAX_MENTION_FILE_COUNT = 6;
const MAX_DIRECTORY_MENTION_COUNT = 3;
const MAX_DIRECTORY_PREVIEW_ITEMS = 30;

interface MessageInputProps {
  onSend: (content: string, files?: FileAttachment[], systemPromptAppend?: string, displayOverride?: string, mentions?: MentionRef[]) => void;
  onCommand?: (command: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  sessionId?: string;
  modelName?: string;
  onModelChange?: (model: string) => void;
  providerId?: string;
  onProviderModelChange?: (providerId: string, model: string) => void;
  workingDirectory?: string;
  onAssistantTrigger?: () => void;
  /** Effort selection lifted to parent for inclusion in the stream chain */
  effort?: string;
  onEffortChange?: (effort: string | undefined) => void;
  /** SDK init metadata — when available, used to validate command/skill availability */
  sdkInitMeta?: { tools?: unknown; slash_commands?: unknown; skills?: unknown } | null;
  /** Initial value to prefill in the input */
  initialValue?: string;
  /** Whether this session is an assistant workspace project */
  isAssistantProject?: boolean;
  /** Whether the session already has messages */
  hasMessages?: boolean;
}

function joinPath(base: string, rel: string): string {
  const b = base.replace(/[\\/]+$/, '');
  const r = rel.replace(/^[\\/]+/, '');
  return `${b}/${r}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fileResponseToAttachment(
  response: Response,
  filename: string,
  idPrefix: string,
): Promise<FileAttachment> {
  const mimeType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = await response.arrayBuffer();
  return {
    id: `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: filename,
    type: mimeType,
    size: buffer.byteLength,
    data: arrayBufferToBase64(buffer),
  };
}

export function MessageInput({
  onSend,
  onCommand,
  onStop,
  disabled,
  isStreaming,
  sessionId,
  modelName,
  onModelChange,
  providerId,
  onProviderModelChange,
  workingDirectory,
  onAssistantTrigger,
  effort: effortProp,
  onEffortChange,
  sdkInitMeta,
  initialValue,
  isAssistantProject,
  hasMessages,
}: MessageInputProps) {
  const { t, locale } = useTranslation();
  const imageGen = useImageGen();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cliSearchRef = useRef<HTMLInputElement>(null);
  // Persist draft per session so switching chats doesn't lose typed text.
  const draftKey = `codepilot:draft:${sessionId || 'new'}`;
  const [inputValue, setInputValueRaw] = useState(() => {
    if (initialValue) return initialValue;
    try { return sessionStorage.getItem(draftKey) || ''; } catch { return ''; }
  });
  const [mentionNodeTypes, setMentionNodeTypes] = useState<Record<string, 'file' | 'directory'>>({});
  const [badgeOrder, setBadgeOrder] = useState<Record<string, number>>({});
  const [mentionOrder, setMentionOrder] = useState<Record<string, number>>({});
  const orderSeqRef = useRef(0);
  const setInputValue = useCallback((v: string | ((prev: string) => string)) => {
    setInputValueRaw((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      try { if (next) sessionStorage.setItem(draftKey, next); else sessionStorage.removeItem(draftKey); } catch { /* quota */ }
      return next;
    });
  }, [draftKey]);

  const mentions = useMemo(() => {
    // Render chips only for explicitly inserted/known mentions.
    return parseMentionRefs(inputValue, mentionNodeTypes).filter((m) => !!mentionNodeTypes[m.path]);
  }, [inputValue, mentionNodeTypes]);

  const nextOrder = useCallback(() => {
    orderSeqRef.current += 1;
    return orderSeqRef.current;
  }, []);

  const ensureBadgeOrder = useCallback((command: string) => {
    setBadgeOrder((prev) => {
      if (prev[command]) return prev;
      return { ...prev, [command]: nextOrder() };
    });
  }, [nextOrder]);

  const ensureMentionOrder = useCallback((path: string) => {
    setMentionOrder((prev) => {
      if (prev[path]) return prev;
      return { ...prev, [path]: nextOrder() };
    });
  }, [nextOrder]);

  // --- Extracted hooks ---
  const popover = usePopoverState(modelName);
  const { providerGroups, currentProviderIdValue, modelOptions, currentModelOption, globalDefaultModel, globalDefaultProvider } = useProviderModels(providerId, modelName);

  // Auto-correct model when it doesn't exist in the current provider's model list.
  // This prevents sending an unsupported model name (e.g. 'opus' to MiniMax which only has 'sonnet').
  // IMPORTANT: Only fall back to first model — never use globalDefaultModel here.
  // Global default model is only for NEW conversations (chat/page.tsx).
  // Existing sessions must keep their own selected model; if that model becomes
  // invalid (provider changed), fall back to the provider's first model, not the
  // global default, to avoid overwriting the session's model choice.
  useEffect(() => {
    if (modelName && modelOptions.length > 0 && !modelOptions.some(m => m.value === modelName)) {
      const fallback = modelOptions[0].value;
      onModelChange?.(fallback);
      onProviderModelChange?.(currentProviderIdValue, fallback);
    }
  }, [modelName, modelOptions, currentProviderIdValue, onModelChange, onProviderModelChange]);

  const { badges, addBadge, removeBadge, clearBadges, cliBadge, setCliBadge, removeCliBadge, hasBadge } = useCommandBadge(textareaRef);
  const addBadgeWithOrder = useCallback((badge: { command: string; label: string; description: string; kind: 'agent_skill' | 'slash_command' | 'sdk_command' | 'codepilot_command'; installedSource?: 'agents' | 'claude' }) => {
    ensureBadgeOrder(badge.command);
    addBadge(badge);
  }, [addBadge, ensureBadgeOrder]);
  const removeBadgeWithOrder = useCallback((command: string) => {
    removeBadge(command);
    setBadgeOrder((prev) => {
      if (!prev[command]) return prev;
      const next = { ...prev };
      delete next[command];
      return next;
    });
  }, [removeBadge]);
  const clearBadgesWithOrder = useCallback(() => {
    clearBadges();
    setBadgeOrder({});
  }, [clearBadges]);

  const cliToolsFetch = useCliToolsFetch({
    popoverMode: popover.popoverMode,
    closePopover: popover.closePopover,
    setPopoverMode: popover.setPopoverMode,
    setSelectedIndex: popover.setSelectedIndex,
    inputValue,
    locale,
    textareaRef,
    cliSearchRef,
    setCliBadge,
    setInputValue,
  });

  const slashCommands = useSlashCommands({
    sessionId,
    workingDirectory,
    sdkInitMeta,
    textareaRef,
    inputValue,
    setInputValue,
    popoverMode: popover.popoverMode,
    popoverFilter: popover.popoverFilter,
    triggerPos: popover.triggerPos,
    setPopoverMode: popover.setPopoverMode,
    setPopoverFilter: popover.setPopoverFilter,
    setPopoverItems: popover.setPopoverItems,
    setSelectedIndex: popover.setSelectedIndex,
    setTriggerPos: popover.setTriggerPos,
    closePopover: popover.closePopover,
    onCommand,
    addBadge: addBadgeWithOrder,
    onMentionInserted: (mention) => {
      setMentionNodeTypes((prev) => ({ ...prev, [mention.path]: mention.nodeType }));
      ensureMentionOrder(mention.path);
    },
    isStreaming: !!isStreaming,
  });

  // Assistant trigger on first focus
  const assistantTriggerFired = useRef(false);
  const handleAssistantFocus = useCallback(() => {
    if (!assistantTriggerFired.current && onAssistantTrigger) {
      assistantTriggerFired.current = true;
      onAssistantTrigger();
    }
  }, [onAssistantTrigger]);

  // Listen for file tree "+" button and drop-router: insert @path into the
  // textarea. `nodeType` defaults to 'file' so older callers still work; when
  // it's 'directory', the difference is stored in mentionNodeTypes (not in the
  // text token) to match the picker's convention (see resolveItemSelection).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ path: string; nodeType?: 'file' | 'directory' }>).detail;
      const rawPath = detail?.path;
      if (!rawPath) return;
      const normalizedPath = rawPath.replace(/\/+$/, '');
      if (!normalizedPath) return;
      const nodeType = detail.nodeType ?? 'file';
      setMentionNodeTypes((prev) => ({ ...prev, [normalizedPath]: nodeType }));
      ensureMentionOrder(normalizedPath);
      setInputValue((prev) => {
        const needsSpace = prev.length > 0 && !prev.endsWith(' ') && !prev.endsWith('\n');
        return prev + (needsSpace ? ' ' : '') + `@${normalizedPath} `;
      });
      setTimeout(() => textareaRef.current?.focus(), 0);
    };
    window.addEventListener('insert-file-mention', handler);
    return () => window.removeEventListener('insert-file-mention', handler);
  }, [setInputValue, setMentionNodeTypes, ensureMentionOrder]);

  const normalizeMentionPath = useCallback((rawPath: string): string => {
    const normalizedRaw = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!workingDirectory) return normalizedRaw;
    const normalizedBase = workingDirectory.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalizedRaw.startsWith(normalizedBase + '/')) {
      return normalizedRaw.slice(normalizedBase.length + 1);
    }
    return normalizedRaw;
  }, [workingDirectory]);

  const fetchMentionFileAttachment = useCallback(async (mentionPath: string): Promise<{ attachment: FileAttachment | null; limitNote?: string }> => {
    const safePath = normalizeMentionPath(mentionPath);
    const filename = safePath.split('/').filter(Boolean).pop() || 'file';
    try {
      if (sessionId) {
        const res = await fetch(`/api/files/serve?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(safePath)}`);
        if (!res.ok) return { attachment: null };
        const headerSize = Number.parseInt(res.headers.get('content-length') || '', 10);
        if (Number.isFinite(headerSize) && headerSize > MAX_MENTION_FILE_BYTES) {
          return { attachment: null, limitNote: `@${safePath}: omitted (file too large > 256KB).` };
        }
        const attachment = await fileResponseToAttachment(res, filename, 'mention');
        if (attachment.size > MAX_MENTION_FILE_BYTES) {
          return { attachment: null, limitNote: `@${safePath}: omitted (file too large > 256KB).` };
        }
        return { attachment };
      }

      if (!workingDirectory) return { attachment: null };
      const absolutePath = joinPath(workingDirectory, safePath);
      const res = await fetch(`/api/files/raw?path=${encodeURIComponent(absolutePath)}`);
      if (!res.ok) return { attachment: null };
      const headerSize = Number.parseInt(res.headers.get('content-length') || '', 10);
      if (Number.isFinite(headerSize) && headerSize > MAX_MENTION_FILE_BYTES) {
        return { attachment: null, limitNote: `@${safePath}: omitted (file too large > 256KB).` };
      }
      const attachment = await fileResponseToAttachment(res, filename, 'mention');
      if (attachment.size > MAX_MENTION_FILE_BYTES) {
        return { attachment: null, limitNote: `@${safePath}: omitted (file too large > 256KB).` };
      }
      return { attachment };
    } catch {
      return { attachment: null };
    }
  }, [sessionId, workingDirectory, normalizeMentionPath]);

  const fetchDirectorySummary = useCallback(async (mentionPath: string): Promise<string | null> => {
    if (!workingDirectory) return null;
    const safePath = normalizeMentionPath(mentionPath);
    const dir = joinPath(workingDirectory, safePath);
    try {
      const res = await fetch(`/api/files?dir=${encodeURIComponent(dir)}&baseDir=${encodeURIComponent(workingDirectory)}&depth=2`);
      if (!res.ok) return null;
      const data = await res.json();
      const tree = Array.isArray(data.tree) ? data.tree : [];
      const preview = tree.slice(0, MAX_DIRECTORY_PREVIEW_ITEMS).map((node: { name: string; type: 'file' | 'directory' }) => (
        node.type === 'directory' ? `- ${node.name}/` : `- ${node.name}`
      ));
      const extra = tree.length > MAX_DIRECTORY_PREVIEW_ITEMS
        ? `\n- ... (${tree.length - MAX_DIRECTORY_PREVIEW_ITEMS} more)`
        : '';
      return `Directory reference @${safePath}/\n${preview.join('\n')}${extra}`;
    } catch {
      return null;
    }
  }, [workingDirectory, normalizeMentionPath]);

  const handleSubmit = useCallback(async (msg: { text: string; files: Array<{ type: string; url: string; filename?: string; mediaType?: string }> }, e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const content = inputValue.trim();

    popover.closePopover();

    // Convert PromptInput FileUIParts (with data URLs) to FileAttachment[]
    const convertFiles = async (): Promise<FileAttachment[]> => {
      if (!msg.files || msg.files.length === 0) return [];

      const attachments: FileAttachment[] = [];
      for (const file of msg.files) {
        if (!file.url) continue;
        try {
          const attachment = await dataUrlToFileAttachment(
            file.url,
            file.filename || 'file',
            file.mediaType || 'application/octet-stream',
          );
          attachments.push(attachment);
        } catch {
          // Skip files that fail conversion
        }
      }
      return attachments;
    };

    const resolveMentionPayload = async () => {
      // Only treat mentions inserted/confirmed by the picker (or file-tree bridge)
      // as structured mentions. Plain typed "@foo" should remain plain text.
      const parsedMentions = parseMentionRefs(inputValue, mentionNodeTypes)
        .filter((m) => !!mentionNodeTypes[m.path]);
      const dedupedMentions = dedupeMentionsByPath(parsedMentions);
      if (dedupedMentions.length === 0) {
        return {
          mentions: [] as MentionRef[],
          files: [] as FileAttachment[],
          directoryNotes: [] as string[],
          limitNotes: [] as string[],
        };
      }

      const mentionFiles: FileAttachment[] = [];
      const directoryNotes: string[] = [];
      const limitNotes: string[] = [];
      let usedDirectoryMentions = 0;
      for (const mention of dedupedMentions) {
        if (mention.nodeType === 'directory') {
          if (usedDirectoryMentions >= MAX_DIRECTORY_MENTION_COUNT) {
            limitNotes.push(`@${mention.path}/: omitted (max ${MAX_DIRECTORY_MENTION_COUNT} directories per message).`);
            continue;
          }
          const summary = await fetchDirectorySummary(mention.path);
          if (summary) directoryNotes.push(summary);
          usedDirectoryMentions += 1;
          continue;
        }
        if (mentionFiles.length >= MAX_MENTION_FILE_COUNT) {
          limitNotes.push(`@${mention.path}: omitted (max ${MAX_MENTION_FILE_COUNT} files per message).`);
          continue;
        }
        const { attachment, limitNote } = await fetchMentionFileAttachment(mention.path);
        if (attachment) mentionFiles.push(attachment);
        if (limitNote) limitNotes.push(limitNote);
      }
      return { mentions: dedupedMentions, files: mentionFiles, directoryNotes, limitNotes };
    };

    // If Image Agent toggle is on and no badge, send via normal LLM with systemPromptAppend.
    // PENDING_KEY is a global singleton — queuing would misattach refs, so block entirely
    // during streaming rather than letting it fall through to the plain queue path.
    if (imageGen.state.enabled && badges.length === 0) {
      if (isStreaming) return; // silently block — can't safely queue image-agent prompts
      const uploadedFiles = await convertFiles();
      const mentionPayload = await resolveMentionPayload();
      const files = [...uploadedFiles, ...mentionPayload.files];
      const mentionSections: string[] = [];
      if (mentionPayload.directoryNotes.length > 0) {
        mentionSections.push(`[Referenced Directories]\n${mentionPayload.directoryNotes.join('\n\n')}`);
      }
      if (mentionPayload.limitNotes.length > 0) {
        mentionSections.push(`[Mention Limits]\n${mentionPayload.limitNotes.map((x) => `- ${x}`).join('\n')}`);
      }
      const mentionAppend = mentionSections.length > 0 ? `\n\n${mentionSections.join('\n\n')}` : '';
      const finalContent = `${content}${mentionAppend}`.trim();
      if (!finalContent && files.length === 0) return;

      // Store uploaded images as pending reference images for ImageGenConfirmation
      const imageFiles = files.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        setRefImages(PENDING_KEY, imageFiles.map(f => ({ mimeType: f.type, data: f.data })));
      } else {
        deleteRefImages(PENDING_KEY);
      }

      setInputValue('');
      if (onSend) {
        onSend(
          finalContent,
          files.length > 0 ? files : undefined,
          IMAGE_AGENT_SYSTEM_PROMPT,
          mentionPayload.mentions.length > 0 ? content : undefined,
          mentionPayload.mentions.length > 0 ? mentionPayload.mentions : undefined,
        );
      }
      return;
    }

    // If one or more badges are active, dispatch by kind (multi-skill combines).
    // Block during streaming — badges carry slash/skill semantics, not safe to queue.
    if (badges.length > 0) {
      if (isStreaming) return;
      const uploadedFiles = await convertFiles();
      const mentionPayload = await resolveMentionPayload();
      const files = [...uploadedFiles, ...mentionPayload.files];
      const { prompt, displayLabel } = dispatchBadge(badges, content);
      const mentionSections: string[] = [];
      if (mentionPayload.directoryNotes.length > 0) {
        mentionSections.push(`[Referenced Directories]\n${mentionPayload.directoryNotes.join('\n\n')}`);
      }
      if (mentionPayload.limitNotes.length > 0) {
        mentionSections.push(`[Mention Limits]\n${mentionPayload.limitNotes.map((x) => `- ${x}`).join('\n')}`);
      }
      const mentionAppend = mentionSections.length > 0 ? `\n\n${mentionSections.join('\n\n')}` : '';
      const finalPrompt = `${prompt}${mentionAppend}`.trim();
      clearBadgesWithOrder();
      setInputValue('');
      onSend(
        finalPrompt,
        files.length > 0 ? files : undefined,
        undefined,
        displayLabel,
        mentionPayload.mentions.length > 0 ? mentionPayload.mentions : undefined,
      );
      return;
    }

    const uploadedFiles = await convertFiles();
    const mentionPayload = await resolveMentionPayload();
    const files = [...uploadedFiles, ...mentionPayload.files];
    const mentionSections: string[] = [];
    if (mentionPayload.directoryNotes.length > 0) {
      mentionSections.push(`[Referenced Directories]\n${mentionPayload.directoryNotes.join('\n\n')}`);
    }
    if (mentionPayload.limitNotes.length > 0) {
      mentionSections.push(`[Mention Limits]\n${mentionPayload.limitNotes.map((x) => `- ${x}`).join('\n')}`);
    }
    const mentionAppend = mentionSections.length > 0 ? `\n\n${mentionSections.join('\n\n')}` : '';
    const finalContent = `${content}${mentionAppend}`.trim();
    const hasFiles = files.length > 0;

    if ((!finalContent && !hasFiles) || disabled) return;

    // Check if it's a direct slash command typed in the input.
    if (!hasFiles) {
      const slashResult = resolveDirectSlash(finalContent);
      if (slashResult.action === 'immediate_command' || slashResult.action === 'set_badge' || slashResult.action === 'unknown_slash_badge') {
        // Slash commands must NOT execute or queue during streaming —
        // destructive commands (e.g. /clear) would race with the active stream.
        if (isStreaming) return;
        if (slashResult.action === 'immediate_command') {
          if (onCommand) {
            setInputValue('');
            onCommand(slashResult.commandValue!);
            return;
          }
        } else {
          addBadgeWithOrder(slashResult.badge!);
          setInputValue('');
          return;
        }
      }
    }

    // If CLI badge is active, inject systemPromptAppend to guide model
    const cliAppend = buildCliAppend(cliBadge);
    if (cliBadge) setCliBadge(null);

    const displayOverride = mentionPayload.mentions.length > 0 ? content : undefined;
    onSend(
      finalContent || 'Please review the attached file(s).',
      hasFiles ? files : undefined,
      cliAppend,
      displayOverride,
      mentionPayload.mentions.length > 0 ? mentionPayload.mentions : undefined,
    );
    setInputValue('');
  }, [inputValue, mentionNodeTypes, onSend, onCommand, disabled, isStreaming, popover, badges, cliBadge, imageGen, addBadgeWithOrder, clearBadgesWithOrder, setCliBadge, setInputValue, fetchDirectorySummary, fetchMentionFileAttachment]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Mention token behavior: one Backspace removes the whole @path token.
      if (e.key === 'Backspace') {
        const ta = textareaRef.current;
        const start = ta?.selectionStart ?? 0;
        const end = ta?.selectionEnd ?? 0;
        if (start === end && start > 0) {
          const before = inputValue.slice(0, start);
          const tokenMatch = before.match(/(^|\s)@([^\s@]+)\s$/) || before.match(/(^|\s)@([^\s@]+)$/);
          if (tokenMatch) {
            const mentionPath = (tokenMatch[2] || '').replace(/[.,!?;:)\]}]+$/, '');
            if (mentionPath && mentionNodeTypes[mentionPath]) {
              e.preventDefault();
              const boundaryLen = (tokenMatch[1] || '').length;
              const mentionStart = start - tokenMatch[0].length + boundaryLen;
              const mentionEnd = start;
              const next = `${inputValue.slice(0, mentionStart)}${inputValue.slice(mentionEnd)}`.replace(/\s{2,}/g, ' ');
              const stillHasSamePath = parseMentionRefs(next).some((m) => m.path === mentionPath);
              setInputValue(next);
              if (!stillHasSamePath) {
                setMentionNodeTypes((prev) => {
                  const updated = { ...prev };
                  delete updated[mentionPath];
                  return updated;
                });
                setMentionOrder((prev) => {
                  const updated = { ...prev };
                  delete updated[mentionPath];
                  return updated;
                });
              }
              requestAnimationFrame(() => {
                const el = textareaRef.current;
                if (!el) return;
                const pos = Math.max(0, Math.min(mentionStart, next.length));
                el.setSelectionRange(pos, pos);
              });
              return;
            }
          }
        }
      }

      const action = resolveKeyAction(e.key, {
        popoverMode: popover.popoverMode,
        popoverHasItems: popover.popoverItems.length > 0,
        inputValue,
        hasBadge: badges.length > 0,
        hasCliBadge: !!cliBadge,
      });

      switch (action.type) {
        case 'popover_navigate':
          e.preventDefault();
          popover.setSelectedIndex((prev) =>
            cycleIndex(prev, action.direction, popover.allDisplayedItems.length),
          );
          return;

        case 'popover_select':
          e.preventDefault();
          if (popover.allDisplayedItems[popover.selectedIndex]) {
            slashCommands.insertItem(popover.allDisplayedItems[popover.selectedIndex]);
          }
          return;

        case 'close_popover':
          e.preventDefault();
          popover.closePopover();
          return;

        case 'remove_badge':
          e.preventDefault();
          // Backspace/Escape pops the most recently added badge; matches the
          // mental model of "undo my last selection".
          if (badges.length > 0) removeBadgeWithOrder(badges[badges.length - 1].command);
          return;

        case 'remove_cli_badge':
          e.preventDefault();
          removeCliBadge();
          return;

        case 'passthrough':
          break;
      }

      // CLI popover keyboard navigation (not covered by resolveKeyAction)
      if (popover.popoverMode === 'cli' && cliToolsFetch.cliTools.length > 0) {
        const q = cliToolsFetch.cliFilter.toLowerCase();
        const filtered = cliToolsFetch.cliTools.filter(t =>
          t.name.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q)
        );
        if (filtered.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            popover.setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            popover.setSelectedIndex((prev) => Math.max(prev - 1, 0));
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[popover.selectedIndex]) cliToolsFetch.handleCliSelect(filtered[popover.selectedIndex]);
            return;
          }
        }
      }
    },
    [popover, slashCommands, cliToolsFetch, badges, cliBadge, inputValue, mentionNodeTypes, removeBadgeWithOrder, removeCliBadge, setInputValue]
  );

  const uniqueMentions = useMemo(() => dedupeMentionsByPath(mentions), [mentions]);
  const removeMention = useCallback((targetMention: MentionRef) => {
    let removedPath = '';
    let stillHasSamePath = false;
    setInputValue((prev) => {
      const parsed = parseMentionRefs(prev, mentionNodeTypes);
      const exact = parsed.find((m) =>
        m.path === targetMention.path
        && m.sourceRange?.start === targetMention.sourceRange?.start
        && m.sourceRange?.end === targetMention.sourceRange?.end
      );
      const target = exact || parsed.find((m) => m.path === targetMention.path);
      if (!target?.sourceRange) return prev;
      removedPath = target.path;
      const { start, end } = target.sourceRange;
      const before = prev.slice(0, start);
      let after = prev.slice(end);
      if (before.endsWith(' ') && after.startsWith(' ')) after = after.slice(1);
      const next = `${before}${after}`.replace(/\s{2,}/g, ' ').trimStart();
      stillHasSamePath = parseMentionRefs(next).some((m) => m.path === target.path);
      return next;
    });
    if (!removedPath) return;
    if (!stillHasSamePath) {
      setMentionNodeTypes((prev) => {
        if (!prev[removedPath]) return prev;
        const next = { ...prev };
        delete next[removedPath];
        return next;
      });
      setMentionOrder((prev) => {
        if (!prev[removedPath]) return prev;
        const next = { ...prev };
        delete next[removedPath];
        return next;
      });
    }
  }, [setInputValue, mentionNodeTypes]);

  // Drop-router for folders: browsers hand us directory drops as 0-size File
  // entries whose mediaType is ''. Default behavior in PromptInput would insert
  // them as bogus attachments. Route them to the existing @mention pipeline as
  // directory references instead — matching what the picker produces.
  const handleDirectoriesDropped = useCallback((dirs: File[]) => {
    const resolver = typeof window !== 'undefined' ? window.electronAPI?.fs?.getPathForFile : undefined;
    for (const dir of dirs) {
      const absolute = resolver ? resolver(dir) : '';
      // Without an absolute path (non-Electron or resolver missing), fall back
      // to the folder name — the LLM can still act on the name as a hint.
      const rawPath = absolute || dir.name;
      if (!rawPath) continue;
      const normalized = normalizeMentionPath(rawPath);
      window.dispatchEvent(new CustomEvent('insert-file-mention', {
        detail: { path: normalized, nodeType: 'directory' },
      }));
    }
  }, [normalizeMentionPath]);

  // Effort selector state — guard against undefined when model not found in current provider's list
  const currentModelMeta = currentModelOption as (typeof currentModelOption & { supportsEffort?: boolean; supportedEffortLevels?: string[] }) | undefined;
  const showEffortSelector = currentModelMeta?.supportsEffort === true;
  // Default label is 'auto' — the UI displays "默认 / Auto" and no explicit
  // effort value is sent to the backend. This lets Claude Code apply its
  // per-model default (e.g. xhigh on Opus 4.7). If we initialized to 'high'
  // instead, the button would say "High" while the request actually carried
  // undefined, which silently sent a different level than shown.
  const [localEffort, setLocalEffort] = useState<string>('auto');
  const selectedEffort = effortProp ?? localEffort;
  const setSelectedEffort = useCallback((v: string) => {
    setLocalEffort(v);
    // Passthrough — including the 'auto' sentinel. The send path in
    // page.tsx / ChatView.tsx filters 'auto' before building the request
    // so the backend receives no effort field, letting CLI apply its
    // per-model default.
    onEffortChange?.(v);
  }, [onEffortChange]);

  const currentModelValue = modelName || 'sonnet';
  const chatStatus: ChatStatus = isStreaming ? 'streaming' : 'ready';

  return (
    <div className="bg-background/80 backdrop-blur-lg px-4 pt-2 pb-1">
      <div className="mx-auto">
        <div className="relative">
          {/* Slash Command / File Popover */}
          <SlashCommandPopover
            popoverMode={popover.popoverMode}
            popoverRef={popover.popoverRef}
            filteredItems={popover.filteredItems}
            aiSuggestions={popover.aiSuggestions}
            aiSearchLoading={popover.aiSearchLoading}
            selectedIndex={popover.selectedIndex}
            popoverFilter={popover.popoverFilter}
            inputValue={inputValue}
            triggerPos={popover.triggerPos}
            searchInputRef={searchInputRef}
            allDisplayedItems={popover.allDisplayedItems}
            onInsertItem={slashCommands.insertItem}
            onSetSelectedIndex={popover.setSelectedIndex}
            onSetPopoverFilter={popover.setPopoverFilter}
            onSetInputValue={setInputValue}
            onClosePopover={popover.closePopover}
            onFocusTextarea={() => textareaRef.current?.focus()}
          />

          {/* CLI Tools Popover */}
          {popover.popoverMode === 'cli' && (
            <CliToolsPopover
              popoverRef={popover.popoverRef}
              cliTools={cliToolsFetch.cliTools}
              cliFilter={cliToolsFetch.cliFilter}
              selectedIndex={popover.selectedIndex}
              cliSearchRef={cliSearchRef}
              onSetCliFilter={cliToolsFetch.setCliFilter}
              onSetSelectedIndex={popover.setSelectedIndex}
              onCliSelect={cliToolsFetch.handleCliSelect}
              onClosePopover={popover.closePopover}
              onFocusTextarea={() => textareaRef.current?.focus()}
            />
          )}

          {/* Quick Actions — memory-driven suggestion chips */}
          <QuickActions
            isAssistantProject={!!isAssistantProject}
            hasMessages={!!hasMessages}
            onAction={(text) => {
              onSend(text);
              // Clear input after send to avoid stale text
              setInputValue('');
            }}
          />

          {/* PromptInput replaces the old input area */}
          <PromptInput
            onSubmit={handleSubmit}
            accept=""
            multiple
            onDirectoriesDropped={handleDirectoriesDropped}
          >
            {/* Bridge: listens for file tree "+" button events */}
            <FileTreeAttachmentBridge />
            {/* Unified command + mention badges row */}
            <ComposerBadgeRow
              badges={badges}
              mentions={uniqueMentions}
              badgeOrder={badgeOrder}
              mentionOrder={mentionOrder}
              onRemoveBadge={removeBadgeWithOrder}
              onRemoveMention={removeMention}
            />
            {/* CLI badge */}
            {cliBadge && (
              <CliBadge name={cliBadge.name} onRemove={removeCliBadge} />
            )}
            {/* File attachment capsules */}
            <FileAttachmentsCapsules />
            <PromptInputTextarea
              ref={textareaRef}
              placeholder={badges.length > 0 ? "Add details (optional), then press Enter..." : cliBadge ? "Describe what you want to do..." : "Message Claude..."}
              value={inputValue}
              onChange={(e) => slashCommands.handleInputChange(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleAssistantFocus}
              disabled={disabled}
              className="min-h-10"
            />
            <PromptInputFooter>
              <PromptInputTools>
                {/* Attach file button */}
                <AttachFileButton />

                {/* Slash command button */}
                <SlashCommandButton onInsertSlash={slashCommands.handleInsertSlash} />

                {/* CLI tools button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PromptInputButton onClick={cliToolsFetch.handleOpenCliPopover}>
                      <Terminal size={16} />
                    </PromptInputButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('cliTools.selectTool' as TranslationKey)}
                  </TooltipContent>
                </Tooltip>

                {/* Model selector */}
                <ModelSelectorDropdown
                  currentModelValue={currentModelValue}
                  currentProviderIdValue={currentProviderIdValue}
                  providerGroups={providerGroups}
                  modelOptions={modelOptions}
                  onModelChange={onModelChange}
                  onProviderModelChange={onProviderModelChange}
                  globalDefaultModel={globalDefaultModel}
                  globalDefaultProvider={globalDefaultProvider}
                />

                {/* Effort selector — only visible when model supports effort */}
                {showEffortSelector && (
                  <EffortSelectorDropdown
                    selectedEffort={selectedEffort}
                    onEffortChange={setSelectedEffort}
                    supportedEffortLevels={currentModelMeta?.supportedEffortLevels}
                  />
                )}

              </PromptInputTools>

              <FileAwareSubmitButton
                status={chatStatus}
                onStop={onStop}
                disabled={disabled}
                inputValue={inputValue}
                hasBadge={hasBadge}
                isImageAgentOn={imageGen.state.enabled}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>

    </div>
  );
}
