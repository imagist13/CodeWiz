"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  GitBranch,
  TreeStructure,
  PencilSimple,
  DotOutline,
  ChartBar,
  Brain,
} from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePanel } from "@/hooks/usePanel";
import { useTranslation } from "@/hooks/useTranslation";
import { useClientPlatform } from '@/hooks/useClientPlatform';
import { showToast } from '@/hooks/useToast';
import { SPECIES_IMAGE_URL, EGG_IMAGE_URL, type Species } from '@/lib/buddy';

export function UnifiedTopBar() {
  const {
    sessionTitle,
    setSessionTitle,
    sessionId,
    workingDirectory,
    fileTreeOpen,
    setFileTreeOpen,
    gitPanelOpen,
    setGitPanelOpen,
    dashboardPanelOpen,
    setDashboardPanelOpen,
    assistantPanelOpen,
    setAssistantPanelOpen,
    isAssistantWorkspace,
    currentBranch,
    gitDirtyCount,
  } = usePanel();
  const { t } = useTranslation();
  const { isWindows } = useClientPlatform();
  const [assistantName, setAssistantName] = useState('');
  const [buddyEmoji, setBuddyEmoji] = useState('');
  const [buddySpecies, setBuddySpecies] = useState('');

  useEffect(() => {
    if (!isAssistantWorkspace) return;
    let cancelled = false;
    fetch('/api/workspace/summary')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) { setAssistantName(data?.name || ''); setBuddyEmoji(data?.buddy?.emoji || ''); setBuddySpecies(data?.buddy?.species || ''); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAssistantWorkspace]);
  const pathname = usePathname();

  // Only show Git/terminal/panel controls on chat detail routes (/chat/[id]),
  // not on the empty /chat page where panels aren't mounted.
  const isChatRoute = pathname.startsWith("/chat/") && pathname !== "/chat";

  // --- Title editing ---
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleStartEditTitle = useCallback(() => {
    setEditTitle(sessionTitle || t('chat.newConversation'));
    setIsEditingTitle(true);
  }, [sessionTitle, t]);

  const handleSaveTitle = useCallback(async () => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setIsEditingTitle(false);
      return;
    }
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        setSessionTitle(trimmed);
        window.dispatchEvent(new CustomEvent('session-updated', { detail: { id: sessionId, title: trimmed } }));
      }
    } catch {
      showToast({ type: 'error', message: t('error.titleSaveFailed') });
    }
    setIsEditingTitle(false);
  }, [editTitle, sessionId, setSessionTitle, t]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  }, [handleSaveTitle]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Extract project name from working directory
  const projectName = workingDirectory ? workingDirectory.split(/[\\/]/).filter(Boolean).pop() || '' : '';

  // On non-chat routes, render only a thin drag region (no visible bar)
  if (!isChatRoute) {
    // Thin drag region for macOS window dragging
    return (
      <div
        className="h-0 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
    );
  }

  return (
    <>
      <div
        className="flex h-10 shrink-0 items-center gap-2 bg-background/50 px-3 border-b border-border/40"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Left: chat title + project folder */}
        <div
          className="flex items-center gap-1.5 min-w-0 shrink"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {isChatRoute && sessionTitle && (
            isEditingTitle ? (
              <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <Input
                  ref={titleInputRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={handleSaveTitle}
                  className="h-6 text-xs max-w-[180px] px-2"
                />
              </div>
            ) : (
              <div className="flex items-center gap-1 cursor-default max-w-[180px]">
                <h2 className="text-xs font-medium text-foreground/70 truncate">
                  {sessionTitle}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStartEditTitle}
                  className="shrink-0 h-auto w-auto p-0.5 opacity-0 group-hover:opacity-100"
                >
                  <PencilSimple size={11} className="text-muted-foreground/60" />
                </Button>
              </div>
            )
          )}

          {isChatRoute && projectName && sessionTitle && (
            <span className="text-[10px] text-muted-foreground/40 shrink-0 mx-0.5">/</span>
          )}

          {isChatRoute && projectName && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  size="sm"
                  className="text-[11px] text-muted-foreground/50 shrink-0 hover:text-foreground/70 transition-colors h-auto p-0"
                  onClick={() => {
                    if (workingDirectory) {
                      if (window.electronAPI?.shell?.openPath) {
                        window.electronAPI.shell.openPath(workingDirectory);
                      } else {
                        fetch('/api/files/open', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ path: workingDirectory }),
                        }).catch(() => {});
                      }
                    }
                  }}
                >
                  {projectName}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-[10px] break-all">{workingDirectory}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: action buttons */}
        <div
          className="flex items-center gap-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {isChatRoute && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={gitPanelOpen ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-7 gap-1 px-2 ${gitPanelOpen ? "bg-primary/10 text-primary" : "text-muted-foreground/60 hover:text-foreground/70"}`}
                    onClick={() => setGitPanelOpen(!gitPanelOpen)}
                  >
                    <GitBranch size={13} />
                    {currentBranch && (
                      <span className="text-[11px] max-w-[80px] truncate">{currentBranch}</span>
                    )}
                    {gitDirtyCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                        <DotOutline size={9} weight="fill" />
                        {gitDirtyCount}
                      </span>
                    )}
                    <span className="sr-only">{t('topBar.git')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('topBar.git')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={fileTreeOpen ? "secondary" : "ghost"}
                    size="icon-sm"
                    className={`h-7 w-7 ${fileTreeOpen ? "bg-primary/10 text-primary" : "text-muted-foreground/60 hover:text-foreground/70"}`}
                    onClick={() => setFileTreeOpen(!fileTreeOpen)}
                  >
                    <TreeStructure size={14} />
                    <span className="sr-only">{t('topBar.fileTree')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('topBar.fileTree')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={dashboardPanelOpen ? "secondary" : "ghost"}
                    size="icon-sm"
                    className={`h-7 w-7 ${dashboardPanelOpen ? "bg-primary/10 text-primary" : "text-muted-foreground/60 hover:text-foreground/70"}`}
                    onClick={() => setDashboardPanelOpen(!dashboardPanelOpen)}
                  >
                    {isAssistantWorkspace
                      ? <img
                          src={buddySpecies ? (SPECIES_IMAGE_URL[buddySpecies as Species] || '') : EGG_IMAGE_URL}
                          alt="" width={14} height={14} className="rounded-[3px]"
                        />
                      : <ChartBar size={14} />}
                    <span className="sr-only">{t('topBar.dashboard')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isAssistantWorkspace ? 'Assistant' : t('topBar.dashboard')}
                </TooltipContent>
              </Tooltip>
            </>
          )}
          {isWindows && <div style={{ width: 138 }} className="shrink-0" />}
        </div>
      </div>
    </>
  );
}
