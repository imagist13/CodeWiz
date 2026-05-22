"use client";

import { AssistantRuntimeProvider, useAuiState } from "@assistant-ui/react";
import { useAISDKRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { useChat } from "@ai-sdk/react";
import { type UIMessage } from "ai";
import { Thread } from "@/components/assistant-ui/thread";
import { clientAuthHeaders } from "@/lib/client-auth-headers";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  useCreateFromGithub,
  useGoHome,
  useGoToRepo,
  useThreadStateSync,
  type ThreadState,
} from "@/hooks/use-app-events";
import {
  setCachedMessages,
  type CachedMessage,
} from "@/lib/message-cache";

const EMPTY_MESSAGES: UIMessage[] = [];

const extractUserPrompt = (messages: UIMessage[]): string | null => {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return null;

  const textPart = firstUserMessage.parts?.find((part) => part.type === "text");
  if (!textPart || !("text" in textPart)) return null;

  const clean = textPart.text.trim().replace(/\s+/g, " ");
  return clean || null;
};

export function convertBackendMessagesToUIMessages(messages: any[]): UIMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((m): UIMessage => {
    const role = m.role as string;
    return {
      id: m.id ?? crypto.randomUUID(),
      role: role === "assistant" ? "assistant" : "user",
      parts: [
        {
          type: "text",
          text: (m.content as string) ?? "",
        },
      ],
    };
  });
}

function uiMessagesToCache(messages: UIMessage[]): CachedMessage[] {
  return messages.map((m) => {
    const textPart = m.parts?.find((p) => p.type === "text");
    return {
      id: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: textPart && "text" in textPart ? textPart.text : "",
    };
  });
}

