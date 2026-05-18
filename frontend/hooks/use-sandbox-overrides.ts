"use client";

import { useCallback, useEffect, useState } from "react";
import { clientAuthHeaders } from "@/lib/client-auth-headers";

type SandboxOverride = { previewUrl: string; devCommandTerminalUrl: string };

function sandboxPreviewBase(repoId: string) {
  return `/api/sandbox-preview/${repoId}`;
}

function sandboxTerminalBase(repoId: string) {
  return `/api/sandbox-terminal/${repoId}`;
}

type RepoItem = {
  id: string;
  name: string;
  vm?: { previewUrl?: string } | null;
  deployments: { state: string }[];
  conversations: { id: string }[];
};

/**
 * Polls sandbox status for repos that don't yet have a vm assigned,
 * then populates `sandboxOverrides` with preview + terminal proxy URLs.
 */
export function useSandboxOverrides(repos: RepoItem[]) {
  const [sandboxOverrides, setSandboxOverrides] = useState<
    Record<string, SandboxOverride>
  >({});

  useEffect(() => {
    const reposWithoutVm = repos.filter((r) => !r.vm?.previewUrl);
    if (!reposWithoutVm.length) return;

    const controller = new AbortController();
    void (async () => {
      const results: Record<string, SandboxOverride> = {};
      await Promise.all(
        reposWithoutVm.map(async (repo) => {
          try {
            const res = await fetch(`/api/sandbox-status/${repo.id}`, {
              signal: controller.signal,
              cache: "no-store",
            });
            if (res.ok) {
              const data = await res.json();
              if (data.is_running) {
                results[repo.id] = {
                  previewUrl: data.proxy_url ?? sandboxPreviewBase(repo.id),
                  devCommandTerminalUrl: sandboxTerminalBase(repo.id),
                };
              }
            }
          } catch {
            // ignore aborted / network errors
          }
        }),
      );
      if (Object.keys(results).length > 0) {
        setSandboxOverrides((prev) => ({ ...prev, ...results }));
      }
    })();
    return () => controller.abort();
  }, [repos]);

  return sandboxOverrides;
}
