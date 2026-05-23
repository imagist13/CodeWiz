"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { RepoItem } from "@/lib/repo-types";
import { BrowserControls } from "@/components/preview/browser-controls";
import { PublishDialog } from "@/components/assistant-ui/publish-dialog";
import { ChevronLeftIcon, LogOutIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth-context";

type RepoTopBarProps = {
  repoId: string;
  selectedRepo: RepoItem;
  selectedConversationId: string | null;
  mobileView: "chat" | "preview";
  setMobileView: (view: "chat" | "preview") => void;
  sandboxOverrides: Record<string, { previewUrl: string; devCommandTerminalUrl: string }>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onSetProductionDomain: (repoId: string, domain: string) => Promise<void>;
  onPromoteDeployment: (repoId: string, deploymentId: string) => Promise<void>;
};

export function RepoTopBar({
  repoId,
  selectedRepo,
  selectedConversationId,
  mobileView,
  setMobileView,
  sandboxOverrides,
  iframeRef,
  onSetProductionDomain,
  onPromoteDeployment,
}: RepoTopBarProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { logout } = useAuth();

  const previewUrl =
    selectedRepo.vm?.previewUrl ??
    sandboxOverrides[repoId]?.previewUrl ??
    "";

  return (
    <div
      className={cn(
        "shrink-0 border-b bg-background",
        isMobile ? "flex h-11 items-center" : "flex h-11 items-center justify-between px-3",
      )}
    >
      {/* Left: back to home */}
      {(!isMobile || mobileView === "chat") && (
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event("codewiz:go-home"));
              router.push("/");
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="返回首页"
          >
            <ChevronLeftIcon className="size-3.5" />
            <span className="text-sm font-medium">返回</span>
          </button>
        </div>
      )}

      {/* Mobile preview top bar */}
      {isMobile && mobileView === "preview" && (
        <div className="flex flex-1 items-center gap-1 px-2">
          <button
            type="button"
            onClick={() => setMobileView("chat")}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronLeftIcon className="size-3.5" />
            <span className="text-sm font-medium">Chat</span>
          </button>
          <div className="ml-auto">
            {selectedRepo.vm?.previewUrl && (
              <PublishDialog
                repo={selectedRepo}
                onSetProductionDomain={onSetProductionDomain}
                onPromoteDeployment={onPromoteDeployment}
              />
            )}
          </div>
        </div>
      )}

      {/* Right: browser controls + logout */}
      {!isMobile && (
        <div className="flex items-center gap-1">
          {(selectedRepo.vm?.previewUrl || sandboxOverrides[repoId]) && (
            <BrowserControls
              repoId={repoId}
              previewUrl={previewUrl}
              iframeRef={iframeRef}
              repo={selectedRepo}
              onSetProductionDomain={onSetProductionDomain}
              onPromoteDeployment={onPromoteDeployment}
            />
          )}
          <button
            type="button"
            onClick={() => { void logout(); }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="登出"
          >
            <LogOutIcon className="size-3.5" />
            <span className="text-sm font-medium">登出</span>
          </button>
        </div>
      )}
    </div>
  );
}
