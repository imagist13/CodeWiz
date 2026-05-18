"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Assistant } from "./assistant";
import { HomeWelcome } from "@/components/assistant-ui/home-welcome";

/**
 * Home workspace — renders the Assistant at the home (/) route.
 *
 * `RepoWorkspaceShell` is rendered by `WorkspaceFrame` in layout.tsx,
 * so this component only needs to mount the Assistant with the
 * correct repo/conversation context derived from the URL.
 */
export function HomeWorkspace() {
  const pathname = usePathname();
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (pathname !== "/") return;

    const handleActiveConversation = (event: Event) => {
      const { repoId, conversationId } = (event as CustomEvent<{ repoId: string; conversationId: string }>).detail ?? {};
      if (repoId) setActiveRepoId(repoId);
      if (conversationId) setActiveConversationId(conversationId);
    };
    const handleGoHome = () => {
      setActiveRepoId(null);
      setActiveConversationId(null);
    };

    window.addEventListener("codewiz:active-conversation", handleActiveConversation as EventListener);
    window.addEventListener("codewiz:go-home", handleGoHome);
    return () => {
      window.removeEventListener("codewiz:active-conversation", handleActiveConversation as EventListener);
      window.removeEventListener("codewiz:go-home", handleGoHome);
    };
  }, [pathname]);

  return (
    <Assistant
      selectedRepoId={activeRepoId}
      selectedConversationId={activeConversationId}
      onActiveConversationChange={(repoId, conversationId) => {
        setActiveRepoId(repoId);
        setActiveConversationId(conversationId);
      }}
      welcome={<HomeWelcome />}
    />
  );
}
