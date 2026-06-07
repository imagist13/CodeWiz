"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ArrowClockwise,
  Brain,
  CheckCircle,
  HardDrives,
  WarningCircle,
  XCircle,
  SpinnerGap,
} from "@/components/ui/icon";
import { SettingsCard } from "@/components/patterns/SettingsCard";
import { FieldRow } from "@/components/patterns/FieldRow";
import { StatusBanner } from "@/components/patterns/StatusBanner";
import type { TranslationKey } from "@/i18n/en";
import type { ApiProvider } from "@/types";

interface KnowledgeStats {
  count: number;
  dimension: number;
  embeddingModel: string;
  lastIndexed: string | null;
}

interface ProvidersResponse {
  providers: ApiProvider[];
  default_provider_id: string;
}

const EMBEDDING_MODELS = [
  { value: "text-embedding-3-small", label: "text-embedding-3-small (1536d)", hint: "OpenAI / OpenRouter / DeepSeek" },
  { value: "text-embedding-3-large", label: "text-embedding-3-large (3072d)", hint: "OpenAI — higher accuracy, slower" },
  { value: "text-embedding-ada-002", label: "text-embedding-ada-002 (1536d)", hint: "Legacy OpenAI model" },
  { value: "gemini-embedding-exp-03-07", label: "Gemini Embedding (768d)", hint: "Google Gemini — multilingual" },
  { value: "nomic-embed-text", label: "nomic-embed-text (768d)", hint: "Ollama — 本地部署，免费" },
  { value: "bge-large-zh-v1.5", label: "bge-large-zh-v1.5 (1024d)", hint: "Ollama — 中文 embedding" },
] as const;

