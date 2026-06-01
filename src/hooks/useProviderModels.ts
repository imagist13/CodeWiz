import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ProviderModelGroup } from '@/types';

// Default Claude model options — used as fallback when API is unavailable
export interface DefaultModelOption {
  value: string;
  label: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
}

export const DEFAULT_MODEL_OPTIONS: DefaultModelOption[] = [
  {
    value: 'sonnet',
    label: 'Sonnet 4.6',
    supportsEffort: true,
    supportedEffortLevels: ['low', 'medium', 'high', 'max'],
  },
  {
    value: 'opus',
    label: 'Opus 4.7',
    supportsEffort: true,
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    value: 'haiku',
    label: 'Haiku 4.5',
    supportsEffort: true,
    supportedEffortLevels: ['low', 'medium', 'high'],
  },
];

export interface UseProviderModelsReturn {
  providerGroups: ProviderModelGroup[];
  currentProviderIdValue: string;
  modelOptions: typeof DEFAULT_MODEL_OPTIONS;
  currentModelOption: (typeof DEFAULT_MODEL_OPTIONS)[number];
  /** Global default model (model value) */
  globalDefaultModel: string | undefined;
  /** Global default model's provider ID */
  globalDefaultProvider: string | undefined;
}

export function useProviderModels(
  providerId?: string,
  modelName?: string,
): UseProviderModelsReturn {
  const [providerGroups, setProviderGroups] = useState<ProviderModelGroup[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string>('');
  const [globalDefaultModel, setGlobalDefaultModel] = useState<string | undefined>();
  const [globalDefaultProvider, setGlobalDefaultProvider] = useState<string | undefined>();

  const fetchAll = useCallback(() => {
    fetch('/api/providers/models')
      .then((r) => r.json())
      .then((data) => {
        if (data.groups && data.groups.length > 0) {
          setProviderGroups(data.groups);
        } else {
          setProviderGroups([{
            provider_id: 'env',
            provider_name: 'Anthropic',
            provider_type: 'anthropic',
            models: DEFAULT_MODEL_OPTIONS,
          }]);
        }
        setDefaultProviderId(data.default_provider_id || '');
      })
      .catch(() => {
        setProviderGroups([{
          provider_id: 'env',
          provider_name: 'Anthropic',
          provider_type: 'anthropic',
          models: DEFAULT_MODEL_OPTIONS,
        }]);
        setDefaultProviderId('');
      });

    // Fetch global default model
    fetch('/api/providers/options?providerId=__global__')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setGlobalDefaultModel(data?.options?.default_model || undefined);
        setGlobalDefaultProvider(data?.options?.default_model_provider || undefined);
      })
      .catch(() => {});
  }, []);

  // Load on mount and listen for provider changes
  useEffect(() => {
    fetchAll();
    const handler = () => fetchAll();
    window.addEventListener('provider-changed', handler);
    return () => window.removeEventListener('provider-changed', handler);
  }, [fetchAll]);

  // Derive flat model list for current provider
  // Use globalDefaultProvider as fallback instead of the legacy default_provider_id
  const currentProviderIdValue = providerId || globalDefaultProvider || defaultProviderId || (providerGroups[0]?.provider_id ?? '');
  const currentGroup = providerGroups.find(g => g.provider_id === currentProviderIdValue) || providerGroups[0];
  const modelOptions = (currentGroup?.models && currentGroup.models.length > 0)
    ? currentGroup.models
    : DEFAULT_MODEL_OPTIONS;

  const currentModelValue = modelName || 'sonnet';
  const currentModelOption = useMemo(
    () => modelOptions.find((m) => m.value === currentModelValue) || modelOptions[0],
    [modelOptions, currentModelValue],
  );

  return {
    providerGroups,
    currentProviderIdValue,
    modelOptions,
    currentModelOption,
    globalDefaultModel,
    globalDefaultProvider,
  };
}
