"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { X, NotePencil, FolderPlus } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePanel } from "@/hooks/usePanel";
import { useTranslation } from "@/hooks/useTranslation";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { FileTree } from "@/components/project/FileTree";
import { TaskList } from "@/components/project/TaskList";

const TREE_MIN_WIDTH = 220;
const TREE_MAX_WIDTH = 500;
const TREE_DEFAULT_WIDTH = 280;

type NewItemMode = "file" | "folder";

export function FileTreePanel() {
  const { workingDirectory, sessionId, previewFile, setPreviewFile, setPreviewOpen, setFileTreeOpen } = usePanel();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [width, setWidth] = useState(TREE_DEFAULT_WIDTH);

  // VS-Code-like "new item" flow.
  // newItemMode gates the input row: null = hidden, 'file' = creating a
  // Markdown file, 'folder' = creating a directory. newItemTargetDir is
  // the parent directory (workspace root or a folder clicked via the
  // hover "+" on a tree row).
  const [newItemMode, setNewItemMode] = useState<NewItemMode | null>(null);
  const [newItemTargetDir, setNewItemTargetDir] = useState<string>("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemError, setNewItemError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [treeReloadKey, setTreeReloadKey] = useState(0);
  const newItemInputRef = useRef<HTMLInputElement | null>(null);

  // Folder selection drives the "create inside this folder" default when
  // the user clicks the top-level New File / New Folder icons — if a
  // folder is selected, new items go inside it; otherwise they go at
  // the workspace root. Independent of file selection so clicking a
  // file doesn't clobber the current folder target.
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);

  // On open: focus the input and pre-select the stem (everything before
  // the last dot) for file mode, or the whole name for folder mode.
  useEffect(() => {
    if (newItemMode && newItemInputRef.current) {
      const input = newItemInputRef.current;
      input.focus();
      if (newItemMode === "file") {
        const dot = input.value.lastIndexOf(".");
        input.setSelectionRange(0, dot >= 0 ? dot : input.value.length);
      } else {
        input.select();
      }
    }
  }, [newItemMode]);

  const highlightPath = searchParams.get("file") || undefined;
  const highlightSeek = searchParams.get("seek") || undefined;

  const handleResize = useCallback((delta: number) => {
    setWidth((w) => Math.min(TREE_MAX_WIDTH, Math.max(TREE_MIN_WIDTH, w - delta)));
  }, []);

  const handleFileAdd = useCallback((path: string) => {
    window.dispatchEvent(new CustomEvent("attach-file-to-chat", { detail: { path } }));
  }, []);

  /**
   * Open the new-item input in the given mode, targeting a specific
   * directory (or the workspace root when targetDir is undefined).
   * Toggling the same mode + same target closes the input — matches the
   * VS Code affordance where clicking New File twice returns to the
   * tree without creating anything.
   */
  const openNewItem = useCallback(
    (mode: NewItemMode, targetDir?: string) => {
      // Precedence: explicit targetDir (from hover "+" on a folder row) →
      // currently-selected folder (from click on folder row) → workspace
      // root. This matches the VS-Code feel: click folder, then click
      // New File, new file lands in that folder.
      const effectiveTarget = targetDir ?? selectedFolderPath ?? workingDirectory;
      setNewItemMode((cur) => {
        const sameAsCurrent =
          cur === mode && newItemTargetDir === effectiveTarget;
        if (sameAsCurrent) return null;
        return mode;
      });
      setNewItemTargetDir(effectiveTarget);
      setNewItemName(mode === "file" ? "untitled.md" : "new-folder");
      setNewItemError(null);
    },
    [workingDirectory, selectedFolderPath, newItemTargetDir],
  );

  /**
   * Submit the new-item form. Routes to /api/files/write for files or
   * /api/files/mkdir for folders, using workingDirectory as baseDir so
   * the server-side path safety check can enforce the workspace
   * envelope regardless of which subfolder the user targeted.
   */
  const handleCreateItem = useCallback(async () => {
    setNewItemError(null);
    const trimmed = newItemName.trim();
    if (!trimmed) {
      setNewItemError(t("fileTree.newFileErrorEmpty"));
      return;
    }
    if (!workingDirectory) {
      setNewItemError(t("fileTree.newFileErrorNoWorkspace"));
      return;
    }
    const targetDir = newItemTargetDir || workingDirectory;
    setCreating(true);
    try {
      const separator = targetDir.includes("\\") ? "\\" : "/";
      const targetPath = `${targetDir}${separator}${trimmed}`;
      const endpoint = newItemMode === "folder" ? "/api/files/mkdir" : "/api/files/write";
      const body =
        newItemMode === "folder"
          ? { path: targetPath, baseDir: workingDirectory, createParents: false }
          : {
              path: targetPath,
              baseDir: workingDirectory,
              content: `# ${trimmed.replace(/\.[^.]+$/, "")}\n\n`,
              overwrite: false,
              createParents: false,
            };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNewItemError(data.error || t("fileTree.newFileErrorGeneric"));
        return;
      }
      const data = await res.json();
      setNewItemMode(null);
      setNewItemName("");
      setTreeReloadKey((k) => k + 1);
      // Only open a preview for files — folders have nothing to preview.
      if (newItemMode === "file") {
        setPreviewFile(data.path);
        setPreviewOpen(true);
      }
    } catch (err) {
      setNewItemError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }, [newItemMode, newItemName, newItemTargetDir, workingDirectory, t, setPreviewFile, setPreviewOpen]);

  const handleFileSelect = useCallback((path: string) => {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const NON_PREVIEWABLE = new Set([
      "zip", "tar", "gz", "rar", "7z", "bz2",
      "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
      "exe", "dll", "so", "dylib", "bin", "dmg", "iso",
      "woff", "woff2", "ttf", "otf", "eot",
      "flv", "wmv", "wma",
    ]);
    if (NON_PREVIEWABLE.has(ext)) return;
    // Selecting a file clears folder selection so the next New File /
    // New Folder click lands at workspace root (not the previously-
    // selected folder) unless the user reselects one.
    setSelectedFolderPath(null);
    if (previewFile === path) {
      setPreviewFile(null);
      setPreviewOpen(false);
    } else {
      setPreviewFile(path);
      setPreviewOpen(true);
    }
  }, [previewFile, setPreviewFile, setPreviewOpen]);

  const handleSelectFolder = useCallback((folderPath: string) => {
    // Clicking the same folder again deselects (easy way to reset the
    // create target back to workspace root without clicking away).
    setSelectedFolderPath((cur) => (cur === folderPath ? null : folderPath));
  }, []);

  // Relative path hint for the new-item breadcrumb. When target is the
  // workspace root we show "./", otherwise the relative nested path.
  const targetBreadcrumb =
    !newItemTargetDir || newItemTargetDir === workingDirectory
      ? "./"
      : `./${newItemTargetDir.replace(workingDirectory, "").replace(/^[/\\]/, "")}/`;

  return (
    <div className="flex h-full shrink-0 overflow-hidden">
      <ResizeHandle side="left" onResize={handleResize} />
      <div className="flex h-full flex-1 flex-col overflow-hidden border-r border-border/40 bg-background" style={{ width }}>
        {/* Panel header — title + close only. Create actions moved below
            the Tasks divider per user feedback: Tasks and Files are two
            separate surfaces, so the create affordance belongs next to
            the files list, not next to the panel title. */}
        <div className="flex h-10 shrink-0 items-center justify-between px-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("panel.files")}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setFileTreeOpen(false)}
          >
            <X size={14} />
            <span className="sr-only">{t("panel.closePanel")}</span>
          </Button>
        </div>

        {/* Body — TaskList → divider → Files Actions Bar → (optional
            new-item input) → FileTree. */}
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 px-3 pb-3">
            <TaskList sessionId={sessionId} />
          </div>

          <div className="mx-3 mt-1 mb-2 border-t border-border/40" />

          {/* Files Actions Bar — VS-Code-style New File / New Folder
              icons aligned to the right so they don't fight the search
              input that FileTree renders below. */}
          <div className="flex shrink-0 items-center justify-between px-3 pb-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {t("fileTree.sectionTitle")}
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => openNewItem("file")}
                disabled={!workingDirectory}
                title={t("fileTree.newMarkdown")}
              >
                <NotePencil size={13} />
                <span className="sr-only">{t("fileTree.newMarkdown")}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => openNewItem("folder")}
                disabled={!workingDirectory}
                title={t("fileTree.newFolder")}
              >
                <FolderPlus size={13} />
                <span className="sr-only">{t("fileTree.newFolder")}</span>
              </Button>
            </div>
          </div>

          {/* Inline new-item input. Mode controls placeholder + what API
              the submit handler hits. Esc cancels, Enter submits. */}
          {newItemMode && (
            <div className="shrink-0 border-y border-border/40 bg-muted/30 px-3 py-2 space-y-1">
              <p className="truncate text-[10px] text-muted-foreground/60 font-mono">
                {targetBreadcrumb}
              </p>
              <div className="flex items-center gap-1.5">
                <Input
                  ref={newItemInputRef}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!creating) void handleCreateItem();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setNewItemMode(null);
                      setNewItemError(null);
                    }
                  }}
                  placeholder={newItemMode === "folder" ? "new-folder" : "untitled.md"}
                  className="h-7 text-xs font-mono"
                  disabled={creating}
                />
                <Button
                  size="xs"
                  onClick={() => void handleCreateItem()}
                  disabled={creating || !newItemName.trim()}
                >
                  {creating ? "…" : t("fileTree.createButton")}
                </Button>
              </div>
              {newItemError && (
                <p className="text-[11px] text-destructive">{newItemError}</p>
              )}
              <p className="text-[10px] text-muted-foreground/60">
                {t("fileTree.newFileHint")}
              </p>
            </div>
          )}

          {/* File tree. treeReloadKey bumps on every successful create
              so the directory scan reloads and the new file appears. */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <FileTree
              key={treeReloadKey}
              workingDirectory={workingDirectory}
              onFileSelect={handleFileSelect}
              onFileAdd={handleFileAdd}
              selectedFolderPath={selectedFolderPath ?? undefined}
              onSelectFolder={handleSelectFolder}
              selectedFilePath={previewFile ?? undefined}
              highlightPath={highlightPath}
              highlightSeek={highlightSeek}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
