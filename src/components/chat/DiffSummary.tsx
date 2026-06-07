'use client';

import { cn } from '@/lib/utils';
import { Eye, Image, NotePencil } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import {
  Artifact,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactDescription,
  ArtifactContent,
} from '@/components/ai-elements/artifact';
import { useTranslation } from '@/hooks/useTranslation';

/**
 * Per-row metadata produced by MessageItem when an assistant turn writes or
 * edits files.
 *
 * `path` is the full filesystem path; `name` is the basename shown in the
 * card title. `operation` distinguishes create from edit — used for the
 * "Created" / "Modified" label in the card description. When MessageItem
 * does not know (e.g. a tool name not in the create set), leave it
 * undefined and the card will fall back to "Modified".
 */
export type DiffFile = {
  path: string;
  name: string;
  operation?: 'created' | 'modified';
};

export interface DiffSummaryProps {
  files: DiffFile[];
  /**
   * Called when the user clicks "Open preview". When omitted, no card is
   * rendered for previewable files (they fall back to the compact "also
   * modified" line) — this keeps behavior identical for callers that
   * haven't opted into the Artifact surface yet.
   */
  onPreview?: (file: DiffFile) => void;
  /**
   * Called when the user clicks "Export long screenshot". Phase 3 wires
   * this to the artifact:export-long-shot IPC; leave undefined to hide
   * the button per row.
   */
  onExportLongShot?: (file: DiffFile) => void;
}

/**
 * Extensions that get a dedicated Artifact card with an open button.
 * Kept in sync with PreviewPanel's RENDERABLE_EXTENSIONS (Phase 2.2 will
 * extend both to .jsx/.tsx once Sandpack lands).
 */
const PREVIEWABLE = new Set(['.md', '.mdx', '.html', '.htm', '.jsx', '.tsx', '.csv', '.tsv']);

/**
 * Extensions where "Export long shot" is a meaningful action *today*.
 *
 * Only HTML is here because the current export pipeline sends the raw
 * file contents to the hidden-BrowserWindow → PNG path. For .jsx/.tsx,
 * the raw content is source code, not a rendered page — letting that
 * through would hand users a PNG of their TSX source instead of the
 * Sandpack preview they're looking at. (Codex P2.)
 *
 * Re-adds .jsx/.tsx once a Sandpack-to-HTML or iframe-capture path
 * (POC 0.3 §X-jsx-1 / X-jsx-2) ships in a later phase.
 */
const LONGSHOT = new Set(['.html', '.htm']);

function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

/**
 * A single Artifact card for one previewable file.
 *
 * Layout: <Artifact> wrapper → header (filename + path + operation tag)
 * → content region with action buttons. The buttons are deliberately
 * large and always-visible — not hover-revealed icons — so users can
 * see the entry at a glance without discovering it by accident.
 */
function ArtifactFileCard({
  file,
  onPreview,
  onExportLongShot,
}: {
  file: DiffFile;
  onPreview?: (file: DiffFile) => void;
  onExportLongShot?: (file: DiffFile) => void;
}) {
  const { t } = useTranslation();
  const ext = getExt(file.name);
  const canPreview = !!onPreview && PREVIEWABLE.has(ext);
  const canExport = !!onExportLongShot && LONGSHOT.has(ext);
  const label = file.operation === 'created' ? 'Created' : 'Modified';

  return (
    <Artifact className="mt-2">
      <ArtifactHeader className="py-2">
        <div className="min-w-0 flex-1">
          <ArtifactTitle className="truncate flex items-center gap-1.5">
            <NotePencil size={12} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{file.name}</span>
          </ArtifactTitle>
          <ArtifactDescription
            className="truncate text-xs mt-0.5"
            title={file.path}
          >
            <span className="font-mono text-[10px] text-muted-foreground/60">{file.path}</span>
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span
              className={cn(
                'inline-block rounded px-1 py-0 text-[10px] font-medium',
                file.operation === 'created'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
              )}
            >
              {label}
            </span>
          </ArtifactDescription>
        </div>
      </ArtifactHeader>
      {(canPreview || canExport) && (
        <ArtifactContent className="flex flex-wrap items-center gap-2 p-3">
          {canPreview && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onPreview?.(file)}
              className="gap-1.5"
            >
              <Eye size={14} />
              {t('diffSummary.openPreview')}
            </Button>
          )}
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportLongShot?.(file)}
              className="gap-1.5"
            >
              <Image size={14} />
              {t('diffSummary.exportLongShot')}
            </Button>
          )}
        </ArtifactContent>
      )}
    </Artifact>
  );
}

/**
 * Summary of files written or edited by the last assistant turn.
 *
 * Layout strategy: previewable files (extension in PREVIEWABLE set + caller
 * passed onPreview) render as individual Artifact cards — big visible entry
 * with an "Open preview" button. Other files (code, config, etc.) are
 * collapsed into a single trailing line "Also modified: foo.ts, bar.json"
 * to avoid flooding the message with no-op cards.
 *
 * Why no fold/unfold header: we want the preview entry visible at first
 * glance. If a future turn produces many cards (e.g. 10+ previewable
 * files), we can add a per-card collapse, not a list-level one.
 */
export function DiffSummary({ files, onPreview, onExportLongShot }: DiffSummaryProps) {
  const previewable = files.filter(
    (f) => !!onPreview && PREVIEWABLE.has(getExt(f.name)),
  );
  const others = files.filter(
    (f) => !onPreview || !PREVIEWABLE.has(getExt(f.name)),
  );

  if (previewable.length === 0 && others.length === 0) return null;

  return (
    <div className="mt-2">
      {previewable.map((f) => (
        <ArtifactFileCard
          key={f.path}
          file={f}
          onPreview={onPreview}
          onExportLongShot={onExportLongShot}
        />
      ))}
      {others.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <NotePencil size={10} className="shrink-0" />
          <span className="truncate">
            {previewable.length > 0 ? 'Also modified: ' : 'Modified: '}
            {others.map((f) => f.name).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
