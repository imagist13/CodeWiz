"use client";

import { createContext, useContext } from "react";

export type PanelContent = "files" | "tasks";

export type PreviewViewMode = "source" | "rendered" | "edit";

/**
 * Preview panel content source — discriminated union.
 *
 * - `file`             : filesystem path, API-loaded via /api/files/preview
 * - `inline-html`      : HTML string, rendered directly in iframe srcDoc (Phase 2)
 * - `inline-jsx`       : TSX/JSX string, rendered via Sandpack (Phase 2)
 * - `inline-datatable` : structured rows+header, rendered via DataTable viewer (Phase 5.4)
 *
 * All `inline-*` variants optionally carry a `virtualName` for header /
 * breadcrumb / copy fallback text. The file variant uses the path's
 * basename for display.
 *
 * Callers should use `setPreviewSource({ kind, ... })`. The legacy
 * `setPreviewFile(path)` API is preserved as an adapter that produces
 * `{ kind: 'file', filePath: path }`.
 */
export type PreviewSource =
  | { kind: "file"; filePath: string }
  | { kind: "inline-html"; html: string; virtualName?: string }
  | {
      kind: "inline-jsx";
      jsx: string;
      virtualName?: string;
      /** Optional runtime bindings (Phase 2.1 Sandpack to decide) */
      bindings?: Record<string, unknown>;
    }
  | {
      kind: "inline-datatable";
      rows: unknown[][];
      header: string[];
      virtualName?: string;
    };

export interface PanelContextValue {
  // --- New independent panel states ---
  fileTreeOpen: boolean;
  setFileTreeOpen: (open: boolean) => void;
  gitPanelOpen: boolean;
  setGitPanelOpen: (open: boolean) => void;
  previewOpen: boolean;
  setPreviewOpen: (open: boolean) => void;
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  dashboardPanelOpen: boolean;
  setDashboardPanelOpen: (open: boolean) => void;
  assistantPanelOpen: boolean;
  setAssistantPanelOpen: (open: boolean) => void;
  isAssistantWorkspace: boolean;
  setIsAssistantWorkspace: (is: boolean) => void;

  // --- Git summary (for top bar, derived — no setters) ---
  currentBranch: string;
  gitDirtyCount: number;
  currentWorktreeLabel: string;
  setCurrentWorktreeLabel: (label: string) => void;

  // --- Preserved from old API ---
  workingDirectory: string;
  setWorkingDirectory: (dir: string) => void;
  sessionId: string;
  setSessionId: (id: string) => void;
  sessionTitle: string;
  setSessionTitle: (title: string) => void;
  streamingSessionId: string;
  setStreamingSessionId: (id: string) => void;
  pendingApprovalSessionId: string;
  setPendingApprovalSessionId: (id: string) => void;
  /** All sessions with active streams (supports multi-session streaming) */
  activeStreamingSessions: Set<string>;
  /** All sessions with pending permission approval */
  pendingApprovalSessionIds: Set<string>;
  /**
   * Primary preview source (new API). Use this for all new callers —
   * especially Phase 2 (Artifact .jsx/.tsx preview) and Phase 5.4
   * (table Artifact) which need `inline-*` kinds.
   */
  previewSource: PreviewSource | null;
  setPreviewSource: (source: PreviewSource | null) => void;

  /**
   * Legacy file-only API — preserved as a derived adapter.
   *
   * `previewFile` is non-null only when `previewSource.kind === 'file'`,
   * so reading it stays backward-compatible for existing callers like
   * FileTreePanel's toggle logic.
   *
   * `setPreviewFile(path)` is a thin wrapper that produces
   * `setPreviewSource(path ? { kind: 'file', filePath: path } : null)`.
   * Note: this adapter is one-way — you cannot set an inline-* source
   * through setPreviewFile; use setPreviewSource directly.
   */
  previewFile: string | null;
  setPreviewFile: (path: string | null) => void;

  previewViewMode: PreviewViewMode;
  setPreviewViewMode: (mode: PreviewViewMode) => void;
}

export const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanel(): PanelContextValue {
  const ctx = useContext(PanelContext);
  if (!ctx) {
    throw new Error("usePanel must be used within a PanelProvider");
  }
  return ctx;
}
