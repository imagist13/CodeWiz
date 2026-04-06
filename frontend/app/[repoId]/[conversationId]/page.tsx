"use client";

import { Assistant } from "../../assistant";
import { RepoWelcome } from "@/components/assistant-ui/repo-welcome";
import { apiClient } from "@/lib/api-client";
import { useEffect, useState } from "react";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ repoId: string; conversationId: string }>;
}) {
  const [resolvedParams, setResolvedParams] = useState<{
    repoId: string;
    conversationId: string;
  } | null>(null);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { repoId, conversationId } = await params;
      setResolvedParams({ repoId, conversationId });

      if (!apiClient.isAuthenticated()) {
        setLoading(false);
        return;
      }

      try {
        const conversation = await apiClient.getConversation(repoId, conversationId);
        setInitialMessages(conversation.messages ?? []);
      } catch {
        // If we can't fetch messages, start with empty
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  if (loading || !resolvedParams) {
    return (
      <Assistant
        initialMessages={[]}
        selectedRepoId={null}
        selectedConversationId={null}
        welcome={<RepoWelcome />}
      />
    );
  }

  return (
    <Assistant
      initialMessages={initialMessages}
      selectedRepoId={resolvedParams.repoId}
      selectedConversationId={resolvedParams.conversationId}
      welcome={<RepoWelcome />}
    />
  );
}
