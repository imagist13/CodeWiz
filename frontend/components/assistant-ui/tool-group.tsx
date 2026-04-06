"use client";

import { cn } from "@/lib/utils";
import { useMessage } from "@assistant-ui/react";
import { CheckIcon, ChevronRightIcon, CircleDashedIcon } from "lucide-react";
import { type FC, type PropsWithChildren, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type MessagePartGroup = { groupKey: string | undefined; indices: number[] };
type GroupingFunction = (parts: readonly any[]) => MessagePartGroup[];

/* ------------------------------------------------------------------ */
/*  Grouping function – groups consecutive tool-call parts            */
/*  Encodes tool info into the groupKey so the Group component        */
/*  doesn't need to access message context.                           */
/* ------------------------------------------------------------------ */

type ToolInfo = {
  toolName: string;
  args: Record<string, unknown>;
  statusType?: string;
};

type EncodedGroup = {
  tools: ToolInfo[];
  isTrailing: boolean;
};

const encodeToolGroup = (tools: ToolInfo[], isTrailing: boolean): string => {
  return JSON.stringify({ tools, isTrailing } satisfies EncodedGroup);
};

export const groupConsecutiveToolCalls: GroupingFunction = (parts) => {
  const groups: MessagePartGroup[] = [];
  let currentToolIndices: number[] | null = null;
  let currentToolInfos: ToolInfo[] | null = null;

  // Tools that should never be grouped
  const UNGROUPED_TOOLS = new Set([
    "commitTool",
    "checkAppTool",
    "devServerLogsTool",
  ]);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (
      part &&
      part.type === "tool-call" &&
      !UNGROUPED_TOOLS.has(part.toolName ?? "")
    ) {
      if (!currentToolIndices) {
        currentToolIndices = [];
        currentToolInfos = [];
      }
      currentToolIndices.push(i);
      currentToolInfos!.push({
        toolName: part.toolName ?? "",
        args: part.args ?? {},
        statusType: part.status?.type,
      });
    } else {
      if (currentToolIndices && currentToolInfos) {
        groups.push({
          groupKey: encodeToolGroup(currentToolInfos, false),
          indices: currentToolIndices,
        });
        currentToolIndices = null;
        currentToolInfos = null;
      }
      groups.push({ groupKey: undefined, indices: [i] });
    }
  }

  if (currentToolIndices && currentToolInfos) {
    // This is the last group in the message — mark it as trailing
    groups.push({
      groupKey: encodeToolGroup(currentToolInfos, true),
      indices: currentToolIndices,
    });
  }

  return groups;
};

/* ------------------------------------------------------------------ */
/*  Single-line summary                                               */
/* ------------------------------------------------------------------ */

const summarize = (tools: ToolInfo[]): string => {
  if (tools.length === 0) return "Ran tools";

  // Count by category
  let reads = 0,
    writes = 0,
    edits = 0,
    searches = 0,
    cmds = 0,
    other = 0;
  let singleFile: string | undefined;

  for (const t of tools) {
    const file = typeof t.args.file === "string" ? t.args.file : undefined;
    switch (t.toolName) {
      case "readFileTool":
        reads++;
        break;
      case "writeFileTool":
        writes++;
        singleFile ??= file;
        break;
      case "replaceInFileTool":
      case "appendToFileTool":
        edits++;
        singleFile ??= file;
        break;
      case "searchFilesTool":
        searches++;
        break;
      case "listFilesTool":
        reads++;
        break;
      case "bashTool":
        cmds++;
        break;
      default:
        other++;
        break;
    }
  }

  // Build compact fragments
  const parts: string[] = [];

  const modified = writes + edits;
  if (modified === 1 && singleFile) {
    parts.push(`Updated ${singleFile}`);
  } else if (modified > 0) {
    parts.push(`Updated ${modified} file${modified > 1 ? "s" : ""}`);
  }

  if (reads > 0) parts.push(`read ${reads} file${reads > 1 ? "s" : ""}`);
  if (searches > 0)
    parts.push(`searched ${searches} quer${searches > 1 ? "ies" : "y"}`);
  if (cmds > 0) parts.push(`ran ${cmds} command${cmds > 1 ? "s" : ""}`);
  if (other > 0) parts.push(`${other} other`);

  if (parts.length === 0) return `Ran ${tools.length} tools`;

  // Capitalize first fragment, join with ", "
  parts[0] = parts[0]!.charAt(0).toUpperCase() + parts[0]!.slice(1);
  return parts.join(", ");
};

/* ------------------------------------------------------------------ */
/*  Group component                                                   */
/* ------------------------------------------------------------------ */

export const ToolCallGroup: FC<
  PropsWithChildren<{ groupKey: string | undefined; indices: number[] }>
> = ({ groupKey, indices, children }) => {
  const [open, setOpen] = useState(false);
  const messageIsRunning = useMessage(
    (state) => state.status?.type === "running",
  );

  // Ungrouped parts render normally
  if (!groupKey) return <>{children}</>;

  // Single tool call — don't group, render directly
  if (indices.length === 1) {
    return <>{children}</>;
  }

  // Decode tool info from the groupKey
  let tools: ToolInfo[] = [];
  let isTrailing = false;
  try {
    const decoded = JSON.parse(groupKey) as EncodedGroup;
    tools = decoded.tools;
    isTrailing = decoded.isTrailing;
  } catch {
    // fallback
  }

  const summary = summarize(tools);
  const anyToolRunning = tools.some((t) => t.statusType === "running");
  // Show spinner if any tool is running, OR if this is the trailing group
  // and the message is still streaming (more tools may arrive)
  const showSpinner = anyToolRunning || (isTrailing && messageIsRunning);

  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60"
      >
        {showSpinner ? (
          <CircleDashedIcon className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <CheckIcon className="size-3.5 shrink-0" />
        )}
        <span className="truncate">{summary}</span>
        <ChevronRightIcon
          className={cn(
            "ml-auto size-3 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="ml-2 border-l border-border pl-2">{children}</div>
      )}
    </div>
  );
};