export const Assistant = ({
  initialMessages,
  selectedRepoId = null,
  selectedConversationId = null,
  onThreadStateChange,
  onActiveConversationChange,
  welcome,
}: {
  initialMessages?: UIMessage[];
  selectedRepoId?: string | null;
  selectedConversationId?: string | null;
  onThreadStateChange?: (next: ThreadState) => void;
  onActiveConversationChange?: (repoId: string, conversationId: string) => void;
  welcome?: ReactNode;
}) => {
  const resolvedInitialMessages = initialMessages ?? EMPTY_MESSAGES;

  const [seedMessages, setSeedMessages] = useState<UIMessage[]>(resolvedInitialMessages);
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const lastMessagesLengthRef = useRef(0);
  const messagesRef = useRef<UIMessage[]>([]);
  const prevMessagesLenRef = useRef(0);
  const [localRepoId, setLocalRepoId] = useState<string | null>(selectedRepoId);
  const [localConversationId, setLocalConversationId] = useState<string | null>(selectedConversationId);

  const activeRepoIdRef = useRef<string | null>(selectedRepoId);
  const activeConversationIdRef = useRef<string | null>(selectedConversationId);
  const onActiveConversationChangeRef = useRef(onActiveConversationChange);
  const chatSessionIdRef = useRef(
    selectedConversationId
      ? `conversation:${selectedConversationId}`
      : selectedRepoId
        ? `repo:${selectedRepoId}:draft`
        : "home:draft",
  );

  useEffect(() => {
    const converted = convertBackendMessagesToUIMessages(resolvedInitialMessages);
    if (converted.length > lastMessagesLengthRef.current || converted.length > 0) {
      setSeedMessages(converted);
      lastMessagesLengthRef.current = converted.length;
      setRuntimeVersion((v) => v + 1);
    }
  }, [resolvedInitialMessages]);

  useEffect(() => {
    setLocalRepoId((previous) => selectedRepoId ?? previous);
    setLocalConversationId((previous) => selectedConversationId ?? previous);
  }, [selectedConversationId, selectedRepoId]);

  useEffect(() => {
    if (selectedRepoId) activeRepoIdRef.current = selectedRepoId;
    if (selectedConversationId) {
      if (activeConversationIdRef.current !== selectedConversationId) {
        // Conversation changed — reset length tracking so cache write fires immediately
        prevMessagesLenRef.current = 0;
      }
      activeConversationIdRef.current = selectedConversationId;
    }
  }, [selectedConversationId, selectedRepoId]);

  useEffect(() => {
    onActiveConversationChangeRef.current = onActiveConversationChange;
  }, [onActiveConversationChange]);

  // ─── Navigation hooks ────────────────────────────────────────────────

  useGoHome(() => {
    setSeedMessages(EMPTY_MESSAGES);
    lastMessagesLengthRef.current = 0;
    setLocalRepoId(null);
    setLocalConversationId(null);
    activeRepoIdRef.current = null;
    activeConversationIdRef.current = null;
    chatSessionIdRef.current = `home:draft:${Date.now()}`;
    setRuntimeVersion((v) => v + 1);
  });

  useGoToRepo((repoId) => {
    setSeedMessages(EMPTY_MESSAGES);
    lastMessagesLengthRef.current = 0;
    setLocalRepoId(repoId);
    setLocalConversationId(null);
    activeRepoIdRef.current = repoId;
    activeConversationIdRef.current = null;
    chatSessionIdRef.current = `repo:${repoId}:draft:${Date.now()}`;
    setRuntimeVersion((v) => v + 1);
  });

  useCreateFromGithub((repoId, conversationId) => {
    const nextPath = `/${repoId}/${conversationId}`;
    window.history.replaceState(window.history.state, "", nextPath);
    setSeedMessages(EMPTY_MESSAGES);
    lastMessagesLengthRef.current = 0;
    setLocalRepoId(repoId);
    setLocalConversationId(conversationId);
    activeRepoIdRef.current = repoId;
    activeConversationIdRef.current = conversationId;
    chatSessionIdRef.current = `conversation:${conversationId}`;
    setRuntimeVersion((v) => v + 1);
    onActiveConversationChangeRef.current?.(repoId, conversationId);
    window.dispatchEvent(
      new CustomEvent("codewiz:active-conversation", {
        detail: { repoId, conversationId },
      }),
    );
    window.dispatchEvent(new Event("codewiz:repos-updated"));
  });

  // ─── Conversation management ────────────────────────────────────────

  const ensureActiveConversation = useCallback(
    async (requestedRepoName?: string, requestedConversationTitle?: string) => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("codewiz_token")
          : null;
      if (!token) {
        window.location.href = "/auth/login";
        throw new Error("Not authenticated");
      }

      const activeRepoId = activeRepoIdRef.current;
      const activeConversationId = activeConversationIdRef.current;

      if (activeRepoId && activeConversationId) {
        return { repoId: activeRepoId, conversationId: activeConversationId };
      }

      if (activeRepoId) {
        const response = await fetch(
          `/api/repos/${activeRepoId}/conversations`,
          {
            method: "POST",
            headers: clientAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(
              requestedConversationTitle ? { title: requestedConversationTitle } : {},
            ),
          },
        );
        if (!response.ok) throw new Error("Failed to create a conversation for the selected repo.");

        const data = (await response.json()) as { conversationId?: string };
        const conversationId = data.conversationId;
        if (!conversationId) throw new Error("Conversation creation did not return an id.");

        const nextPath = `/${activeRepoId}/${conversationId}`;
        window.history.replaceState(window.history.state, "", nextPath);
        setLocalConversationId(conversationId);
        activeConversationIdRef.current = conversationId;
        onActiveConversationChangeRef.current?.(activeRepoId, conversationId);
        window.dispatchEvent(
          new CustomEvent("codewiz:active-conversation", {
            detail: { repoId: activeRepoId, conversationId },
          }),
        );
        return { repoId: activeRepoId, conversationId };
      }

      const response = await fetch("/api/repos", {
        method: "POST",
        headers: clientAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(
          requestedRepoName || requestedConversationTitle
            ? {
                ...(requestedRepoName ? { name: requestedRepoName } : {}),
                ...(requestedConversationTitle
                  ? { conversationTitle: requestedConversationTitle }
                  : {}),
              }
            : {},
        ),
      });
      if (!response.ok) throw new Error("Failed to create a repository for this chat.");

      const data = (await response.json()) as { id?: string; conversationId?: string };
      const repoId = data.id;
      const conversationId = data.conversationId;
      if (!repoId || !conversationId) throw new Error("Repository creation did not return ids.");

      const nextPath = `/${repoId}/${conversationId}`;
      window.history.replaceState(window.history.state, "", nextPath);
      setLocalRepoId(repoId);
      setLocalConversationId(conversationId);
      activeRepoIdRef.current = repoId;
      activeConversationIdRef.current = conversationId;
      onActiveConversationChangeRef.current?.(repoId, conversationId);
      window.dispatchEvent(
        new CustomEvent("codewiz:active-conversation", {
          detail: { repoId, conversationId },
        }),
      );
      return { repoId, conversationId };
    },
    [],
  );

  // ─── Thread state sync ─────────────────────────────────────────────

  const handleThreadStateChange = useCallback(
    (state: ThreadState) => {
      onThreadStateChange?.(state);
    },
    [onThreadStateChange],
  );

  const { dispatch: dispatchThreadState } = useThreadStateSync(
    handleThreadStateChange,
  );

  const handleChatFinish = useCallback(() => {
    const repoId = activeRepoIdRef.current;
    if (!repoId) return;
    window.dispatchEvent(
      new CustomEvent("codewiz:repos-updated", { detail: { repoId } }),
    );
  }, []);

  // ─── Chat setup ────────────────────────────────────────────────────

  const runtimeKey = `${chatSessionIdRef.current}:${runtimeVersion}`;

  const chat = useChat<UIMessage>({
    id: runtimeKey,
    transport: new AssistantChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: async (options) => {
        const prompt = extractUserPrompt(options.messages);
        const repoName = prompt ? prompt.slice(0, 50) : undefined;
        const conversationTitle = prompt ? prompt.slice(0, 60) : undefined;
        const active = await ensureActiveConversation(repoName, conversationTitle);

        if (prompt) {
          window.dispatchEvent(
            new CustomEvent("codewiz:metadata-optimistic", {
              detail: {
                repoId: active.repoId,
                conversationId: active.conversationId,
                repoName,
                conversationTitle,
              },
            }),
          );
        }

        return {
          headers: clientAuthHeaders(
            options.headers as Record<string, string> | undefined,
          ),
          body: {
            ...options.body,
            messages: options.messages,
            metadata: options.requestMetadata,
            id: undefined,
            trigger: "submit-message",
            messageId: undefined,
            repoId: active.repoId,
            conversationId: active.conversationId,
          },
        };
      },
    }),
    messages: seedMessages,
    onFinish: handleChatFinish,
  });

  // Keep messagesRef in sync with chat messages so callbacks always read fresh state
  useEffect(() => {
    messagesRef.current = chat.messages as UIMessage[];
  });

  // Write to localStorage cache whenever a new message arrives (streaming or complete).
  // This is more reliable than onFinish which only fires if SSE completes fully.
  useEffect(() => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const msgs = chat.messages as UIMessage[];
    if (msgs.length > prevMessagesLenRef.current) {
      setCachedMessages(conversationId, uiMessagesToCache(msgs));
      prevMessagesLenRef.current = msgs.length;
    }
  });

  const runtime = useAISDKRuntime(chat);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <AssistantRuntimeProvider key={runtimeKey} runtime={runtime}>
      <ThreadStateDispatcher
        onDispatch={(state) =>
          dispatchThreadState(state, activeRepoIdRef.current)
        }
      />
      <Thread welcome={welcome} />
    </AssistantRuntimeProvider>
  );
};

/**
 * Reads assistant-ui thread state and dispatches it to both the parent callback
 * and the global event bus.
 */
function ThreadStateDispatcher({
  onDispatch,
}: {
  onDispatch: (state: ThreadState) => void;
}) {
  const isEmpty = useAuiState(({ thread }) => thread.isEmpty);
  const isRunning = useAuiState(({ thread }) => thread.isRunning);

  useEffect(() => {
    onDispatch({ isEmpty, isRunning });
  }, [isEmpty, isRunning, onDispatch]);

  return null;
}
