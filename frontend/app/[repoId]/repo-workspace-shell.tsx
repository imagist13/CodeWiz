"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ReposContextInner } from "@/lib/repos-context";
import { ProjectConversationsContextInner } from "@/lib/project-conversations-context";
import { AppPreview, PreviewPlaceholder } from "@/components/preview";
import { RepoTopBar } from "./repo-top-bar";
import { CodeIcon, MonitorIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSandboxOverrides } from "@/hooks/use-sandbox-overrides";
import { useReposData } from "@/hooks/use-repos-data";
import type { RepoItem, RepoVmInfo } from "@/lib/repo-types";

type ThreadStateDetail = {
  repoId: string | null;
  isRunning: boolean;
};

type OptimisticMetadataDetail = {
  repoId: string;
  conversationId: string;
  repoName: string;
  conversationTitle: string;
};

export function RepoWorkspaceShell({
  repoId,
  children,
  selectedConversationIdOverride,
}: {
  repoId: string | null;
  children: React.ReactNode;
  selectedConversationIdOverride?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedConversationId =
    selectedConversationIdOverride ?? pathname.split("/").filter(Boolean)[1] ?? null;

  const { repos, isLoading: reposLoading, reload: loadRepos, setRepos } = useReposData();
  const sandboxOverrides = useSandboxOverrides(repos);

  const [threadIsRunning, setThreadIsRunning] = useState(false);

  const hasDeployingRepo = repos.some((repo) =>
    repo.deployments.some((deployment) => deployment.state === "deploying"),
  );

  // ─── Polling ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!threadIsRunning && !hasDeployingRepo) return;
    const interval = window.setInterval(() => {
      void loadRepos();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [loadRepos, threadIsRunning, hasDeployingRepo]);

  // ─── Repo events ────────────────────────────────────────────────────

  useEffect(() => {
    const handleReposUpdated = () => { void loadRepos(); };
    window.addEventListener("codewiz:repos-updated", handleReposUpdated);
    return () => window.removeEventListener("codewiz:repos-updated", handleReposUpdated);
  }, [loadRepos]);

  // ─── Thread state events ────────────────────────────────────────────

  useEffect(() => {
    const handleThreadState = (event: Event) => {
      const detail = (event as CustomEvent<ThreadStateDetail>).detail;
      if (!detail) return;
      if (repoId && detail.repoId && detail.repoId !== repoId) return;
      setThreadIsRunning(Boolean(detail.isRunning));
    };
    window.addEventListener("codewiz:thread-state", handleThreadState as EventListener);
    return () =>
      window.removeEventListener("codewiz:thread-state", handleThreadState as EventListener);
  }, [repoId]);

  // ─── Optimistic metadata events ─────────────────────────────────────

  useEffect(() => {
    const handleOptimisticMetadata = (event: Event) => {
      const detail = (event as CustomEvent<OptimisticMetadataDetail>).detail;
      if (!detail?.repoId || !detail?.conversationId) return;

      const now = new Date().toISOString();

      setRepos((previous) =>
        previous.map((repo) => {
          if (repo.id !== detail.repoId) return repo;

          const hasConversation = repo.conversations.some(
            (conversation) => conversation.id === detail.conversationId,
          );

          const nextConversations = hasConversation
            ? repo.conversations.map((conversation) =>
                conversation.id === detail.conversationId
                  ? { ...conversation, title: detail.conversationTitle, updated_at: now }
                  : conversation,
              )
            : [
                {
                  id: detail.conversationId,
                  title: detail.conversationTitle,
                  created_at: now,
                  updated_at: now,
                },
                ...repo.conversations,
              ];

          return {
            ...repo,
            name: repo.name === "Untitled Repo" ? detail.repoName : repo.name,
            conversations: nextConversations,
          };
        }),
      );
    };
    window.addEventListener(
      "codewiz:metadata-optimistic",
      handleOptimisticMetadata as EventListener,
    );
    return () =>
      window.removeEventListener(
        "codewiz:metadata-optimistic",
        handleOptimisticMetadata as EventListener,
      );
  }, [setRepos]);

  // ─── Navigation & actions ──────────────────────────────────────────

  const handleSelectProject = useCallback(
    (nextRepoId: string) => { router.push(`/${nextRepoId}`); },
    [router],
  );

  const onSetProductionDomain = useCallback(
    async (nextRepoId: string, domain: string) => {
      const { clientAuthHeaders } = await import("@/lib/client-auth-headers");
      const response = await fetch(`/api/repos/${nextRepoId}/production-domain`, {
        method: "POST",
        headers: clientAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ domain }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to configure production domain");
      }
      await loadRepos();
    },
    [loadRepos],
  );

  const onPromoteDeployment = useCallback(
    async (nextRepoId: string, deploymentId: string) => {
      const { clientAuthHeaders } = await import("@/lib/client-auth-headers");
      const response = await fetch(`/api/repos/${nextRepoId}/promote`, {
        method: "POST",
        headers: clientAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ deployment_id: deploymentId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to promote deployment");
      }
      await loadRepos();
    },
    [loadRepos],
  );

  // ─── Layout state ─────────────────────────────────────────────────

  const selectedRepo = repoId ? (repos.find((repo) => repo.id === repoId) ?? null) : null;
  const showWorkspacePanel = Boolean(repoId);
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");

  useEffect(() => {
    if (!repoId) setMobileView("chat");
  }, [repoId]);

  const gridColumns = (() => {
    if (!showWorkspacePanel) return "1fr 0fr";
    if (isMobile) return mobileView === "chat" ? "1fr 0fr" : "0fr 1fr";
    return "2fr 3fr";
  })();

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <ReposContextInner
      repos={repos}
      isLoading={reposLoading}
      error={null}
      refresh={loadRepos}
      onSelectProject={handleSelectProject}
    >
      <ProjectConversationsContextInner
        repoId={repoId}
        conversations={selectedRepo?.conversations ?? []}
        isLoading={false}
        error={null}
        refresh={async () => {}}
        onSelectConversation={(conversationId) => {
          if (repoId) router.push(`/${repoId}/${conversationId}`);
        }}
      >
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
          {repoId && selectedRepo && (
            <RepoTopBar
              repoId={repoId}
              selectedRepo={selectedRepo}
              selectedConversationId={selectedConversationId}
              mobileView={mobileView}
              setMobileView={setMobileView}
              sandboxOverrides={sandboxOverrides}
              iframeRef={iframeRef}
              onSetProductionDomain={onSetProductionDomain}
              onPromoteDeployment={onPromoteDeployment}
            />
          )}

          {/* Main content grid */}
          <div
            className={cn(
              "grid min-h-0 flex-1 pb-2",
              !isMobile && "transition-[grid-template-columns] duration-500 ease-in-out",
            )}
            style={isMobile ? undefined : { gridTemplateColumns: gridColumns }}
          >
            {/* Chat pane */}
            <div
              className={cn(
                "relative min-w-0 overflow-hidden",
                isMobile && mobileView === "preview" && "hidden",
              )}
            >
              {children}
            </div>

            {/* Preview pane */}
            <div
              className={cn(
                "min-w-0 overflow-hidden",
                !isMobile && "transition-opacity duration-500",
                showWorkspacePanel && (!isMobile || mobileView === "preview")
                  ? "opacity-100"
                  : !isMobile && "pointer-events-none opacity-0",
                isMobile && mobileView === "chat" && "hidden",
              )}
            >
              {showWorkspacePanel &&
                (selectedRepo?.vm?.previewUrl || sandboxOverrides[repoId ?? ""] ? (
                  <AppPreview
                    repoId={repoId}
                    metadata={
                      selectedRepo?.vm ?? sandboxOverrides[repoId ?? ""] ?? null
                    }
                    iframeRef={iframeRef}
                  />
                ) : (
                  <PreviewPlaceholder />
                ))}
            </div>
          </div>

          {/* Mobile floating toggle button */}
          {isMobile && showWorkspacePanel && (
            <button
              type="button"
              onClick={() =>
                setMobileView((v) => (v === "chat" ? "preview" : "chat"))
              }
              className="fixed right-4 bottom-20 z-50 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
              title={mobileView === "chat" ? "Show preview" : "Show chat"}
            >
              {mobileView === "chat" ? (
                <MonitorIcon className="size-5" />
              ) : (
                <CodeIcon className="size-5" />
              )}
            </button>
          )}
        </div>
      </ProjectConversationsContextInner>
    </ReposContextInner>
  );
}
