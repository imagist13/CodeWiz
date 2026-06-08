"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { TooltipProvider } from "@/components/ui/tooltip";
// NavRail removed — navigation merged into ChatListPanel
import { ChatListPanel } from "./ChatListPanel";
import { ResizeHandle } from "./ResizeHandle";
import { FeatureAnnouncementDialog } from "./FeatureAnnouncementDialog";
import { UnifiedTopBar } from "./UnifiedTopBar";
import { PanelZone } from "./PanelZone";
import { PanelContext, type PreviewViewMode, type PreviewSource } from "@/hooks/usePanel";
import { ImageGenContext, useImageGenState } from "@/hooks/useImageGen";
import { BatchImageGenContext, useBatchImageGenState } from "@/hooks/useBatchImageGen";
import { SplitContext, type SplitSession } from "@/hooks/useSplit";
import { SplitChatContainer } from "./SplitChatContainer";
import { ErrorBoundary } from "./ErrorBoundary";
import { getActiveSessionIds, getSnapshot } from "@/lib/stream-session-manager";
import { useGitStatus } from "@/hooks/useGitStatus";
import { SetupCenter } from '@/components/setup/SetupCenter';
import { Toaster } from '@/components/ui/toast';
import { useNotificationPoll } from '@/hooks/useNotificationPoll';
import { useClientPlatform } from '@/hooks/useClientPlatform';
import { useGlobalSearchShortcut } from '@/hooks/useGlobalSearchShortcut';
import { GlobalSearchDialog } from './GlobalSearchDialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MagnifyingGlass, Gear } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

const SPLIT_SESSIONS_KEY = "codepilot:split-sessions";
const SPLIT_ACTIVE_COLUMN_KEY = "codepilot:split-active-column";

function loadSplitSessions(): SplitSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SPLIT_SESSIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveSplitSessions(sessions: SplitSession[]) {
  if (sessions.length >= 2) {
    localStorage.setItem(SPLIT_SESSIONS_KEY, JSON.stringify(sessions));
  } else {
    localStorage.removeItem(SPLIT_SESSIONS_KEY);
    localStorage.removeItem(SPLIT_ACTIVE_COLUMN_KEY);
  }
}

function loadActiveColumn(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SPLIT_ACTIVE_COLUMN_KEY) || "";
}

const EMPTY_SET = new Set<string>();
const CHATLIST_MIN = 180;
const CHATLIST_MAX = 300;

/**
 * Extensions that default to "rendered" view mode when a file is opened
 * via setPreviewSource / setPreviewFile. Keeping this list aligned with
 * PreviewPanel's RENDERABLE_EXTENSIONS so anything we can actually
 * render in Preview mode also lands there by default — previously .jsx
 * / .tsx fell through to Source even though Sandpack can render them,
 * which made the DiffSummary "Open preview" button surface source code
 * when the user clicked a TSX card.
 */
const RENDERED_EXTENSIONS = new Set([".md", ".mdx", ".html", ".htm", ".jsx", ".tsx", ".csv", ".tsv"]);

function defaultViewMode(filePath: string): PreviewViewMode {
  const dot = filePath.lastIndexOf(".");
  const ext = dot >= 0 ? filePath.slice(dot).toLowerCase() : "";
  return RENDERED_EXTENSIONS.has(ext) ? "rendered" : "source";
}

