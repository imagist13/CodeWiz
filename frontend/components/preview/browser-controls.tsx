"use client";

import { useEffect, useState } from "react";
import type { RepoItem } from "@/lib/repo-types";
import { PublishDialog } from "@/components/assistant-ui/publish-dialog";
import { ArrowLeftIcon, ArrowRightIcon, RotateCwIcon } from "lucide-react";

function sandboxPreviewBase(repoId: string) {
  return `/api/sandbox-preview/${repoId}`;
}

interface BrowserControlsProps {
  repoId: string;
  previewUrl: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  repo: RepoItem;
  onSetProductionDomain: (repoId: string, domain: string) => Promise<void>;
  onPromoteDeployment: (repoId: string, deploymentId: string) => Promise<void>;
}

export function BrowserControls({
  repoId,
  previewUrl,
  iframeRef,
  repo,
  onSetProductionDomain,
  onPromoteDeployment,
}: BrowserControlsProps) {
  const [urlValue, setUrlValue] = useState(() => {
    try {
      return new URL(previewUrl).pathname;
    } catch {
      return "/";
    }
  });

  useEffect(() => {
    try {
      setUrlValue(new URL(previewUrl).pathname);
    } catch {
      setUrlValue("/");
    }
  }, [previewUrl]);

  const baseUrl = (() => {
    try {
      const u = new URL(previewUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      return previewUrl;
    }
  })();

  const proxyBase = sandboxPreviewBase(repoId);

  const navigate = (path: string) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    setUrlValue(normalizedPath);
    if (repoId) {
      const base = new URL(proxyBase, window.location.href);
      const cleanPath =
        normalizedPath === "/" || normalizedPath === ""
          ? ""
          : normalizedPath.slice(1);
      if (cleanPath) {
        base.pathname = `${base.pathname.replace(/\/$/, "")}/${cleanPath
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`;
      }
      iframe.src = base.toString();
    } else {
      iframe.src = `${baseUrl}${normalizedPath}`;
    }
  };

  const handleReload = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.src = iframe.src;
  };

  const handleBack = () => {
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch {}
  };

  const handleForward = () => {
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch {}
  };

  return (
    <>
      <button
        type="button"
        onClick={handleBack}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Back"
      >
        <ArrowLeftIcon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={handleForward}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Forward"
      >
        <ArrowRightIcon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={handleReload}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Reload"
      >
        <RotateCwIcon className="size-3.5" />
      </button>
      <form
        className="ml-1 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(urlValue);
        }}
      >
        <input
          type="text"
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
          className="h-7 w-full rounded-md bg-muted/50 px-2.5 text-xs text-foreground transition-colors outline-none focus:bg-muted focus:ring-1 focus:ring-ring"
          aria-label="URL path"
        />
      </form>
      <div className="ml-1.5">
        <PublishDialog
          repo={repo}
          onSetProductionDomain={onSetProductionDomain}
          onPromoteDeployment={onPromoteDeployment}
        />
      </div>
    </>
  );
}
