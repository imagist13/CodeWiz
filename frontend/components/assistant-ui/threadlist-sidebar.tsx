import * as React from "react";
import { useAuiState } from "@assistant-ui/react";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { ThreadListPrimitive } from "@assistant-ui/react";
import { ListTreeIcon, PlusIcon, RocketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type AdorableMetadata = {
  repoId?: string;
};

type DeploymentTimelineEntry = {
  commitSha: string;
  commitMessage: string;
  commitDate: string;
  domain: string;
  url: string;
  deploymentId: string | null;
  state: "idle" | "deploying" | "live" | "failed";
};

const AdorableLogo = () => (
  <svg
    viewBox="0 0 347 280"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="size-5"
  >
    <path
      d="M70 267V235.793C37.4932 229.296 13 200.594 13 166.177C13 134.93 33.1885 108.399 61.2324 98.9148C61.9277 51.3467 100.705 13 148.438 13C183.979 13 214.554 34.2582 228.143 64.7527C234.182 63.4301 240.454 62.733 246.89 62.733C295.058 62.733 334.105 101.781 334.105 149.949C334.105 182.845 315.893 211.488 289 226.343V267"
      className="stroke-foreground"
      strokeWidth="25"
      strokeLinecap="round"
    />
    <path
      d="M146 237V267"
      className="stroke-foreground"
      strokeWidth="25"
      strokeLinecap="round"
    />
    <path
      d="M215 237V267"
      className="stroke-foreground"
      strokeWidth="25"
      strokeLinecap="round"
    />
  </svg>
);

export function ThreadListSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const [tab, setTab] = React.useState<"threads" | "deployments">("threads");
  const { open, setOpen } = useSidebar();
  const metadata = useAuiState<AdorableMetadata | undefined>(({ thread }) => {
    for (let i = thread.messages.length - 1; i >= 0; i -= 1) {
      const m = thread.messages[i]?.metadata?.custom?.adorable as
        | AdorableMetadata
        | undefined;
      if (m) return m;
    }
    return undefined;
  });

  const onTabClick = (nextTab: "threads" | "deployments") => {
    if (open && tab === nextTab) {
      setOpen(false);
      return;
    }

    setTab(nextTab);
    setOpen(true);
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <div className="flex h-full">
        <div className="flex w-12 shrink-0 flex-col items-center border-r py-2">
          <button
            type="button"
            onClick={() => onTabClick("threads")}
            title="Threads"
            aria-label="Threads"
            className={`mb-1 inline-flex size-8 items-center justify-center rounded-md transition-colors ${
              open && tab === "threads"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <ListTreeIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onTabClick("deployments")}
            title="Deployments"
            aria-label="Deployments"
            className={`inline-flex size-8 items-center justify-center rounded-md transition-colors ${
              open && tab === "deployments"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <RocketIcon className="size-4" />
          </button>
        </div>

        <div className="min-h-0 min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="relative border-b px-3 py-2.5">
              <ThreadListPrimitive.New asChild>
                <Button
                  variant="ghost"
                  className="flex h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <AdorableLogo />
                    <span className="text-[13px] font-medium">Adorable</span>
                  </span>
                  <PlusIcon className="size-3.5" />
                </Button>
              </ThreadListPrimitive.New>
            </div>

            <div className="min-h-0 flex-1 px-1.5 pt-1.5">
              {tab === "threads" ? (
                <ThreadList />
              ) : (
                <DeploymentTimelineList repoId={metadata?.repoId} />
              )}
            </div>
          </div>
        </div>
      </div>
    </Sidebar>
  );
}

function DeploymentTimelineList({ repoId }: { repoId?: string }) {
  const [items, setItems] = React.useState<DeploymentTimelineEntry[]>([]);

  React.useEffect(() => {
    if (!repoId) {
      setItems([]);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const params = new URLSearchParams({ repoId, limit: "10" });
        const response = await fetch(
          `/api/deployment-timeline?${params.toString()}`,
        );
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setItems(Array.isArray(data.timeline) ? data.timeline : []);
      } catch {}
    };

    poll();
    const interval = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [repoId]);

  if (!repoId) {
    return (
      <div className="px-2 py-3 text-xs text-muted-foreground">
        No project yet.
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 overflow-x-hidden overflow-y-auto px-1 pb-2">
      {items.map((entry) => (
        <div
          key={entry.commitSha}
          className="space-y-1.5 rounded-md border p-2"
        >
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs font-medium text-foreground hover:underline"
            title={entry.url}
          >
            {entry.domain}
          </a>
          <div
            className="truncate text-[10px] text-muted-foreground"
            title={entry.commitMessage}
          >
            {entry.commitMessage}
          </div>
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            className="block h-20 cursor-pointer overflow-hidden rounded border bg-background"
            title={`Open ${entry.domain}`}
          >
            <iframe
              src={entry.url}
              className="pointer-events-none block h-[500%] w-[500%] origin-top-left scale-[0.2] border-0"
              loading="lazy"
              scrolling="no"
              title={`deployment-${entry.commitSha}`}
            />
          </a>
        </div>
      ))}
      {items.length === 0 && (
        <div className="px-2 py-3 text-xs text-muted-foreground">
          No deployments yet.
        </div>
      )}
    </div>
  );
}
