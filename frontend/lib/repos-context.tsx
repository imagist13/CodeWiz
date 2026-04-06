"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { RepoItem } from "./repo-types";

type ReposContextValue = {
  repos: RepoItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  onSelectProject: (repoId: string) => void;
};

const ReposContext = createContext<ReposContextValue>({
  repos: [],
  isLoading: true,
  error: null,
  refresh: async () => {},
  onSelectProject: () => {},
});

export const ReposProvider = ReposContext.Provider;

export const useRepos = () => useContext(ReposContext);

export function ReposContextInner({
  children,
  repos,
  isLoading,
  error,
  refresh,
  onSelectProject,
}: {
  children: ReactNode;
  repos: RepoItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  onSelectProject: (repoId: string) => void;
}) {
  return (
    <ReposContext.Provider
      value={{ repos, isLoading, error, refresh, onSelectProject }}
    >
      {children}
    </ReposContext.Provider>
  );
}
