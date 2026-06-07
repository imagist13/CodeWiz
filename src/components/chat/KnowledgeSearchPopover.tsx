'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Brain, MagnifyingGlass } from '@/components/ui/icon';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n';

interface KnowledgeSearchResult {
  file_path: string;
  heading: string;
  snippet: string;
  score: number;
  start_line: number | null;
  end_line: number | null;
  chunk_id: string;
}

interface KnowledgeSearchPopoverProps {
  /** Whether the popover is open */
  open: boolean;
  /** Current search query */
  query: string;
  /** Callback to close the popover */
  onClose: () => void;
  /** Callback when a result is selected — inserts text into the input */
  onInsert: (text: string) => void;
  /** Ref to the container element for positioning */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function KnowledgeSearchPopover({
  open,
  query,
  onClose,
  onInsert,
  containerRef,
}: KnowledgeSearchPopoverProps) {
  const { t } = useTranslation();
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchInput, setSearchInput] = useState(query);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearchInput(query);
      setSelectedIndex(0);
      setResults([]);
      setError(null);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open, query]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/knowledge/search?q=${encodeURIComponent(q)}&limit=8`
      );
      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
        setSelectedIndex(0);
      } else {
        setError(data.error || 'Search failed');
        setResults([]);
      }
    } catch (e) {
      setError(String(e));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          insertResult(results[selectedIndex]);
        } else if (searchInput.trim()) {
          void doSearch(searchInput);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [results, selectedIndex, searchInput, doSearch, onClose]
  );

  const insertResult = useCallback(
    (result: KnowledgeSearchResult) => {
      const lineRange =
        result.start_line != null && result.end_line != null
          ? `:${result.start_line}-${result.end_line}`
          : '';
      const text = `@[${result.file_path}${lineRange}](${result.file_path})\n${result.snippet}`;
      onInsert(text);
      onClose();
    },
    [onInsert, onClose]
  );

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 z-50 mb-2"
      style={{ position: 'absolute' }}
    >
      <div className="bg-background border border-border rounded-xl shadow-xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
          <Brain size={16} className="text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              void doSearch(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.knowledgeSearchPlaceholder' as TranslationKey) || 'Search knowledge base...'}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && (
            <span className="text-xs text-muted-foreground animate-spin">...</span>
          )}
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {error && (
            <div className="px-3 py-2 text-xs text-destructive">{error}</div>
          )}

          {!error && results.length === 0 && searchInput.trim() && !loading && (
            <div className="px-3 py-3 text-xs text-muted-foreground text-center">
              {t('chat.knowledgeNoResults' as TranslationKey) || 'No results found'}
            </div>
          )}

          {!error && results.length > 0 && (
            <ul className="py-1">
              {results.map((result, idx) => (
                <li
                  key={result.chunk_id}
                  className={`px-3 py-2 cursor-pointer flex items-start gap-2 ${
                    idx === selectedIndex
                      ? 'bg-accent'
                      : 'hover:bg-accent/50'
                  }`}
                  onClick={() => insertResult(result)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <MagnifyingGlass
                    size={14}
                    className="mt-0.5 shrink-0 text-muted-foreground"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono truncate max-w-[160px]">
                        {result.file_path}
                      </span>
                      {result.heading && (
                        <span className="text-xs text-muted-foreground truncate">
                          / {result.heading}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                        {(result.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {result.snippet.slice(0, 150)}
                      {result.snippet.length > 150 ? '...' : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!error && results.length === 0 && !searchInput.trim() && (
            <div className="px-3 py-3 text-xs text-muted-foreground text-center">
              {t('chat.knowledgeSearchHint' as TranslationKey) ||
                'Type to search your knowledge base'}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 border-t border-border/50 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>
            <kbd className="font-mono bg-muted px-1 py-0.5 rounded">↑↓</kbd>{' '}
            navigate
          </span>
          <span>
            <kbd className="font-mono bg-muted px-1 py-0.5 rounded">↵</kbd>{' '}
            insert
          </span>
          <span>
            <kbd className="font-mono bg-muted px-1 py-0.5 rounded">esc</kbd>{' '}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