const LG_BREAKPOINT = 1024;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const { isWindows } = useClientPlatform();
  const [chatListOpenRaw, setChatListOpenRaw] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupInitialCard, setSetupInitialCard] = useState<'claude' | 'provider' | 'project' | undefined>();
  const [searchOpen, setSearchOpen] = useState(false);

  useGlobalSearchShortcut(() => setSearchOpen(true));

  // Poll server-side notification queue and display as toasts
  useNotificationPoll();

  // Check if setup is needed
  useEffect(() => {
    fetch('/api/setup')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && !data.completed) {
          setSetupOpen(true);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for open-setup-center events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSetupInitialCard(detail?.initialCard);
      setSetupOpen(true);
    };
    window.addEventListener('open-setup-center', handler);
    return () => window.removeEventListener('open-setup-center', handler);
  }, []);

  // Hash bridge: error messages render `[Open Settings](/settings#providers)`
  // markdown links as fallback when the frontend cannot directly dispatch the
  // open-setup-center event (e.g. rendering inside the SSE text stream). When
  // such a link is clicked the hash changes to `#providers`, and we surface
  // the SetupCenter Provider card here — EXCEPT on /settings itself, where
  // SettingsLayout owns the #providers hash for its own section routing
  // (see SettingsLayout.tsx `getSectionFromHash`). If we swallowed the hash
  // there, clicking "Add Provider" inside SetupCenter would ping-pong the
  // user back into SetupCenter instead of reaching the providers tab.
  useEffect(() => {
    const maybeOpenFromHash = () => {
      if (typeof window === 'undefined') return;
      if (window.location.pathname === '/settings') return;
      if (window.location.hash === '#providers') {
        setSetupInitialCard('provider');
        setSetupOpen(true);
        // Clear the hash so a second navigation to /#providers fires again.
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
    maybeOpenFromHash();
    window.addEventListener('hashchange', maybeOpenFromHash);
    return () => window.removeEventListener('hashchange', maybeOpenFromHash);
  }, []);

  // Listen for open-global-search events from ChatListPanel
  useEffect(() => {
    const handler = () => setSearchOpen(true);
    window.addEventListener('open-global-search', handler);
    return () => window.removeEventListener('open-global-search', handler);
  }, []);

  // Sync with viewport after hydration to avoid SSR mismatch
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setChatListOpenRaw(window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`).matches);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Panel width state with localStorage persistence
  const [chatListWidth, setChatListWidth] = useState(240);

  // Restore persisted width after hydration
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = localStorage.getItem("codepilot_chatlist_width");
    if (saved) setChatListWidth(parseInt(saved));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleChatListResize = useCallback((delta: number) => {
    setChatListWidth((w) => Math.min(CHATLIST_MAX, Math.max(CHATLIST_MIN, w + delta)));
  }, []);
  const handleChatListResizeEnd = useCallback(() => {
    setChatListWidth((w) => {
      localStorage.setItem("codepilot_chatlist_width", String(w));
      return w;
    });
  }, []);

  // Panel state — chatListOpen is no longer gated by route (sidebar always visible)
  const isChatRoute = pathname.startsWith("/chat/") || pathname === "/chat";
  const chatListOpen = chatListOpenRaw;

  const setChatListOpen = useCallback((open: boolean) => {
    setChatListOpenRaw(open);
  }, []);

  // --- New independent panel states ---
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [dashboardPanelOpen, setDashboardPanelOpen] = useState(false);
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(false);
  const [isAssistantWorkspace, setIsAssistantWorkspace] = useState(false);

  // --- Git summary (derived from polling hook, no setState needed) ---
  const [currentWorktreeLabel, setCurrentWorktreeLabel] = useState("");

  const [workingDirectory, setWorkingDirectory] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [streamingSessionId, setStreamingSessionId] = useState("");
  const [pendingApprovalSessionId, setPendingApprovalSessionId] = useState("");

  const { status: gitStatusFromHook } = useGitStatus(workingDirectory);
  const currentBranch = gitStatusFromHook?.branch ?? "";
  const gitDirtyCount = gitStatusFromHook?.changedFiles.filter(f => f.status !== 'untracked').length ?? 0;

  // --- Multi-session stream tracking (driven by stream-session-manager) ---
  const [activeStreamingSessions, setActiveStreamingSessions] = useState<Set<string>>(EMPTY_SET);
  const [pendingApprovalSessionIds, setPendingApprovalSessionIds] = useState<Set<string>>(EMPTY_SET);

  // Listen for global stream events from stream-session-manager
  useEffect(() => {
    const handler = () => {
      const activeIds = getActiveSessionIds();
      setActiveStreamingSessions(activeIds.length > 0 ? new Set(activeIds) : EMPTY_SET);

      const approvals = new Set<string>();
      for (const sid of activeIds) {
        const snap = getSnapshot(sid);
        if (snap?.pendingPermission && !snap.permissionResolved) {
          approvals.add(sid);
        }
      }
      setPendingApprovalSessionIds(approvals.size > 0 ? approvals : EMPTY_SET);
    };
    window.addEventListener('stream-session-event', handler);
    return () => window.removeEventListener('stream-session-event', handler);
  }, []);

  // --- Split-screen state ---
  const [splitSessions, setSplitSessions] = useState<SplitSession[]>(() => loadSplitSessions());
  const [activeColumnId, setActiveColumnIdRaw] = useState<string>(() => loadActiveColumn());
  const isSplitActive = splitSessions.length >= 2;
  const isChatDetailRoute = pathname.startsWith("/chat/") || isSplitActive;

  // Persist split sessions to localStorage
  useEffect(() => {
    saveSplitSessions(splitSessions);
    if (activeColumnId) {
      localStorage.setItem(SPLIT_ACTIVE_COLUMN_KEY, activeColumnId);
    }
  }, [splitSessions, activeColumnId]);

  // URL sync: when activeColumn changes, update router
  useEffect(() => {
    if (isSplitActive && activeColumnId) {
      const target = `/chat/${activeColumnId}`;
      if (pathname !== target) {
        router.replace(target);
      }
    }
  }, [isSplitActive, activeColumnId, pathname, router]);

  const setActiveColumn = useCallback((sessionId: string) => {
    setActiveColumnIdRaw(sessionId);
  }, []);

  const addToSplit = useCallback((session: SplitSession) => {
    setSplitSessions((prev) => {
      if (prev.some((s) => s.sessionId === session.sessionId)) return prev;

      if (prev.length < 2) {
        const currentSessionId = sessionId;
        if (currentSessionId && currentSessionId !== session.sessionId) {
          const currentSession: SplitSession = {
            sessionId: currentSessionId,
            title: sessionTitle || "New Conversation",
            workingDirectory: workingDirectory || "",
            projectName: "",
            mode: "code",
          };
          const hasCurrentAlready = prev.some((s) => s.sessionId === currentSessionId);
          const next = hasCurrentAlready ? [...prev, session] : [...prev, currentSession, session];
          setActiveColumnIdRaw(session.sessionId);
          return next;
        }
      }

      const next = [...prev, session];
      setActiveColumnIdRaw(session.sessionId);
      return next;
    });
  }, [sessionId, sessionTitle, workingDirectory]);

  const pendingNavigateRef = useRef<string | null>(null);

  const removeFromSplit = useCallback((removeId: string) => {
    setSplitSessions((prev) => {
      const next = prev.filter((s) => s.sessionId !== removeId);
      if (next.length <= 1) {
        if (next.length === 1) {
          pendingNavigateRef.current = next[0].sessionId;
        }
        return [];
      }
      setActiveColumnIdRaw((currentActive) =>
        currentActive === removeId ? next[0].sessionId : currentActive
      );
      return next;
    });
  }, []);

  useEffect(() => {
    if (pendingNavigateRef.current) {
      const target = pendingNavigateRef.current;
      pendingNavigateRef.current = null;
      router.replace(`/chat/${target}`);
    }
  }, [splitSessions, router]);

  const exitSplit = useCallback(() => {
    const firstSession = splitSessions[0];
    setSplitSessions([]);
    setActiveColumnIdRaw("");
    if (firstSession) {
      router.replace(`/chat/${firstSession.sessionId}`);
    }
  }, [splitSessions, router]);

  const isInSplit = useCallback((sid: string) => {
    return splitSessions.some((s) => s.sessionId === sid);
  }, [splitSessions]);

  useEffect(() => {
    const handler = () => {
      setSplitSessions((prev) => prev);
    };
    window.addEventListener("session-deleted", handler);
    return () => window.removeEventListener("session-deleted", handler);
  }, []);

  useEffect(() => {
    if (isSplitActive && !pathname.startsWith("/chat")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSplitSessions([]);
      setActiveColumnIdRaw("");
    }
  }, [pathname, isSplitActive]);

  const splitContextValue = useMemo(
    () => ({
      splitSessions,
      activeColumnId,
      isSplitActive,
      addToSplit,
      removeFromSplit,
      setActiveColumn,
      exitSplit,
      isInSplit,
    }),
    [splitSessions, activeColumnId, isSplitActive, addToSplit, removeFromSplit, setActiveColumn, exitSplit, isInSplit]
  );

  // Warn before closing window/tab while any session is streaming
  useEffect(() => {
    if (activeStreamingSessions.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [activeStreamingSessions]);

  // --- Doc Preview state ---
  // Primary state is `previewSource` (Phase 1.5). `previewFile` is a derived
  // view for legacy consumers (FileTreePanel toggle logic etc.). The adapter
  // is one-way: setPreviewFile always produces kind:'file' sources, but
  // callers can observe that an inline-* source makes previewFile appear null.
  const [previewSource, setPreviewSourceRaw] = useState<PreviewSource | null>(null);
  const [previewViewMode, setPreviewViewMode] = useState<PreviewViewMode>("source");

  const previewFile: string | null =
    previewSource?.kind === "file" ? previewSource.filePath : null;

  const setPreviewSource = useCallback((source: PreviewSource | null) => {
    setPreviewSourceRaw(source);
    if (source) {
      // File sources respect the extension-based default view mode.
      // Inline sources are always "rendered" — there's no raw path to show
      // for source view, and all inline variants are meaningful only rendered.
      if (source.kind === "file") {
        setPreviewViewMode(defaultViewMode(source.filePath));
      } else {
        setPreviewViewMode("rendered");
      }
      setPreviewOpen(true);
    } else {
      setPreviewOpen(false);
    }
  }, []);

  const setPreviewFile = useCallback(
    (path: string | null) => {
      if (path === null) {
        setPreviewSource(null);
      } else {
        setPreviewSource({ kind: "file", filePath: path });
      }
    },
    [setPreviewSource],
  );

  // Reset doc preview and panels when navigating between pages/sessions
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPreviewSourceRaw(null);
    setPreviewOpen(false);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Keep chat list state in sync when resizing across the breakpoint
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setChatListOpenRaw(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);


  // --- Skip-permissions indicator ---
  const [skipPermissionsActive, setSkipPermissionsActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const doFetch = async () => {
      try {
        const res = await fetch("/api/settings/app");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSkipPermissionsActive(data.settings?.dangerously_skip_permissions === "true");
        }
      } catch { /* ignore */ }
    };
    doFetch();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") doFetch();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", doFetch);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", doFetch);
    };
  }, []);

  // --- Update checker (native Electron + browser fallback) ---

  const panelContextValue = useMemo(
    () => ({
      fileTreeOpen,
      setFileTreeOpen,
      gitPanelOpen,
      setGitPanelOpen,
      previewOpen,
      setPreviewOpen,
      terminalOpen,
      setTerminalOpen,
      dashboardPanelOpen,
      setDashboardPanelOpen,
      assistantPanelOpen,
      setAssistantPanelOpen,
      isAssistantWorkspace,
      setIsAssistantWorkspace,
      currentBranch,
      gitDirtyCount,
      currentWorktreeLabel,
      setCurrentWorktreeLabel,
      workingDirectory,
      setWorkingDirectory,
      sessionId,
      setSessionId,
      sessionTitle,
      setSessionTitle,
      streamingSessionId,
      setStreamingSessionId,
      pendingApprovalSessionId,
      setPendingApprovalSessionId,
      activeStreamingSessions,
      pendingApprovalSessionIds,
      previewSource,
      setPreviewSource,
      previewFile,
      setPreviewFile,
      previewViewMode,
      setPreviewViewMode,
    }),
    [fileTreeOpen, gitPanelOpen, previewOpen, terminalOpen, dashboardPanelOpen, assistantPanelOpen, isAssistantWorkspace, currentBranch, gitDirtyCount, currentWorktreeLabel, workingDirectory, sessionId, sessionTitle, streamingSessionId, pendingApprovalSessionId, activeStreamingSessions, pendingApprovalSessionIds, previewSource, setPreviewSource, previewFile, setPreviewFile, previewViewMode]
  );

  const imageGenValue = useImageGenState();
  const batchImageGenValue = useBatchImageGenState();

  return (
    <PanelContext.Provider value={panelContextValue}>
        <SplitContext.Provider value={splitContextValue}>
        <ImageGenContext.Provider value={imageGenValue}>
        <BatchImageGenContext.Provider value={batchImageGenValue}>
        <TooltipProvider delayDuration={300}>
          <div className="flex h-screen flex-col overflow-hidden">
            {/* ===== TOP NAVIGATION BAR ===== */}
            <div
              className="flex h-11 shrink-0 items-center border-b border-sidebar-border/60 bg-sidebar px-3 gap-1"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
              {/* Brand */}
              <div
                className="flex items-center gap-2 shrink-0 mr-3"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" opacity="0.8"/>
                    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="text-sm font-semibold text-sidebar-foreground tracking-tight">WizAI</span>
              </div>

              {/* Main nav */}
              <nav
                className="flex items-center gap-0.5"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <NavNavItem href="/chat" label="Chats" isActive={pathname === "/chat" || pathname.startsWith("/chat/")} />
                <NavNavItem href="/skills" label="Skills" isActive={pathname.startsWith("/skills")} />
                <NavNavItem href="/mcp" label="MCP" isActive={pathname.startsWith("/mcp")} />
                <NavNavItem href="/cli-tools" label="CLI Tools" isActive={pathname.startsWith("/cli-tools")} />
                <NavNavItem href="/gallery" label="Gallery" isActive={pathname.startsWith("/gallery")} />
                <NavNavItem href="/bridge" label="Bridge" isActive={pathname.startsWith("/bridge")} />
              </nav>

              {/* Spacer */}
              <div className="flex-1" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

              {/* Right side controls */}
              <div
                className="flex items-center gap-1"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground"
                  onClick={() => setSearchOpen(true)}
                >
                  <MagnifyingGlass size={15} />
                </Button>
                <NavRailSettingsButton pathname={pathname} />
                {isWindows && <div style={{ width: 138 }} className="shrink-0" />}
              </div>
            </div>

            {/* ===== MAIN CONTENT AREA ===== */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <ErrorBoundary>
                <ChatListPanel
                  open={chatListOpen}
                  width={chatListWidth}
                />
              </ErrorBoundary>
              {chatListOpen && (
                <ResizeHandle side="left" onResize={handleChatListResize} onResizeEnd={handleChatListResizeEnd} />
              )}
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <UnifiedTopBar />
                <div className="flex flex-1 min-h-0 overflow-hidden">
                  <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    <main className="relative flex-1 overflow-hidden">
                      {isSplitActive ? (
                        <SplitChatContainer />
                      ) : (
                        <ErrorBoundary>{children}</ErrorBoundary>
                      )}
                    </main>
                  </div>
                  {isChatDetailRoute && <PanelZone />}
                </div>
              </div>
            </div>
          </div>
          <FeatureAnnouncementDialog />
          <Toaster />
          <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
          {setupOpen && (
            <SetupCenter
              onClose={() => setSetupOpen(false)}
              initialCard={setupInitialCard}
            />
          )}
        </TooltipProvider>
        </BatchImageGenContext.Provider>
        </ImageGenContext.Provider>
        </SplitContext.Provider>
      </PanelContext.Provider>
  );
}

// ===== INLINE NAV COMPONENTS =====

function NavNavItem({ href, label, isActive }: { href: string; label: string; isActive: boolean }) {
  return (
    <Link href={href}>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
          isActive
            ? "bg-primary/15 text-primary"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        {label}
      </Button>
    </Link>
  );
}

function NavRailSettingsButton({ pathname }: { pathname: string }) {
  const isSettingsActive = pathname === "/settings" || pathname.startsWith("/settings/");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className={cn(
              "h-7 w-7",
              isSettingsActive ? "text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
            )}
          >
            <Link href="/settings">
              <Gear size={15} weight={isSettingsActive ? "fill" : "regular"} />
              <span className="sr-only">Settings</span>
            </Link>
          </Button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">Settings</TooltipContent>
    </Tooltip>
  );
}
