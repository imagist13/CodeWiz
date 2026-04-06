"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { RepoConversation } from "./repo-types";

type ProjectConversationsContextValue = {
  repoId: string | null;
  conversations: RepoConversation[];
  isLoading: boolean;
  error: string | null;
  refresh: (repoId: string) => Promise<void>;
  onSelectConversation: (conversationId: string) => void;
};

const ProjectConversationsContext =
  createContext<ProjectConversationsContextValue>({
    repoId: null,
    conversations: [],
    isLoading: false,
    error: null,
    refresh: async () => {},
    onSelectConversation: () => {},
  });

export const ProjectConversationsProvider =
  ProjectConversationsContext.Provider;

export const useProjectConversations = () =>
  useContext(ProjectConversationsContext);

export function ProjectConversationsContextInner({
  children,
  repoId,
  conversations,
  isLoading,
  error,
  refresh,
  onSelectConversation,
}: {
  children: ReactNode;
  repoId: string | null;
  conversations: RepoConversation[];
  isLoading: boolean;
  error: string | null;
  refresh: (repoId: string) => Promise<void>;
  onSelectConversation: (conversationId: string) => void;
}) {
  return (
    <ProjectConversationsContext.Provider
      value={{
        repoId,
        conversations,
        isLoading,
        error,
        refresh,
        onSelectConversation,
      }}
    >
      {children}
    </ProjectConversationsContext.Provider>
  );
}
