"use client";

import { useCallback, useEffect, useState } from "react";
import { clientAuthHeaders } from "@/lib/client-auth-headers";
import type { RepoItem } from "@/lib/repo-types";

type RawRepoResponse = {
  id: string;
  name?: string;
  conversations?: RepoItem["conversations"];
  metadata?: {
    vm?: RepoItem["vm"];
    deployments?: RepoItem["deployments"];
    productionDomain?: string | null;
    productionDeploymentId?: string | null;
  };
};

export function useReposData() {
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRepos = useCallback(async () => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("codewiz_token") : null;
    if (!token) {
      setIsLoading(false);
      return;
    }

    const response = await fetch("/api/repos", {
      cache: "no-store",
      headers: clientAuthHeaders(),
    });
    if (!response.ok) {
      setIsLoading(false);
      return;
    }

    const data = await response.json();
    const nextRepos: RepoItem[] = Array.isArray(data.repositories)
      ? (data.repositories as RawRepoResponse[]).map((repo) => ({
          id: repo.id,
          name: repo.name ?? "Untitled Repo",
          vm: repo.metadata?.vm ?? null,
          conversations: repo.conversations ?? [],
          deployments: repo.metadata?.deployments ?? [],
          productionDomain:
            typeof repo.metadata?.productionDomain === "string"
              ? repo.metadata.productionDomain
              : null,
          productionDeploymentId:
            typeof repo.metadata?.productionDeploymentId === "string"
              ? repo.metadata.productionDeploymentId
              : null,
        }))
      : [];

    setRepos(nextRepos);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  return { repos, isLoading, reload: loadRepos, setRepos };
}