export function KnowledgeSettings() {
  const { t } = useTranslation();

  const [enabled, setEnabled] = useState(false);
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string>("");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState("text-embedding-3-small");
  const [threshold, setThreshold] = useState(0.65);
  const [limit, setLimit] = useState(3);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexSuccess, setIndexSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workspacePath, setWorkspacePath] = useState<string>("");
  const [noWorkspace, setNoWorkspace] = useState(false);
  const [indexErrorShown, setIndexErrorShown] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/app");
      if (res.ok) {
        const data = await res.json();
        const appSettings = data.settings || {};
        setEnabled(appSettings.knowledge_enabled === "true");
        setSelectedProviderId(
          appSettings.knowledge_embedding_provider || ""
        );
        setSelectedModel(
          appSettings.knowledge_embedding_model || "text-embedding-3-small"
        );
        setThreshold(
          parseFloat(appSettings.knowledge_injection_threshold || "0.65")
        );
        setLimit(parseInt(appSettings.knowledge_limit || "3", 10));
        setWorkspacePath(appSettings.assistant_workspace_path || "");
        setNoWorkspace(!appSettings.assistant_workspace_path);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/providers");
      if (res.ok) {
        const data = (await res.json()) as ProvidersResponse;
        setProviders(data.providers || []);
        setDefaultProviderId(data.default_provider_id || "");
      }
    } catch { /* ignore */ }
  }, []);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/knowledge");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setIndexError(null);
      } else if (res.status === 400) {
        setStats(null);
      }
    } catch {
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
    void fetchProviders();
    void fetchStats();
  }, [fetchSettings, fetchProviders, fetchStats]);

  const saveSettings = useCallback(
    async (updates: Record<string, string>) => {
      setSaving(true);
      try {
        await fetch("/api/settings/app", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: updates }),
        });
        await fetchSettings();
      } finally {
        setSaving(false);
      }
    },
    [fetchSettings]
  );

  const handleEnabledToggle = (checked: boolean) => {
    setEnabled(checked);
    void saveSettings({ knowledge_enabled: checked ? "true" : "" });
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    void saveSettings({ knowledge_embedding_provider: providerId });
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    void saveSettings({ knowledge_embedding_model: model });
  };

  const handleThresholdChange = (value: number) => {
    setThreshold(value);
    void saveSettings({ knowledge_injection_threshold: String(value) });
  };

  const handleLimitChange = (value: number) => {
    setLimit(value);
    void saveSettings({ knowledge_limit: String(value) });
  };

  const handleReindex = useCallback(async () => {
    setIndexing(true);
    setIndexError(null);
    setIndexSuccess(false);
    try {
      const res = await fetch("/api/knowledge", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setIndexSuccess(true);
        await fetchStats();
        setTimeout(() => setIndexSuccess(false), 5000);
      } else {
        setIndexError(data.error || "Indexing failed");
      }
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setIndexing(false);
    }
  }, [fetchStats]);

  const selectedModelInfo = EMBEDDING_MODELS.find(
    (m) => m.value === selectedModel
  );

  const hasProviders = providers.length > 0 || !!defaultProviderId;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">{t("settings.knowledge.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.knowledge.description")}
        </p>
      </div>

      {/* No workspace configured */}
      {noWorkspace && (
        <StatusBanner variant="warning">
          <WarningCircle size={16} />
          {t("settings.knowledge.noWorkspace")}
        </StatusBanner>
      )}

      {/* Workspace path */}
      {workspacePath && (
        <SettingsCard>
          <FieldRow
            label={t("settings.knowledge.workspacePath")}
            description={t("settings.knowledge.workspacePathDesc")}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono truncate max-w-xs">
              <HardDrives size={14} />
              <span className="truncate">{workspacePath}</span>
            </div>
          </FieldRow>
        </SettingsCard>
      )}

      {/* Enable toggle */}
      <SettingsCard>
        <FieldRow
          label={t("settings.knowledge.enable")}
          description={t("settings.knowledge.enableDesc")}
        >
          <Switch checked={enabled} onCheckedChange={handleEnabledToggle} />
        </FieldRow>
      </SettingsCard>

      {/* Provider & model selection */}
      {enabled && (
        <>
          <SettingsCard>
            {/* Compatibility notice */}
            <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                <WarningCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Embedding 需要专用 API 端点</div>
                  <div className="mt-1 text-xs opacity-80">
                    大多数 Claude API 提供商（如 MiniMax、GLM、Kimi）仅提供 Messages API，
                    不支持 <code>/embeddings</code> 端点。
                    推荐使用：<strong>OpenAI</strong>、<strong>Azure OpenAI</strong>、
                    <strong>OpenRouter</strong>、或自行部署的 <strong>Ollama + nomic-embed-text</strong>。
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <FieldRow
                label={t("settings.knowledge.embeddingProvider")}
                description={t("settings.knowledge.embeddingProviderDesc")}
              >
                <select
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm w-48"
                  value={selectedProviderId}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  <option value="">{t("settings.knowledge.useDefaultProvider")}</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </FieldRow>

              <FieldRow
                label={t("settings.knowledge.embeddingModel")}
                description={t("settings.knowledge.embeddingModelDesc")}
              >
                <select
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm w-64"
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                >
                  {EMBEDDING_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </FieldRow>

              {/* Contextual hint based on selected model */}
              {(() => {
                const model = EMBEDDING_MODELS.find(m => m.value === selectedModel);
                if (!model?.hint) return null;
                return (
                  <p className="text-xs text-muted-foreground -mt-2">
                    {model.hint}
                  </p>
                );
              })()}
            </div>
          </SettingsCard>

          {/* Threshold & limit */}
          <SettingsCard>
            <div className="space-y-5">
              <FieldRow
                label={`${t("settings.knowledge.threshold")} — ${threshold.toFixed(2)}`}
                description={t("settings.knowledge.thresholdDesc")}
              >
                <input
                  type="range"
                  min={0.3}
                  max={0.9}
                  step={0.05}
                  value={threshold}
                  onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
                  className="w-48 h-1.5 accent-primary cursor-pointer"
                />
              </FieldRow>

              <FieldRow
                label={`${t("settings.knowledge.maxResults")} — ${limit}`}
                description={t("settings.knowledge.maxResultsDesc")}
              >
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={limit}
                  onChange={(e) => handleLimitChange(parseInt(e.target.value, 10))}
                  className="w-48 h-1.5 accent-primary cursor-pointer"
                />
              </FieldRow>
            </div>
          </SettingsCard>

          {/* Index stats */}
          <SettingsCard>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {t("settings.knowledge.indexStats")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fetchStats()}
                  disabled={loadingStats}
                >
                  <ArrowClockwise size={14} className={loadingStats ? "animate-spin" : ""} />
                </Button>
              </div>

              {loadingStats && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <SpinnerGap size={14} className="animate-spin" />
                  {t("settings.knowledge.loading")}
                </div>
              )}

              {!loadingStats && !stats && !indexError && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <XCircle size={14} className="text-muted-foreground" />
                  {t("settings.knowledge.notIndexed")}
                </div>
              )}

              {!loadingStats && stats && stats.count === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <WarningCircle size={14} />
                  {t("settings.knowledge.zeroChunks")}
                </div>
              )}

              {!loadingStats && stats && stats.count > 0 && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">
                      {t("settings.knowledge.chunksIndexed")}
                    </div>
                    <div className="font-mono font-medium">{stats.count.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">
                      {t("settings.knowledge.embeddingDimension")}
                    </div>
                    <div className="font-mono font-medium">{stats.dimension}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">
                      {t("settings.knowledge.embeddingModelLabel")}
                    </div>
                    <div className="font-mono font-medium text-xs truncate">
                      {stats.embeddingModel || selectedModel}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">
                      {t("settings.knowledge.lastIndexed")}
                    </div>
                    <div className="font-mono font-medium text-xs">
                      {stats.lastIndexed
                        ? new Date(stats.lastIndexed).toLocaleString()
                        : "—"}
                    </div>
                  </div>
                </div>
              )}

              {indexError && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <XCircle size={14} className="mt-0.5 shrink-0" />
                  <span className="text-xs">{indexError}</span>
                </div>
              )}

              {indexSuccess && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle size={14} />
                  {t("settings.knowledge.indexSuccess")}
                </div>
              )}
            </div>
          </SettingsCard>

          {/* Reindex button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleReindex}
              disabled={indexing || noWorkspace}
              variant="default"
            >
              {indexing ? (
                <SpinnerGap size={14} className="animate-spin" />
              ) : (
                <ArrowClockwise size={14} />
              )}
              <span className="ml-2">
                {indexing
                  ? t("settings.knowledge.indexing")
                  : t("settings.knowledge.reindex")}
              </span>
            </Button>

            {stats && stats.count > 0 && (
              <span className="text-sm text-muted-foreground">
                {t("settings.knowledge.reindexHint")}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
