"use client";

import { use, useEffect, useState } from "react";
import { Assistant, convertBackendMessagesToUIMessages } from "../../assistant";
import { RepoWelcome } from "@/components/assistant-ui/repo-welcome";
import { apiClient } from "@/lib/api-client";
import {
  getCachedMessages,
  setCachedMessages,
} from "@/lib/message-cache";

interface Props {
  params: Promise<{ repoId: string; conversationId: string }>;
}

export function ConversationPageContent({ params }: Props) {
  const { repoId, conversationId } = use(params);

  const [initialMessages, setInitialMessages] = useState<any[]>([]);

  useEffect(() => {
    void (async () => {
      // Auth check
      if (!apiClient.isAuthenticated()) {
        window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      // Try cache first (instant)
      const cached = getCachedMessages(conversationId);
      if (cached) setInitialMessages(cached);

      // Always refresh from server
      try {
        const conversation = await apiClient.getConversation(repoId, conversationId);
        const msgs = conversation.messages ?? [];
        setCachedMessages(conversationId, msgs);
        setInitialMessages(msgs);
      } catch (err) {
        console.error("[ConversationPage] Failed to load messages:", err);
      }
    })();
  }, [repoId, conversationId]);

  return (
    <Assistant
      initialMessages={convertBackendMessagesToUIMessages(initialMessages)}
      selectedRepoId={repoId}
      selectedConversationId={conversationId}
      welcome={<RepoWelcome />}
    />
  );
}
