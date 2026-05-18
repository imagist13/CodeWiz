"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RepoWorkspaceShell } from "./[repoId]/repo-workspace-shell";

type ActiveConversationDetail = {
  repoId: string;
  conversationId: string;
};

/**
 * Top-level layout coordinator.
 *
 * Responsibilities:
 * 1. Parse URL → repoId / conversationId
 * 2. Handle in-app navigation events from child components
 * 3. Render the shared workspace shell with the correct repo context
 *
 * All child components communicate upward purely through named events
 * (`codewiz:go-home`, `codewiz:go-to-repo`, `codewiz:active-conversation`).
 */
export function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pathParts = useMemo(() => pathname.split("/").filter(Boolean), [pathname]);

  const routeRepoId = pathParts[0] ?? null;
  const routeConversationId = pathParts[1] ?? null;

  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const previousPathnameRef = useRef(pathname);

  // Sync state from URL changes
  useEffect(() => {
    if (routeRepoId) {
      setActiveRepoId(routeRepoId);
      setActiveConversationId(routeConversationId);
    }
  }, [routeConversationId, routeRepoId]);

  // Reset to home when navigating to root
  useEffect(() => {
    const prev = previousPathnameRef.current;
    if (pathname === "/" && prev !== "/") {
      setActiveRepoId(null);
      setActiveConversationId(null);
    }
    previousPathnameRef.current = pathname;
  }, [pathname]);

  // Respond to `active-conversation` events from the assistant
  useEffect(() => {
    const handler = (event: Event) => {
      const { repoId, conversationId } = (event as CustomEvent<ActiveConversationDetail>).detail ?? {};
      if (!repoId || !conversationId) return;
      setActiveRepoId(repoId);
      setActiveConversationId(conversationId);
    };
    window.addEventListener("codewiz:active-conversation", handler as EventListener);
    return () => window.removeEventListener("codewiz:active-conversation", handler as EventListener);
  }, []);

  // Respond to `go-home` events from any child component
  useEffect(() => {
    const handler = () => {
      setActiveRepoId(null);
      setActiveConversationId(null);
    };
    window.addEventListener("codewiz:go-home", handler);
    return () => window.removeEventListener("codewiz:go-home", handler);
  }, []);

  // Respond to `go-to-repo` events from any child component
  useEffect(() => {
    const handler = (event: Event) => {
      const { repoId } = (event as CustomEvent<{ repoId: string }>).detail ?? {};
      if (!repoId) return;
      setActiveRepoId(repoId);
      setActiveConversationId(null);
    };
    window.addEventListener("codewiz:go-to-repo", handler as EventListener);
    return () => window.removeEventListener("codewiz:go-to-repo", handler as EventListener);
  }, []);

  const effectiveRepoId = routeRepoId ?? activeRepoId;
  const effectiveConversationId = routeConversationId ?? activeConversationId;

  return (
    <RepoWorkspaceShell
      repoId={effectiveRepoId}
      selectedConversationIdOverride={effectiveConversationId}
    >
      {children}
    </RepoWorkspaceShell>
  );
}
