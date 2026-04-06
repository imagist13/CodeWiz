"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  CheckIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  const [open, setOpen] = useState(false);
  const running = status?.type === "running";
  const failed = status?.type === "incomplete" && status.reason === "cancelled";

  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-muted/60",
          failed && "text-muted-foreground line-through",
        )}
      >
        {running ? (
          <CircleDashedIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
        ) : failed ? (
          <XIcon className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <CheckIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
        <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">{toolName}</span>
        <ChevronRightIcon
          className={cn(
            "ml-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="mt-1 mb-1 ml-9 flex max-h-64 flex-col gap-2 overflow-auto rounded border bg-muted/30 px-3 py-2">
          <div>
            <p className="mb-0.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Input
            </p>
            <pre className="text-xs whitespace-pre-wrap">{argsText}</pre>
          </div>
          {result !== undefined && (
            <div>
              <p className="mb-0.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                Result
              </p>
              <pre className="text-xs whitespace-pre-wrap">
                {typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
