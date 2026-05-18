"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clientAuthHeaders } from "@/lib/client-auth-headers";

/* ------------------------------------------------------------------ */
/*  useGoHome — resets chat state and returns to home                    */
/* ------------------------------------------------------------------ */

export function useGoHome(onReset: () => void) {
  const onResetRef = useRef(onReset);
  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  useEffect(() => {
    const handleGoHome = () => {
      onResetRef.current();
    };
    window.addEventListener("codewiz:go-home", handleGoHome);
    return () => window.removeEventListener("codewiz:go-home", handleGoHome);
  }, []);
}

/* ------------------------------------------------------------------ */
/*  useGoToRepo — navigates to a specific repo (new conversation)      */
/* ------------------------------------------------------------------ */

type GoToRepoPayload = { repoId: string };
type GoToRepoHandler = (repoId: string) => void;

export function useGoToRepo(onGoToRepo: GoToRepoHandler) {
  const onGoToRepoRef = useRef(onGoToRepo);
  useEffect(() => {
    onGoToRepoRef.current = onGoToRepo;
  }, [onGoToRepo]);

  useEffect(() => {
    const handleGoToRepo = (event: Event) => {
      const payload = (event as CustomEvent<GoToRepoPayload>).detail;
      if (!payload?.repoId) return;
      onGoToRepoRef.current(payload.repoId);
    };
    window.addEventListener("codewiz:go-to-repo", handleGoToRepo as EventListener);
    return () =>
      window.removeEventListener("codewiz:go-to-repo", handleGoToRepo as EventListener);
  }, []);
}

/* ------------------------------------------------------------------ */
/*  useCreateFromGithub — creates a project from a GitHub repo name     */
/* ------------------------------------------------------------------ */

type CreateFromGithubPayload = { githubRepoName: string };
type CreateFromGithubHandler = (repoId: string, conversationId: string) => void;

export function useCreateFromGithub(onCreated: CreateFromGithubHandler) {
  const onCreatedRef = useRef(onCreated);
  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);

  useEffect(() => {
    const handleCreateFromGithub = async (event: Event) => {
      const payload = (event as CustomEvent<CreateFromGithubPayload>).detail;
      const githubRepoName = payload?.githubRepoName?.trim();
      if (!githubRepoName) return;

      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("codewiz_token")
          : null;
      if (!token) {
        window.location.href = "/auth/login";
        return;
      }

      const response = await fetch("/api/repos", {
        method: "POST",
        headers: clientAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ githubRepoName }),
      });
      if (!response.ok) return;

      const data = (await response.json()) as {
        id?: string;
        conversationId?: string;
      };
      const repoId = data.id;
      const conversationId = data.conversationId;
      if (!repoId || !conversationId) return;

      onCreatedRef.current(repoId, conversationId);
    };

    window.addEventListener(
      "codewiz:create-from-github",
      handleCreateFromGithub as EventListener,
    );
    return () =>
      window.removeEventListener(
        "codewiz:create-from-github",
        handleCreateFromGithub as EventListener,
      );
  }, []);
}

/* ------------------------------------------------------------------ */
/*  useThreadStateSync — bridges assistant-ui thread state to app events */
/* ------------------------------------------------------------------ */

export type ThreadState = {
  isEmpty: boolean;
  isRunning: boolean;
};

export function useThreadStateSync(
  onThreadStateChange: (state: ThreadState) => void,
) {
  const onThreadStateChangeRef = useRef(onThreadStateChange);
  useEffect(() => {
    onThreadStateChangeRef.current = onThreadStateChange;
  }, [onThreadStateChange]);

  const dispatch = useCallback(
    (state: ThreadState, repoId: string | null) => {
      onThreadStateChangeRef.current(state);
      window.dispatchEvent(
        new CustomEvent("codewiz:thread-state", {
          detail: { repoId, isRunning: state.isRunning },
        }),
      );
    },
    [],
  );

  return { dispatch };
}
