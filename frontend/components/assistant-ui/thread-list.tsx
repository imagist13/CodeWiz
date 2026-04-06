import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AssistantIf,
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";
import { ArchiveIcon, MoreHorizontalIcon } from "lucide-react";
import type { FC } from "react";

export const ThreadList: FC = () => {
  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col gap-0.5">
      <AssistantIf condition={({ threads }) => threads.isLoading}>
        <ThreadListSkeleton />
      </AssistantIf>
      <AssistantIf condition={({ threads }) => !threads.isLoading}>
        <ThreadListPrimitive.Items components={{ ThreadListItem }} />
      </AssistantIf>
    </ThreadListPrimitive.Root>
  );
};

const ThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          className="aui-thread-list-skeleton-wrapper flex h-8 items-center px-2.5"
        >
          <Skeleton className="aui-thread-list-skeleton h-3.5 w-full" />
        </div>
      ))}
    </div>
  );
};

const ThreadListItem: FC = () => {
  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item group/item relative flex h-8 items-center rounded-lg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none data-active:bg-muted">
      <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger flex h-full min-w-0 flex-1 items-center overflow-hidden px-2.5 text-start text-[13px]">
        <span className="truncate">
          <ThreadListItemPrimitive.Title fallback="New Chat" />
        </span>
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemMore />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemMore: FC = () => {
  return (
    <ThreadListItemMorePrimitive.Root>
      <ThreadListItemMorePrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="aui-thread-list-item-more absolute right-1 size-6 p-0 opacity-0 transition-opacity group-hover/item:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100"
        >
          <MoreHorizontalIcon className="size-3.5" />
          <span className="sr-only">More options</span>
        </Button>
      </ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        side="bottom"
        align="start"
        className="aui-thread-list-item-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <ThreadListItemPrimitive.Archive asChild>
          <ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
            <ArchiveIcon className="size-4" />
            Archive
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Archive>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
};
