"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { RepoVmInfo } from "@/lib/repo-types";
import {
  Loader2Icon,
  PlusIcon,
  XIcon,
} from "lucide-react";

type TerminalTab = {
  id: string;
  label: string;
  url: string;
  closable: boolean;
};

function sandboxTerminalBase(repoId: string) {
  return `/api/sandbox-terminal/${repoId}`;
}

function sandboxPreviewBase(repoId: string) {
  return `/api/sandbox-preview/${repoId}`;
}

interface AppPreviewProps {
  repoId: string | null;
  metadata: RepoVmInfo | { previewUrl: string; devCommandTerminalUrl?: string } | null;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

export function AppPreview({ repoId, metadata, iframeRef }: AppPreviewProps) {
  const [extraTerminals, setExtraTerminals] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("dev-server");
  const [counter, setCounter] = useState(1);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [loadedTerminals, setLoadedTerminals] = useState<Set<string>>(new Set());

  const proxyRoot = repoId ? sandboxPreviewBase(repoId) : null;
  const mainFrameSrc = proxyRoot ?? (metadata as { previewUrl: string })?.previewUrl;

  const devServerTerminalUrl = repoId ? sandboxTerminalBase(repoId) : null;

  const allTabs: TerminalTab[] = [
    ...(devServerTerminalUrl
      ? [{ id: "dev-server", label: "Dev Server", url: devServerTerminalUrl, closable: false }]
      : []),
    ...extraTerminals,
  ];

  const markTerminalLoaded = useCallback((id: string) => {
    setLoadedTerminals((prev) => new Set(prev).add(id));
  }, []);

  useEffect(() => {
    setIframeLoaded(false);
  }, [(metadata as { previewUrl: string })?.previewUrl, proxyRoot]);

  const addTerminal = useCallback(() => {
    const id = `terminal-${counter}`;
    const tabUrl = sandboxTerminalBase(repoId ?? "");
    setExtraTerminals((prev) => [
      ...prev,
      { id, label: `Terminal ${counter}`, url: tabUrl, closable: true },
    ]);
    setActiveTab(id);
    setCounter((c) => c + 1);
  }, [counter, repoId]);

  const handleCloseTerminal = useCallback(
    (id: string) => {
      setExtraTerminals((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (activeTab === id && next.length > 0) {
          setActiveTab(next[next.length - 1].id);
        }
        return next;
      });
    },
    [activeTab],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="relative flex h-[70%] min-h-0 flex-col">
        <div className="relative min-h-0 flex-1 bg-muted/30">
          {!iframeLoaded && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-3">
                <Loader2Icon className="size-6 animate-spin text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground/40">Loading preview…</p>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            title="Preview"
            src={mainFrameSrc ?? undefined}
            className={cn(
              "h-full w-full transition-opacity duration-300",
              iframeLoaded ? "opacity-100" : "opacity-0",
            )}
            onLoad={() => setIframeLoaded(true)}
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>

      <div className="flex h-[30%] min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-0 border-y bg-[rgb(43,43,43)] px-1">
          {allTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`group flex items-center gap-1 px-2 py-1.5 text-xs transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-foreground bg-[rgb(43,43,43)] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{tab.label}</span>
              {tab.closable && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTerminal(tab.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      handleCloseTerminal(tab.id);
                    }
                  }}
                  className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                >
                  <XIcon className="size-3" />
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={addTerminal}
            className="ml-1 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="New terminal"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-[rgb(30,30,30)]">
          {allTabs.map((tab) => (
            <iframe
              key={tab.id}
              title={tab.label}
              src={tab.url}
              className={cn(
                "absolute inset-0 h-full w-full transition-opacity duration-500",
                loadedTerminals.has(tab.id) ? "opacity-100" : "opacity-0",
              )}
              style={{ display: activeTab === tab.id ? "block" : "none" }}
              onLoad={() => markTerminalLoaded(tab.id)}
              referrerPolicy="no-referrer-when-downgrade"
            />
          ))}
          {allTabs.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No terminal selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
