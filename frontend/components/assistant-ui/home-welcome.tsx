"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useRepos } from "@/lib/repos-context";
import { useAuth } from "@/lib/auth-context";
import { type FC, useState } from "react";
import Link from "next/link";

export const HomeWelcome: FC = () => {
  const { repos, isLoading, onSelectProject } = useRepos();
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [githubRepoInput, setGithubRepoInput] = useState("");
  const [githubRepoError, setGithubRepoError] = useState<string | null>(null);

  const handleUseGithubRepo = () => {
    const githubRepoName = githubRepoInput.trim();
    if (!githubRepoName.includes("/")) {
      setGithubRepoError("Repository must be in owner/repo format");
      return;
    }

    setGithubRepoError(null);
    window.dispatchEvent(
      new CustomEvent("adorable:create-from-github", {
        detail: { githubRepoName },
      }),
    );
    setGithubDialogOpen(false);
    setGithubRepoInput("");
  };

  const hasProjects = repos.length > 0;
  const showProjects = !authLoading && isAuthenticated && hasProjects;

  if (authLoading) {
    return (
      <div className="aui-thread-welcome-root mx-auto flex w-full max-w-(--thread-max-width) grow flex-col items-center justify-center">
        <div className="flex h-10 w-20 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="aui-thread-welcome-root mx-auto flex w-full max-w-(--thread-max-width) grow flex-col items-center justify-center px-2">
        <div className="flex flex-col items-center gap-6 text-center">
          <svg
            viewBox="0 0 347 280"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-auto"
          >
            <path
              d="M70 267V235.793C37.4932 229.296 13 200.594 13 166.177C13 134.93 33.1885 108.399 61.2324 98.9148C61.9277 51.3467 100.705 13 148.438 13C183.979 13 214.554 34.2582 228.143 64.7527C234.182 63.4301 240.454 62.733 246.89 62.733C295.058 62.733 334.105 101.781 334.105 149.949C334.105 182.845 315.893 211.488 289 226.343V267"
              className="stroke-foreground/15"
              strokeWidth="25"
              strokeLinecap="round"
            />
            <path
              d="M146 237V267"
              className="stroke-foreground/15"
              strokeWidth="25"
              strokeLinecap="round"
            />
            <path
              d="M215 237V267"
              className="stroke-foreground/15"
              strokeWidth="25"
              strokeLinecap="round"
            />
          </svg>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              What do you want to build?
            </h1>
            <p className="text-sm text-muted-foreground/60">
              Sign in to create and manage your projects
            </p>
          </div>
          <div className="flex gap-3">
            <Button size="lg" asChild className="gap-2">
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="gap-2">
              <Link href="/auth/register">Register</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="aui-thread-welcome-root mx-auto flex w-full max-w-(--thread-max-width) grow flex-col items-center justify-center">
      <div className="flex w-full flex-col gap-8 px-2">
        {/* Hero */}
        <div className="flex animate-in flex-col items-center gap-2 pt-8 text-center duration-500 fill-mode-both fade-in">
          <svg
            viewBox="0 0 347 280"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mb-2 h-10 w-auto"
          >
            <path
              d="M70 267V235.793C37.4932 229.296 13 200.594 13 166.177C13 134.93 33.1885 108.399 61.2324 98.9148C61.9277 51.3467 100.705 13 148.438 13C183.979 13 214.554 34.2582 228.143 64.7527C234.182 63.4301 240.454 62.733 246.89 62.733C295.058 62.733 334.105 101.781 334.105 149.949C334.105 182.845 315.893 211.488 289 226.343V267"
              className="stroke-foreground/15"
              strokeWidth="25"
              strokeLinecap="round"
            />
            <path
              d="M146 237V267"
              className="stroke-foreground/15"
              strokeWidth="25"
              strokeLinecap="round"
            />
            <path
              d="M215 237V267"
              className="stroke-foreground/15"
              strokeWidth="25"
              strokeLinecap="round"
            />
          </svg>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            What do you want to build?
          </h1>
          <p className="text-sm text-muted-foreground/60">
            Describe an app or pick up where you left off
          </p>
        </div>

        {/* Project cards */}
        <div
          className={cn(
            "flex w-full flex-col gap-3 transition-opacity duration-500",
            showProjects ? "opacity-100" : "opacity-0",
          )}
        >
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl border border-border/50 bg-card/50"
                >
                  <Skeleton className="aspect-16/10 w-full" />
                  <div className="px-3 py-2.5">
                    <Skeleton className="mb-1.5 h-3.5 w-3/4 rounded" />
                    <Skeleton className="h-2.5 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : hasProjects ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {repos.map((repo, index) => {
                  return (
                    <button
                      key={repo.id}
                      type="button"
                      onClick={() => onSelectProject(repo.id)}
                      className="group animate-in overflow-hidden rounded-xl border border-border/50 bg-card/50 text-left transition-all duration-200 fill-mode-both fade-in hover:border-border hover:ring-1 hover:ring-ring/20"
                      style={
                        {
                          "--tw-animation-delay": `${index * 75}ms`,
                          "--tw-animation-duration": "400ms",
                        } as React.CSSProperties
                      }
                    >
                      {/* Preview placeholder */}
                      <div className="relative aspect-16/10 w-full overflow-hidden bg-muted/30">
                        <div className="flex h-full items-center justify-center">
                          <span className="text-xs text-muted-foreground/30">
                            No preview
                          </span>
                        </div>
                        {/* Status dot */}
                        <div className="absolute top-2 right-2">
                          <div className="h-2 w-2 rounded-full bg-muted-foreground/30 ring-2 ring-card/80" />
                        </div>
                      </div>
                      {/* Info */}
                      <div className="px-3 py-2.5">
                        <p className="truncate text-sm font-medium text-foreground group-hover:text-foreground">
                          {repo.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground/50">
                          Open to start chatting
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Import from GitHub */}
              <button
                type="button"
                onClick={() => setGithubDialogOpen(true)}
                className="mx-auto flex animate-in items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground/40 transition-colors fill-mode-both fade-in hover:text-muted-foreground"
                style={
                  {
                    "--tw-animation-delay": `${repos.length * 75}ms`,
                    "--tw-animation-duration": "400ms",
                  } as React.CSSProperties
                }
              >
                Import from GitHub
              </button>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Use GitHub Repo</DialogTitle>
            <DialogDescription>
              Enter a repository in owner/repo format.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={githubRepoInput}
              onChange={(event) => {
                setGithubRepoInput(event.target.value);
                setGithubRepoError(null);
              }}
              placeholder="owner/repository"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleUseGithubRepo();
                }
              }}
            />
            {githubRepoError && (
              <p className="text-[13px] text-destructive">{githubRepoError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setGithubDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleUseGithubRepo}>
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
