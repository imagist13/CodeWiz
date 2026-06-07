'use client';

import { useEffect, useCallback } from 'react';
import { ArrowUp, Plus, X, Stop, Terminal, Brain, NotePencil, Lightning, File as FileIcon, Folder } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';
import {
  PromptInputButton,
  PromptInputSubmit,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input';
import type { ChatStatus } from 'ai';
import { isSubmitEnabled } from '@/lib/message-input-logic';
import type { MentionRef, CommandBadge as CommandBadgeType } from '@/types';

/**
 * Submit button that's aware of file attachments. Must be rendered inside PromptInput.
 */
export function FileAwareSubmitButton({
  status,
  onStop,
  disabled,
  inputValue,
  hasBadge,
  isImageAgentOn,
}: {
  status: ChatStatus;
  onStop?: () => void;
  disabled?: boolean;
  inputValue: string;
  hasBadge: boolean;
  /** Whether the Image Agent toggle is currently enabled */
  isImageAgentOn?: boolean;
}) {
  const attachments = usePromptInputAttachments();
  const hasFiles = attachments.files.length > 0;
  const isStreaming = status === 'streaming' || status === 'submitted';

  // During streaming only plain text can queue. Slash commands, badges, and
  // Image Agent are all blocked by handleSubmit(), so the button must not
  // advertise sendability for those paths.
  const trimmed = inputValue.trim();
  const canQueue = isStreaming
    && !!trimmed
    && !hasBadge
    && !trimmed.startsWith('/')
    && !isImageAgentOn;

  const enabled = isSubmitEnabled({
    inputValue,
    hasBadge,
    hasFiles,
    isStreaming,
    disabled: !!disabled,
  });

  return (
    <PromptInputSubmit
      status={canQueue ? 'ready' : status}
      onStop={canQueue ? undefined : onStop}
      disabled={!enabled}
      className="rounded-full"
    >
      {canQueue ? (
        <ArrowUp size={16} />
      ) : isStreaming ? (
        <Stop size={16} />
      ) : (
        <ArrowUp size={16} />
      )}
    </PromptInputSubmit>
  );
}

/**
 * Attachment button that opens the file dialog. Must be rendered inside PromptInput.
 */
export function AttachFileButton() {
  const attachments = usePromptInputAttachments();
  const { t } = useTranslation();

  return (
    <PromptInputButton
      onClick={() => attachments.openFileDialog()}
      tooltip={t('messageInput.attachFiles')}
    >
      <Plus size={16} />
    </PromptInputButton>
  );
}

/**
 * Bridge component that listens for 'attach-file-to-chat' custom events
 * from the file tree and adds the file as a proper attachment (capsule).
 * Uses /api/files/raw to fetch the real file binary, preserving type and content.
 */
export function FileTreeAttachmentBridge() {
  const attachments = usePromptInputAttachments();

  const handleAttach = useCallback(async (filePath: string) => {
    try {
      const res = await fetch(`/api/files/raw?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        // Fallback: insert as @mention if the raw API fails
        window.dispatchEvent(new CustomEvent('insert-file-mention', { detail: { path: filePath } }));
        return;
      }
      const blob = await res.blob();
      const fileName = filePath.split('/').pop() || 'file';
      // Use the content-type from the server response (it resolves from extension)
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      const file = new File([blob], fileName, { type: contentType });
      attachments.add([file]);
    } catch {
      // Fallback: insert as @mention if fetch fails
      window.dispatchEvent(new CustomEvent('insert-file-mention', { detail: { path: filePath } }));
    }
  }, [attachments]);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string }>;
      const filePath = customEvent.detail?.path;
      if (!filePath) return;
      handleAttach(filePath);
    };

    window.addEventListener('attach-file-to-chat', handler);
    return () => window.removeEventListener('attach-file-to-chat', handler);
  }, [handleAttach]);

  return null;
}

/**
 * Capsule display for attached files, rendered inside PromptInput context.
 */
export function FileAttachmentsCapsules() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) return null;

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 px-3 pt-2 pb-0 order-first">
      {attachments.files.map((file) => {
        const isImage = file.mediaType?.startsWith('image/');
        return (
          <span
            key={file.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-status-success-muted text-status-success-foreground pl-2 pr-1 py-0.5 text-xs font-medium border border-status-success-border"
          >
            {isImage && file.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={file.url}
                alt={file.filename || 'image'}
                className="h-5 w-5 rounded object-cover"
              />
            )}
            <span className="max-w-[120px] truncate text-[11px]">
              {file.filename || 'file'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => attachments.remove(file.id)}
              className="ml-0.5 h-auto w-auto rounded-full p-0.5 hover:bg-status-success-border"
            >
              <X size={12} />
            </Button>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Slash-command badge chip — shows just the command label. Description used
 * to be rendered next to it but took too much horizontal space (user feedback),
 * and is already visible in the picker before selection anyway.
 *
 * Used by CommandBadgeList for both single- and multi-badge display.
 */
export function CommandBadge({
  badge,
  onRemove,
}: {
  badge: CommandBadgeType;
  onRemove: () => void;
}) {
  const icon = badge.kind === 'agent_skill'
    ? <Brain size={12} />
    : badge.kind === 'codepilot_command'
      ? <Lightning size={12} />
      : <NotePencil size={12} />;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary pl-2.5 pr-1 py-1 text-xs font-medium border border-primary/20">
      {icon}
      <span className="font-mono">{badge.command}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="ml-0.5 h-auto w-auto rounded-full p-0.5 hover:bg-primary/20"
      >
        <X size={12} />
      </Button>
    </span>
  );
}

/**
 * Wrapper that renders zero or more CommandBadges above the textarea. Uses
 * flex-wrap so the chips flow to a new line when they won't fit. Replaces
 * the old single-badge render block in MessageInput.
 */
export function CommandBadgeList({
  badges,
  onRemove,
}: {
  badges: ReadonlyArray<CommandBadgeType>;
  onRemove: (command: string) => void;
}) {
  if (badges.length === 0) return null;
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 px-3 pt-2.5 pb-0 order-first">
      {badges.map((b) => (
        <CommandBadge key={b.command} badge={b} onRemove={() => onRemove(b.command)} />
      ))}
    </div>
  );
}

/**
 * CLI tool badge displayed above the textarea.
 */
export function CliBadge({
  name,
  onRemove,
}: {
  name: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex w-full items-center gap-1.5 px-3 pt-2.5 pb-0 order-first">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success-muted text-status-success-foreground pl-2.5 pr-1.5 py-1 text-xs font-medium border border-status-success-border">
        <Terminal size={12} />
        <span>CLI: {name}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="ml-0.5 h-auto w-auto rounded-full p-0.5 hover:bg-status-success-border"
        >
          <X size={12} />
        </Button>
      </span>
    </div>
  );
}

/**
 * Mention badge for structured @ references.
 */
function MentionBadge({
  mention,
  onRemove,
}: {
  mention: MentionRef;
  onRemove: (mention: MentionRef) => void;
}) {
  const isDirectory = mention.nodeType === 'directory';
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary pl-2.5 pr-1 py-1 text-xs font-medium border border-primary/20">
      {isDirectory ? <Folder size={12} /> : <FileIcon size={12} />}
      <span className="font-mono truncate max-w-[180px]">
        @{mention.display}{isDirectory ? '/' : ''}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(mention)}
        className="ml-0.5 h-auto w-auto rounded-full p-0.5 hover:bg-primary/20"
      >
        <X size={12} />
      </Button>
    </span>
  );
}

export function MentionBadgeList({
  mentions,
  onRemove,
}: {
  mentions: MentionRef[];
  onRemove: (mention: MentionRef) => void;
}) {
  if (mentions.length === 0) return null;
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 px-3 pt-2.5 pb-0 order-first">
      {mentions.map((m) => (
        <MentionBadge key={`${m.path}-${m.nodeType}`} mention={m} onRemove={onRemove} />
      ))}
    </div>
  );
}

/**
 * Unified row for command badges and @mention badges so they appear in one line-flow.
 */
export function ComposerBadgeRow({
  badges,
  mentions,
  badgeOrder,
  mentionOrder,
  onRemoveBadge,
  onRemoveMention,
}: {
  badges: ReadonlyArray<CommandBadgeType>;
  mentions: MentionRef[];
  badgeOrder: Record<string, number>;
  mentionOrder: Record<string, number>;
  onRemoveBadge: (command: string) => void;
  onRemoveMention: (mention: MentionRef) => void;
}) {
  if (badges.length === 0 && mentions.length === 0) return null;

  const mixed = [
    ...badges.map((b, idx) => ({
      kind: 'badge' as const,
      order: badgeOrder[b.command] ?? 100000 + idx,
      key: `badge-${b.command}`,
      badge: b,
    })),
    ...mentions.map((m, idx) => ({
      kind: 'mention' as const,
      order: mentionOrder[m.path] ?? (m.sourceRange?.start ?? 200000 + idx),
      key: `mention-${m.path}-${m.nodeType}-${m.sourceRange?.start ?? idx}`,
      mention: m,
    })),
  ].sort((a, b) => a.order - b.order);

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 px-3 pt-2.5 pb-0 order-first">
      {mixed.map((item) =>
        item.kind === 'badge'
          ? <CommandBadge key={item.key} badge={item.badge} onRemove={() => onRemoveBadge(item.badge.command)} />
          : <MentionBadge key={item.key} mention={item.mention} onRemove={onRemoveMention} />
      )}
    </div>
  );
}
