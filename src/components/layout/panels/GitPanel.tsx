"use client";

import { useState, useCallback } from "react";
import { X, ArrowClockwise } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { usePanel } from "@/hooks/usePanel";
import { useTranslation } from "@/hooks/useTranslation";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { GitPanel } from "@/components/git/GitPanel";

const GIT_MIN_WIDTH = 280;
const GIT_MAX_WIDTH = 600;
const GIT_DEFAULT_WIDTH = 360;

export function GitPanelContainer() {
  const { setGitPanelOpen } = usePanel();
  const { t } = useTranslation();
  const [width, setWidth] = useState(GIT_DEFAULT_WIDTH);

  const handleResize = useCallback((delta: number) => {
    setWidth((w) => Math.min(GIT_MAX_WIDTH, Math.max(GIT_MIN_WIDTH, w - delta)));
  }, []);

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent('git-refresh'));
  };

  return (
    <div className="flex h-full shrink-0 overflow-hidden">
      <ResizeHandle side="left" onResize={handleResize} />
      <div className="flex h-full flex-1 flex-col overflow-hidden border-r border-border/40 bg-background" style={{ width }}>
        <div className="flex h-10 shrink-0 items-center justify-between px-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('git.title')}
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRefresh}
            >
              <ArrowClockwise size={14} />
              <span className="sr-only">{t('git.refresh')}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setGitPanelOpen(false)}
            >
              <X size={14} />
              <span className="sr-only">{t('common.close')}</span>
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <GitPanel />
        </div>
      </div>
    </div>
  );
}
