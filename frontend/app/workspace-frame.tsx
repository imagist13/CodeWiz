"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RepoWorkspaceShell } from "./[repoId]/repo-workspace-shell";

type ActiveConversationDetail = {
  repoId: string;
  conversationId: string;
};

export function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pathParts = useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname],
  );

  const routeRepoId = pathParts[0] ?? null;
  const routeConversationId = pathParts[1] ?? null;

  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (routeRepoId) {
      setActiveRepoId(routeRepoId);
      setActiveConversationId(routeConversationId);
    }
  }, [routeConversationId, routeRepoId]);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    if (pathname === "/" && previousPathname !== "/") {
      setActiveRepoId(null);
      setActiveConversationId(null);
    }
    previousPathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const handleActiveConversation = (event: Event) => {
      const customEvent = event as CustomEvent<ActiveConversationDetail>;
      const detail = customEvent.detail;
      if (!detail?.repoId || !detail?.conversationId) {
        return;
      }

      setActiveRepoId(detail.repoId);
      setActiveConversationId(detail.conversationId);
    };

    window.addEventListener(
      "adorable:active-conversation",
      handleActiveConversation as EventListener,
    );

    return () => {
      window.removeEventListener(
        "adorable:active-conversation",
        handleActiveConversation as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    const handleGoHome = () => {
      setActiveRepoId(null);
      setActiveConversationId(null);
    };

    window.addEventListener("adorable:go-home", handleGoHome);
    return () => {
      window.removeEventListener("adorable:go-home", handleGoHome);
    };
  }, []);

  useEffect(() => {
    const handleGoToRepo = (event: Event) => {
      const customEvent = event as CustomEvent<{ repoId: string }>;
      const detail = customEvent.detail;
      if (!detail?.repoId) return;
      setActiveRepoId(detail.repoId);
      setActiveConversationId(null);
    };

    window.addEventListener(
      "adorable:go-to-repo",
      handleGoToRepo as EventListener,
    );
    return () => {
      window.removeEventListener(
        "adorable:go-to-repo",
        handleGoToRepo as EventListener,
      );
    };
  }, []);

  const effectiveRepoId = routeRepoId ?? activeRepoId;
  const effectiveConversationId = routeConversationId ?? activeConversationId;

  return (
    <RepoWorkspaceShell
      repoId={effectiveRepoId}
      selectedConversationIdOverride={effectiveConversationId}
    >
      {children}
      {/* Settings button */}
    </RepoWorkspaceShell>
  );
}
