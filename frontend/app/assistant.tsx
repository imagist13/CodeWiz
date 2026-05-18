"use client";

import { AssistantRuntimeProvider, useAuiState } from "@assistant-ui/react";
import { useAISDKRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { useChat } from "@ai-sdk/react";
import { type UIMessage } from "ai";
import { Thread } from "@/components/assistant-ui/thread";
import { clientAuthHeaders } from "@/lib/client-auth-headers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  useCreateFromGithub,
  useGoHome,
  useGoToRepo,
  useThreadStateSync,
  type ThreadState,
} from "@/hooks/use-app-events";

const EMPTY_MESSAGES: UIMessage[] = [];

const extractUserPrompt = (messages: UIMessage[]): string | null => {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return null;

  const textPart = firstUserMessage.parts?.find((part) => part.type === "text");
  if (!textPart || !("text" in textPart)) return null;

  const clean = textPart.text.trim().replace(/\s+/g, " ");
  return clean || null;
};

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
  const [localRepoId, setLocalRepoId] = useState<string | null>(selectedRepoId);
  const [localConversationId, setLocalConversationId] = useState<string | null>(
    selectedConversationId,
  );

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
    setSeedMessages(resolvedInitialMessages);
  }, [resolvedInitialMessages]);

  useEffect(() => {
    setLocalRepoId((previous) => selectedRepoId ?? previous);
    setLocalConversationId((previous) => selectedConversationId ?? previous);
  }, [selectedConversationId, selectedRepoId]);

  useEffect(() => {
    if (selectedRepoId) activeRepoIdRef.current = selectedRepoId;
    if (selectedConversationId) activeConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId, selectedRepoId]);

  useEffect(() => {
    onActiveConversationChangeRef.current = onActiveConversationChange;
  }, [onActiveConversationChange]);

  // ─── Navigation hooks ────────────────────────────────────────────────

  useGoHome(() => {
    setSeedMessages(EMPTY_MESSAGES);
    setLocalRepoId(null);
    setLocalConversationId(null);
    activeRepoIdRef.current = null;
    activeConversationIdRef.current = null;
    chatSessionIdRef.current = `home:draft:${Date.now()}`;
    setRuntimeVersion((v) => v + 1);
  });

  useGoToRepo((repoId) => {
    setSeedMessages(EMPTY_MESSAGES);
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
