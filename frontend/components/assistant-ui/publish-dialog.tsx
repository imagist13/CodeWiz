"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  GlobeIcon,
  Loader2Icon,
  PencilIcon,
  RocketIcon,
} from "lucide-react";
import type { RepoItem } from "@/lib/repo-types";

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = Date.now();
  const diffSeconds = Math.floor((now - date.getTime()) / 1000);
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

/* ------------------------------------------------------------------ */
/*  Publish dialog                                                     */
/* ------------------------------------------------------------------ */

export function PublishDialog({
  repo,
  onSetProductionDomain,
  onPromoteDeployment,
}: {
  repo: RepoItem;
  onSetProductionDomain: (repoId: string, domain: string) => Promise<void>;
  onPromoteDeployment: (repoId: string, deploymentId: string) => Promise<void>;
}) {
  const [isPromotingId, setIsPromotingId] = React.useState<string | null>(null);

  /* Domain editing – inline, no nested dialog */
  const [isEditingDomain, setIsEditingDomain] = React.useState(false);
  const [domainInput, setDomainInput] = React.useState("");
  const [isSavingDomain, setIsSavingDomain] = React.useState(false);
  const [domainError, setDomainError] = React.useState<string | null>(null);

  const hasDomain = !!repo.productionDomain;
  const items = repo.deployments;

  const latestLive = items.find((d) => d.state === "live" && d.deploymentId);
  const hasLiveNotPromoted =
    latestLive && latestLive.deploymentId !== repo.productionDeploymentId;

  const startEditDomain = () => {
    setDomainInput(repo.productionDomain ?? "");
    setDomainError(null);
    setIsEditingDomain(true);
  };

  const cancelEditDomain = () => {
    setIsEditingDomain(false);
    setDomainError(null);
  };

  const saveDomain = async () => {
    const nextDomain = domainInput.trim().toLowerCase();
    if (!nextDomain.endsWith(".style.dev")) {
      setDomainError("Domain must end in .style.dev");
      return;
    }
    setDomainError(null);
    setIsSavingDomain(true);
    try {
      await onSetProductionDomain(repo.id, nextDomain);
      setIsEditingDomain(false);
    } catch (e) {
      setDomainError(e instanceof Error ? e.message : "Failed to save domain");
    } finally {
      setIsSavingDomain(false);
    }
  };

  const handlePromote = async (deploymentId: string) => {
    setIsPromotingId(deploymentId);
    try {
      await onPromoteDeployment(repo.id, deploymentId);
    } catch {
      // visible from state
    } finally {
      setIsPromotingId(null);
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) cancelEditDomain();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <RocketIcon className="size-3" />
          Publish
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish</DialogTitle>
          <DialogDescription>
            Every commit gets a staging deployment automatically. Publish
            promotes a deployment to your production domain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* ---- Step 1: Domain ---- */}
          <div>
            <div className="flex items-center gap-2 pb-2">
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${hasDomain ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}
              >
                {hasDomain ? <CheckCircle2Icon className="size-3.5" /> : "1"}
              </span>
              <span className="text-sm font-medium">
                {hasDomain ? "Domain configured" : "Set up your domain"}
              </span>
            </div>

            {isEditingDomain ? (
              <div className="space-y-2 pl-7">
                <div className="flex items-center gap-2">
                  <Input
                    value={domainInput}
                    onChange={(e) => {
                      setDomainInput(e.target.value);
                      setDomainError(null);
                    }}
                    placeholder="my-app.style.dev"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveDomain();
                      if (e.key === "Escape") cancelEditDomain();
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={saveDomain}
                    disabled={isSavingDomain}
                  >
                    {isSavingDomain ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0"
                    onClick={cancelEditDomain}
                    disabled={isSavingDomain}
                  >
                    Cancel
                  </Button>
                </div>
                {domainError && (
                  <p className="text-[13px] text-destructive">{domainError}</p>
                )}
              </div>
            ) : hasDomain ? (
              <div className="flex items-center gap-2 pl-7">
                <a
                  href={`https://${repo.productionDomain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm text-foreground transition-colors hover:underline"
                >
                  <GlobeIcon className="size-3.5 shrink-0 text-emerald-500" />
                  <span className="truncate">{repo.productionDomain}</span>
                  <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground/40" />
                </a>
                <button
                  type="button"
                  onClick={startEditDomain}
                  className="ml-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                  title="Edit domain"
                >
                  <PencilIcon className="size-3" />
                </button>
              </div>
            ) : (
              <div className="pl-7">
                <p className="mb-2 text-[13px] text-muted-foreground/60">
                  Choose a <span className="font-medium">.style.dev</span>{" "}
                  subdomain for your app.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={startEditDomain}
                >
                  <GlobeIcon className="size-3.5" />
                  Set domain
                </Button>
              </div>
            )}
          </div>

          {/* ---- Step 2: Deploy ---- */}
          <div>
            <div className="flex items-center gap-2 pb-2">
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${repo.productionDeploymentId ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}
              >
                {repo.productionDeploymentId ? (
                  <CheckCircle2Icon className="size-3.5" />
                ) : (
                  "2"
                )}
              </span>
              <span className="text-sm font-medium">
                {repo.productionDeploymentId
                  ? "Deployment live"
                  : "Promote a deployment"}
              </span>
            </div>

            {/* Promote banner — shows when there's a newer live deployment not yet in prod */}
            {hasDomain && hasLiveNotPromoted && latestLive.deploymentId && (
              <div className="mb-3 ml-7 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {latestLive.commitMessage}
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    {formatRelativeTime(latestLive.commitDate)} · Ready to
                    publish
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-8 shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => void handlePromote(latestLive.deploymentId!)}
                  disabled={isPromotingId === latestLive.deploymentId}
                >
                  {isPromotingId === latestLive.deploymentId ? (
                    <>
                      <Loader2Icon className="size-3.5 animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <RocketIcon className="size-3.5" />
                      Publish
                    </>
                  )}
                </Button>
              </div>
            )}

            {!hasDomain && items.length > 0 && (
              <p className="mb-2 pl-7 text-[13px] text-muted-foreground/60">
                Set up a domain first, then you can publish a deployment.
              </p>
            )}

            {items.length === 0 ? (
              <p className="py-1 pl-7 text-[13px] text-muted-foreground/40">
                No deployments yet. Send a message to create your first build.
              </p>
            ) : (
              <div className="max-h-48 space-y-px overflow-y-auto pl-7">
                {items.map((entry) => {
                  const isProduction =
                    !!entry.deploymentId &&
                    repo.productionDeploymentId === entry.deploymentId;
                  const isPromoting = isPromotingId === entry.deploymentId;
                  const canPromote =
                    !!entry.deploymentId &&
                    hasDomain &&
                    entry.state === "live" &&
                    !isProduction;

                  return (
                    <div
                      key={`${entry.commitSha}-${entry.url}`}
                      className="flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent"
                    >
                      {/* Status dot */}
                      <span className="flex size-3.5 shrink-0 items-center justify-center">
                        {entry.state === "deploying" ? (
                          <Loader2Icon className="size-3 animate-spin text-amber-400" />
                        ) : entry.state === "live" ? (
                          <span className="size-[7px] rounded-full bg-emerald-500" />
                        ) : entry.state === "failed" ? (
                          <span className="size-[7px] rounded-full bg-red-500" />
                        ) : (
                          <span className="size-[7px] rounded-full bg-muted-foreground/25" />
                        )}
                      </span>

                      {/* Text */}
                      <div className="min-w-0 flex-1">
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm leading-snug text-foreground hover:underline"
                        >
                          {entry.commitMessage}
                        </a>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/60">
                          <span>{formatRelativeTime(entry.commitDate)}</span>
                          {isProduction && (
                            <>
                              <span className="opacity-40">·</span>
                              <span className="font-medium text-emerald-400">
                                production
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Promote button */}
                      {canPromote && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            if (!entry.deploymentId) return;
                            void handlePromote(entry.deploymentId);
                          }}
                          disabled={isPromoting}
                        >
                          {isPromoting ? (
                            <Loader2Icon className="size-3 animate-spin" />
                          ) : (
                            "Publish"
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
