"use client";

import { use, useEffect, useState } from "react";
import { Assistant, convertBackendMessagesToUIMessages } from "../../assistant";
import { RepoWelcome } from "@/components/assistant-ui/repo-welcome";
import { apiClient } from "@/lib/api-client";
import { clientAuthHeaders } from "@/lib/client-auth-headers";
import {
  getCachedMessages,
  getCachedMessagesSync,
  setCachedMessages,
} from "@/lib/idb-message-cache";

interface Props {
  params: Promise<{ repoId: string; conversationId: string }>;
}

type GoMessage = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls?: unknown;
  created_at?: string;
};

export function ConversationPageContent({ params }: Props) {
  const { repoId, conversationId } = use(params);

  // Use sync localStorage fallback for instant first paint
  const [initialMessages, setInitialMessages] = useState<any[]>(() =>
    getCachedMessagesSync(conversationId) ?? [],
  );

  useEffect(() => {
    console.log("[ConvPage] Mount — conversationId:", conversationId);

    void (async () => {
      if (!apiClient.isAuthenticated()) {
        window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      // 1. Read from IndexedDB (async)
      const idbCached = await getCachedMessages(conversationId);
      console.log("[ConvPage] IndexedDB:", idbCached?.length ?? 0, "messages");

      // 2. Read from localStorage fallback
      const lsCached = getCachedMessagesSync(conversationId);
      console.log("[ConvPage] localStorage:", lsCached?.length ?? 0, "messages");

      const cached = idbCached ?? lsCached;
      if (cached && cached.length > 0) {
        console.log("[ConvPage] Using cache — showing", cached.length, "messages");
        setInitialMessages(cached);
      }

      // 3. Fetch from Go backend directly (not through apiClient to avoid double-unwrap)
      try {
        const headers = clientAuthHeaders({ "Content-Type": "application/json" });
        const res = await fetch(
          `/api/repos/${repoId}/conversations/${conversationId}`,
          { headers },
        );

        if (!res.ok) {
          console.error("[ConvPage] API error:", res.status);
          return;
        }

        const json = await res.json();
        console.log("[ConvPage] API raw response:", JSON.stringify(json).slice(0, 500));

        // Extract messages from Go response — handle Go's standard {code, data: {...}} wrapper
        // unwrap() only strips one layer, so {code, data: {conversations}} needs manual extraction
        let messages: GoMessage[] = [];

        if (json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
          const d = json.data as Record<string, unknown>;
          // {data: {conversations: [{id, messages: [...]}]}} from list endpoint
          if (Array.isArray(d.conversations)) {
            const convs = d.conversations as Array<{ id: string; messages?: GoMessage[] }>;
            const found = convs.find((c) => c.id === conversationId);
            if (found?.messages) messages = found.messages;
          }
          // {data: {messages: [...]}} from single endpoint
          else if (Array.isArray(d.messages)) {
            messages = d.messages as GoMessage[];
          }
        }
        // Go sometimes returns {conversations: [...]} without the data wrapper
        else if (Array.isArray(json.conversations)) {
          const convs = json.conversations as Array<{ id: string; messages?: GoMessage[] }>;
          const found = convs.find((c) => c.id === conversationId);
          if (found?.messages) messages = found.messages;
        }
        // Flat messages list
        else if (Array.isArray(json.messages)) {
          messages = json.messages as GoMessage[];
        }

        console.log("[ConvPage] Extracted", messages.length, "messages from API");

        if (messages.length > 0) {
          await setCachedMessages(conversationId, messages);
          setInitialMessages(messages);
        } else if (!cached || cached.length === 0) {
          console.warn("[ConvPage] No messages from API and no cache — WILL BE EMPTY ON REFRESH");
        }
      } catch (err) {
        console.error("[ConvPage] API fetch failed:", err);
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
