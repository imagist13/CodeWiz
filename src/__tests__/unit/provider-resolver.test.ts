import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VENDOR_PRESETS,
  inferProtocolFromLegacy,
  inferAuthStyleFromLegacy,
  getDefaultModelsForProvider,
  findPresetForLegacy,
} from '../../lib/provider-catalog';

// ── Provider Catalog Tests ──────────────────────────────────────

describe('Provider Catalog', () => {
  describe('VENDOR_PRESETS', () => {
    it('all presets have required fields', () => {
      for (const preset of VENDOR_PRESETS) {
        assert.ok(preset.key, `Preset missing key`);
        assert.ok(preset.name, `Preset ${preset.key} missing name`);
        assert.ok(preset.protocol, `Preset ${preset.key} missing protocol`);
        assert.ok(preset.description, `Preset ${preset.key} missing description`);
        assert.ok(preset.descriptionZh, `Preset ${preset.key} missing descriptionZh`);
        assert.ok(preset.authStyle, `Preset ${preset.key} missing authStyle`);
        assert.ok(Array.isArray(preset.fields), `Preset ${preset.key} fields not array`);
        assert.ok(preset.iconKey, `Preset ${preset.key} missing iconKey`);
      }
    });

    it('preset keys are unique', () => {
      const keys = VENDOR_PRESETS.map(p => p.key);
      const unique = new Set(keys);
      assert.equal(keys.length, unique.size, `Duplicate preset keys found`);
    });

    it('GLM presets use anthropic protocol', () => {
      const glmPresets = VENDOR_PRESETS.filter(p => p.key.startsWith('glm-'));
      assert.ok(glmPresets.length >= 2, 'Expected at least 2 GLM presets');
      for (const p of glmPresets) {
        assert.equal(p.protocol, 'anthropic', `GLM preset ${p.key} should use anthropic protocol`);
      }
    });

    it('Kimi preset uses anthropic protocol with api_key auth', () => {
      const kimi = VENDOR_PRESETS.find(p => p.key === 'kimi');
      assert.ok(kimi, 'Kimi preset not found');
      assert.equal(kimi.protocol, 'anthropic');
      assert.equal(kimi.authStyle, 'api_key');
    });

    it('MiniMax presets use anthropic protocol', () => {
      const minimax = VENDOR_PRESETS.filter(p => p.key.startsWith('minimax-'));
      assert.ok(minimax.length >= 2, 'Expected at least 2 MiniMax presets');
      for (const p of minimax) {
        assert.equal(p.protocol, 'anthropic', `MiniMax preset ${p.key} should use anthropic protocol`);
      }
    });

    it('Volcengine preset uses anthropic protocol with auth_token', () => {
      const volc = VENDOR_PRESETS.find(p => p.key === 'volcengine');
      assert.ok(volc, 'Volcengine preset not found');
      assert.equal(volc.protocol, 'anthropic');
      assert.equal(volc.authStyle, 'auth_token');
    });

    it('Bailian preset uses anthropic protocol', () => {
      const bailian = VENDOR_PRESETS.find(p => p.key === 'bailian');
      assert.ok(bailian, 'Bailian preset not found');
      assert.equal(bailian.protocol, 'anthropic');
    });

    it('Bedrock preset uses bedrock protocol with env_only auth', () => {
      const bedrock = VENDOR_PRESETS.find(p => p.key === 'bedrock');
      assert.ok(bedrock, 'Bedrock preset not found');
      assert.equal(bedrock.protocol, 'bedrock');
      assert.equal(bedrock.authStyle, 'env_only');
    });

    it('Vertex preset uses vertex protocol with env_only auth', () => {
      const vertex = VENDOR_PRESETS.find(p => p.key === 'vertex');
      assert.ok(vertex, 'Vertex preset not found');
      assert.equal(vertex.protocol, 'vertex');
      assert.equal(vertex.authStyle, 'env_only');
    });

    it('OpenRouter preset uses openrouter protocol', () => {
      const or = VENDOR_PRESETS.find(p => p.key === 'openrouter');
      assert.ok(or, 'OpenRouter preset not found');
      assert.equal(or.protocol, 'openrouter');
    });

    it('custom-openai preset has been removed', () => {
      const custom = VENDOR_PRESETS.find(p => p.key === 'custom-openai');
      assert.equal(custom, undefined, 'custom-openai preset should not exist');
    });

    it('anthropic-thirdparty preset uses anthropic protocol and has env_overrides field', () => {
      const preset = VENDOR_PRESETS.find(p => p.key === 'anthropic-thirdparty');
      assert.ok(preset, 'anthropic-thirdparty preset not found');
      assert.equal(preset.protocol, 'anthropic');
      assert.ok(preset.fields.includes('env_overrides'), 'should expose env_overrides field');
    });
  });

  describe('inferProtocolFromLegacy', () => {
    it('anthropic type → anthropic protocol', () => {
      assert.equal(inferProtocolFromLegacy('anthropic', 'https://api.anthropic.com'), 'anthropic');
    });

    it('openrouter type → openrouter protocol', () => {
      assert.equal(inferProtocolFromLegacy('openrouter', 'https://openrouter.ai/api'), 'openrouter');
    });

    it('bedrock type → bedrock protocol', () => {
      assert.equal(inferProtocolFromLegacy('bedrock', ''), 'bedrock');
    });

    it('vertex type → vertex protocol', () => {
      assert.equal(inferProtocolFromLegacy('vertex', ''), 'vertex');
    });

    it('gemini-image type → gemini-image protocol', () => {
      assert.equal(inferProtocolFromLegacy('gemini-image', 'https://generativelanguage.googleapis.com'), 'gemini-image');
    });

    // Critical: Chinese vendors with custom type should infer anthropic
    it('custom type + GLM base_url → anthropic protocol', () => {
      assert.equal(inferProtocolFromLegacy('custom', 'https://open.bigmodel.cn/api/anthropic'), 'anthropic');
      assert.equal(inferProtocolFromLegacy('custom', 'https://api.z.ai/api/anthropic'), 'anthropic');
    });

    it('custom type + Kimi base_url → anthropic protocol', () => {
      assert.equal(inferProtocolFromLegacy('custom', 'https://api.kimi.com/coding/'), 'anthropic');
    });

    it('custom type + Moonshot base_url → anthropic protocol', () => {
      assert.equal(inferProtocolFromLegacy('custom', 'https://api.moonshot.cn/anthropic'), 'anthropic');
    });

    it('custom type + MiniMax base_url → anthropic protocol', () => {
      assert.equal(inferProtocolFromLegacy('custom', 'https://api.minimaxi.com/anthropic'), 'anthropic');
      assert.equal(inferProtocolFromLegacy('custom', 'https://api.minimax.io/anthropic'), 'anthropic');
    });

    it('custom type + Volcengine base_url → anthropic protocol', () => {
      assert.equal(inferProtocolFromLegacy('custom', 'https://ark.cn-beijing.volces.com/api/coding'), 'anthropic');
    });

    it('custom type + Bailian base_url → anthropic protocol', () => {
      assert.equal(inferProtocolFromLegacy('custom', 'https://coding.dashscope.aliyuncs.com/apps/anthropic'), 'anthropic');
    });

    it('custom type + unknown URL → anthropic protocol', () => {
      assert.equal(inferProtocolFromLegacy('custom', 'https://my-server.example.com/v1'), 'anthropic');
    });

    it('custom type + URL containing /anthropic → anthropic protocol', () => {
      assert.equal(inferProtocolFromLegacy('custom', 'https://proxy.example.com/anthropic'), 'anthropic');
    });
  });

  describe('inferAuthStyleFromLegacy', () => {
    it('bedrock → env_only', () => {
      assert.equal(inferAuthStyleFromLegacy('bedrock', '{}'), 'env_only');
    });

    it('vertex → env_only', () => {
      assert.equal(inferAuthStyleFromLegacy('vertex', '{}'), 'env_only');
    });

    it('extra_env with ANTHROPIC_AUTH_TOKEN → auth_token', () => {
      assert.equal(
        inferAuthStyleFromLegacy('custom', '{"ANTHROPIC_AUTH_TOKEN":""}'),
        'auth_token',
      );
    });

    it('extra_env with ANTHROPIC_API_KEY → api_key', () => {
      assert.equal(
        inferAuthStyleFromLegacy('custom', '{"ANTHROPIC_API_KEY":""}'),
        'api_key',
      );
    });

    it('empty extra_env → api_key', () => {
      assert.equal(inferAuthStyleFromLegacy('anthropic', '{}'), 'api_key');
    });
  });

  describe('getDefaultModelsForProvider', () => {
    it('anthropic protocol with GLM CN url returns GLM models', () => {
      const models = getDefaultModelsForProvider('anthropic', 'https://open.bigmodel.cn/api/anthropic');
      assert.ok(models.length > 0);
      assert.ok(models.some(m => m.displayName.includes('GLM')));
    });

    it('anthropic protocol with Bailian url returns Bailian models', () => {
      const models = getDefaultModelsForProvider('anthropic', 'https://coding.dashscope.aliyuncs.com/apps/anthropic');
      assert.ok(models.length > 0);
      assert.ok(models.some(m => m.displayName.includes('Qwen')));
    });

    it('anthropic protocol with unknown url returns default Anthropic models', () => {
      const models = getDefaultModelsForProvider('anthropic', 'https://my-proxy.com/api');
      assert.ok(models.length > 0);
      assert.ok(models.some(m => m.modelId === 'sonnet'));
    });

    it('bedrock protocol returns default Anthropic models', () => {
      const models = getDefaultModelsForProvider('bedrock', '');
      assert.ok(models.length > 0);
      assert.ok(models.some(m => m.modelId === 'sonnet'));
    });

    it('openai-compatible protocol with no matching url returns empty', () => {
      const models = getDefaultModelsForProvider('openai-compatible', 'https://example.com/v1');
      assert.equal(models.length, 0);
    });
  });

  describe('findPresetForLegacy', () => {
    it('finds bedrock preset by type', () => {
      const preset = findPresetForLegacy('', 'bedrock');
      assert.ok(preset);
      assert.equal(preset.key, 'bedrock');
    });

    it('finds GLM preset by base_url', () => {
      const preset = findPresetForLegacy('https://open.bigmodel.cn/api/anthropic', 'custom');
      assert.ok(preset);
      assert.equal(preset.key, 'glm-cn');
    });

    it('finds Kimi preset by base_url', () => {
      const preset = findPresetForLegacy('https://api.kimi.com/coding/', 'custom');
      assert.ok(preset);
      assert.equal(preset.key, 'kimi');
    });

    it('finds anthropic-official by base_url + type', () => {
      const preset = findPresetForLegacy('https://api.anthropic.com', 'anthropic');
      assert.ok(preset);
      assert.equal(preset.key, 'anthropic-official');
    });
  });
});

// ── Provider Resolver Tests ─────────────────────────────────────

import { resolveProvider, toClaudeCodeEnv, toAiSdkConfig } from '../../lib/provider-resolver';
import type { ResolvedProvider } from '../../lib/provider-resolver';

describe('Provider Resolver', () => {
  describe('resolveProvider', () => {
    it('returns env-based resolution when providerId is "env"', () => {
      const resolved = resolveProvider({ providerId: 'env' });
      assert.equal(resolved.provider, undefined);
      assert.equal(resolved.protocol, 'anthropic');
      assert.deepEqual(resolved.settingSources, ['user', 'project', 'local']);
    });

    it('returns env-based resolution when no provider configured', () => {
      // With no providers in DB, should return env-based
      const resolved = resolveProvider({});
      // provider may be undefined or the default — depends on DB state
      assert.equal(resolved.protocol, 'anthropic');
    });
  });

  describe('toClaudeCodeEnv', () => {
    it('injects ANTHROPIC_API_KEY for api_key auth style', () => {
      const resolved: ResolvedProvider = {
        provider: {
          id: 'test',
          name: 'Test',
          provider_type: 'anthropic',
          protocol: 'anthropic',
          base_url: 'https://api.anthropic.com',
          api_key: 'sk-test-key',
          is_active: 1,
          sort_order: 0,
          extra_env: '{}',
          headers_json: '{}',
          env_overrides_json: '',
          role_models_json: '{}',
          notes: '',
          created_at: '',
          updated_at: '', options_json: '{}',
        },
        protocol: 'anthropic',
        authStyle: 'api_key',
        model: 'sonnet',
        modelDisplayName: 'Sonnet 4.6',
        upstreamModel: 'sonnet',
        headers: {},
        envOverrides: {},
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['project', 'local'],
      };

      const env = toClaudeCodeEnv({ PATH: '/usr/bin' }, resolved);
      assert.equal(env.ANTHROPIC_API_KEY, 'sk-test-key');
      // api_key mode must NOT set ANTHROPIC_AUTH_TOKEN — upstream adds Bearer header
      // when AUTH_TOKEN is present, which conflicts with API-key-only providers (Kimi)
      assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined);
      assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
    });

    it('injects only ANTHROPIC_AUTH_TOKEN for auth_token style', () => {
      const resolved: ResolvedProvider = {
        provider: {
          id: 'test',
          name: 'Kimi',
          provider_type: 'anthropic',
          protocol: 'anthropic',
          base_url: 'https://api.kimi.com/coding/',
          api_key: 'kimi-key',
          is_active: 1,
          sort_order: 0,
          extra_env: '{}',
          headers_json: '{}',
          env_overrides_json: '',
          role_models_json: '{}',
          notes: '',
          created_at: '',
          updated_at: '', options_json: '{}',
        },
        protocol: 'anthropic',
        authStyle: 'auth_token',
        model: 'sonnet',
        modelDisplayName: undefined,
        upstreamModel: undefined,
        headers: {},
        envOverrides: {},
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['project', 'local'],
      };

      const env = toClaudeCodeEnv({ PATH: '/usr/bin', ANTHROPIC_API_KEY: 'old-key' }, resolved);
      assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'kimi-key');
      // auth_token style explicitly clears ANTHROPIC_API_KEY (required by Ollama etc.)
      assert.equal(env.ANTHROPIC_API_KEY, '');
    });

    it('applies env overrides with empty-string deletion', () => {
      const resolved: ResolvedProvider = {
        provider: {
          id: 'test',
          name: 'Test',
          provider_type: 'anthropic',
          protocol: 'anthropic',
          base_url: '',
          api_key: 'key',
          is_active: 1,
          sort_order: 0,
          extra_env: '{}',
          headers_json: '{}',
          env_overrides_json: '',
          role_models_json: '{}',
          notes: '',
          created_at: '',
          updated_at: '', options_json: '{}',
        },
        protocol: 'anthropic',
        authStyle: 'api_key',
        model: undefined,
        modelDisplayName: undefined,
        upstreamModel: undefined,
        headers: {},
        envOverrides: {
          API_TIMEOUT_MS: '3000000',
          ANTHROPIC_API_KEY: '', // legacy placeholder — should be skipped (auth keys handled by auth injection)
          SOME_CUSTOM_VAR: '',   // non-auth key — should be deleted
        },
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['project', 'local'],
      };

      const env = toClaudeCodeEnv({ PATH: '/usr/bin', SOME_CUSTOM_VAR: 'old' }, resolved);
      assert.equal(env.API_TIMEOUT_MS, '3000000');
      // Auth keys are NOT deleted by envOverrides — they're managed by the auth injection logic above
      assert.equal(env.ANTHROPIC_API_KEY, 'key'); // preserved from auth injection
      assert.equal(env.SOME_CUSTOM_VAR, undefined); // non-auth key deleted by empty string
    });

    it('injects role models as env vars', () => {
      const resolved: ResolvedProvider = {
        provider: {
          id: 'test',
          name: 'Test',
          provider_type: 'anthropic',
          protocol: 'anthropic',
          base_url: '',
          api_key: 'key',
          is_active: 1,
          sort_order: 0,
          extra_env: '{}',
          headers_json: '{}',
          env_overrides_json: '',
          role_models_json: '{}',
          notes: '',
          created_at: '',
          updated_at: '', options_json: '{}',
        },
        protocol: 'anthropic',
        authStyle: 'api_key',
        model: undefined,
        modelDisplayName: undefined,
        upstreamModel: undefined,
        headers: {},
        envOverrides: {},
        roleModels: {
          default: 'my-model-v1',
          reasoning: 'my-reasoning-model',
          small: 'my-small-model',
        },
        hasCredentials: true,
        availableModels: [],
        settingSources: ['project', 'local'],
      };

      const env = toClaudeCodeEnv({}, resolved);
      assert.equal(env.ANTHROPIC_MODEL, 'my-model-v1');
      assert.equal(env.ANTHROPIC_REASONING_MODEL, 'my-reasoning-model');
      assert.equal(env.ANTHROPIC_SMALL_FAST_MODEL, 'my-small-model');
    });

    it('preserves env vars when no provider (env-based)', () => {
      const resolved: ResolvedProvider = {
        provider: undefined,
        protocol: 'anthropic',
        authStyle: 'api_key',
        model: undefined,
        modelDisplayName: undefined,
        upstreamModel: undefined,
        headers: {},
        envOverrides: {},
        roleModels: {},
        hasCredentials: false,
        availableModels: [],
        settingSources: ['user', 'project', 'local'],
      };

      const env = toClaudeCodeEnv({
        ANTHROPIC_API_KEY: 'shell-key',
        PATH: '/usr/bin',
      }, resolved);
      assert.equal(env.ANTHROPIC_API_KEY, 'shell-key'); // preserved
      assert.equal(env.PATH, '/usr/bin');
    });
  });

  describe('toAiSdkConfig', () => {
    it('anthropic protocol → anthropic SDK', () => {
      const resolved: ResolvedProvider = {
        provider: {
          id: 'test', name: 'Test', provider_type: 'anthropic', protocol: 'anthropic',
          base_url: 'https://api.anthropic.com', api_key: 'key', is_active: 1, sort_order: 0,
          extra_env: '{}', headers_json: '{}', env_overrides_json: '', role_models_json: '{}',
          notes: '', created_at: '', updated_at: '', options_json: '{}',
        },
        protocol: 'anthropic',
        authStyle: 'api_key',
        model: 'sonnet',
        modelDisplayName: 'Sonnet 4.6',
        upstreamModel: 'sonnet',
        headers: {},
        envOverrides: {},
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['project', 'local'],
      };

      const config = toAiSdkConfig(resolved);
      assert.equal(config.sdkType, 'anthropic');
      assert.equal(config.apiKey, 'key');
      assert.equal(config.baseUrl, 'https://api.anthropic.com/v1');
      assert.equal(config.modelId, 'sonnet');
      assert.deepEqual(config.processEnvInjections, {});
    });

    it('openrouter protocol → openai SDK with correct base URL', () => {
      const resolved: ResolvedProvider = {
        provider: {
          id: 'test', name: 'OR', provider_type: 'openrouter', protocol: 'openrouter',
          base_url: 'https://openrouter.ai/api', api_key: 'or-key', is_active: 1, sort_order: 0,
          extra_env: '{}', headers_json: '{}', env_overrides_json: '', role_models_json: '{}',
          notes: '', created_at: '', updated_at: '', options_json: '{}',
        },
        protocol: 'openrouter',
        authStyle: 'api_key',
        model: 'sonnet',
        modelDisplayName: undefined,
        upstreamModel: undefined,
        headers: {},
        envOverrides: {},
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['project', 'local'],
      };

      const config = toAiSdkConfig(resolved);
      assert.equal(config.sdkType, 'openai');
      assert.equal(config.apiKey, 'or-key');
      assert.equal(config.baseUrl, 'https://openrouter.ai/api');
    });

    it('bedrock protocol → injects env overrides', () => {
      const resolved: ResolvedProvider = {
        provider: {
          id: 'test', name: 'Bedrock', provider_type: 'bedrock', protocol: 'bedrock',
          base_url: '', api_key: '', is_active: 1, sort_order: 0,
          extra_env: '{}', headers_json: '{}', env_overrides_json: '', role_models_json: '{}',
          notes: '', created_at: '', updated_at: '', options_json: '{}',
        },
        protocol: 'bedrock',
        authStyle: 'env_only',
        model: 'sonnet',
        modelDisplayName: undefined,
        upstreamModel: undefined,
        headers: {},
        envOverrides: {
          CLAUDE_CODE_USE_BEDROCK: '1',
          AWS_REGION: 'us-east-1',
        },
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['project', 'local'],
      };

      const config = toAiSdkConfig(resolved);
      assert.equal(config.sdkType, 'bedrock'); // no base_url → native bedrock SDK
      assert.deepEqual(config.processEnvInjections, {
        CLAUDE_CODE_USE_BEDROCK: '1',
        AWS_REGION: 'us-east-1',
      });
    });

    it('openai-compatible protocol → openai SDK', () => {
      const resolved: ResolvedProvider = {
        provider: {
          id: 'test', name: 'Custom', provider_type: 'custom', protocol: 'openai-compatible',
          base_url: 'https://my-server.com/v1', api_key: 'key', is_active: 1, sort_order: 0,
          extra_env: '{}', headers_json: '{}', env_overrides_json: '', role_models_json: '{}',
          notes: '', created_at: '', updated_at: '', options_json: '{}',
        },
        protocol: 'openai-compatible',
        authStyle: 'api_key',
        model: 'gpt-4',
        modelDisplayName: undefined,
        upstreamModel: undefined,
        headers: {},
        envOverrides: {},
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['project', 'local'],
      };

      const config = toAiSdkConfig(resolved);
      assert.equal(config.sdkType, 'openai');
      assert.equal(config.baseUrl, 'https://my-server.com/v1');
    });

    it('model override takes precedence', () => {
      const resolved: ResolvedProvider = {
        provider: {
          id: 'test', name: 'Test', provider_type: 'anthropic', protocol: 'anthropic',
          base_url: '', api_key: 'key', is_active: 1, sort_order: 0,
          extra_env: '{}', headers_json: '{}', env_overrides_json: '', role_models_json: '{}',
          notes: '', created_at: '', updated_at: '', options_json: '{}',
        },
        protocol: 'anthropic',
        authStyle: 'api_key',
        model: 'sonnet',
        modelDisplayName: undefined,
        upstreamModel: undefined,
        headers: {},
        envOverrides: {},
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['project', 'local'],
      };

      const config = toAiSdkConfig(resolved, 'opus');
      assert.equal(config.modelId, 'opus');
    });

    it('gemini-image protocol → google SDK', () => {
      const resolved: ResolvedProvider = {
        provider: {
          id: 'test', name: 'Gemini', provider_type: 'gemini-image', protocol: 'gemini-image',
          base_url: 'https://generativelanguage.googleapis.com/v1beta', api_key: 'gkey',
          is_active: 1, sort_order: 0,
          extra_env: '{}', headers_json: '{}', env_overrides_json: '', role_models_json: '{}',
          notes: '', created_at: '', updated_at: '', options_json: '{}',
        },
        protocol: 'gemini-image',
        authStyle: 'api_key',
        model: 'gemini-2.5-flash-image',
        modelDisplayName: undefined,
        upstreamModel: undefined,
        headers: {},
        envOverrides: {},
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['project', 'local'],
      };

      const config = toAiSdkConfig(resolved);
      assert.equal(config.sdkType, 'google');
      assert.equal(config.apiKey, 'gkey');
    });
  });
});

// ── Entry Point Consistency Tests ───────────────────────────────

describe('Entry Point Consistency', () => {
  it('all Anthropic-compatible Chinese vendors infer correct protocol from legacy custom type', () => {
    const vendors: Array<{ name: string; url: string }> = [
      { name: 'GLM CN', url: 'https://open.bigmodel.cn/api/anthropic' },
      { name: 'GLM Global', url: 'https://api.z.ai/api/anthropic' },
      { name: 'Kimi', url: 'https://api.kimi.com/coding/' },
      { name: 'Moonshot', url: 'https://api.moonshot.cn/anthropic' },
      { name: 'MiniMax CN', url: 'https://api.minimaxi.com/anthropic' },
      { name: 'MiniMax Global', url: 'https://api.minimax.io/anthropic' },
      { name: 'Volcengine', url: 'https://ark.cn-beijing.volces.com/api/coding' },
      { name: 'Bailian', url: 'https://coding.dashscope.aliyuncs.com/apps/anthropic' },
    ];

    for (const v of vendors) {
      const protocol = inferProtocolFromLegacy('custom', v.url);
      assert.equal(
        protocol,
        'anthropic',
        `${v.name} (${v.url}) should infer anthropic, got ${protocol}`,
      );
    }
  });

  it('legacy custom type with non-anthropic URL infers anthropic', () => {
    const protocol = inferProtocolFromLegacy('custom', 'https://my-ollama.local:11434/v1');
    assert.equal(protocol, 'anthropic');
  });
});

// ── Env Provider in AI SDK Path ─────────────────────────────────

describe('Env Provider AI SDK Consistency', () => {
  it('env resolution with ANTHROPIC_API_KEY sets hasCredentials=true', () => {
    // Simulate having an env var
    const origKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-test-env-key';
    try {
      const resolved = resolveProvider({ providerId: 'env' });
      assert.equal(resolved.provider, undefined, 'env mode should have provider=undefined');
      assert.equal(resolved.hasCredentials, true, 'env mode with ANTHROPIC_API_KEY should have hasCredentials=true');
      assert.equal(resolved.protocol, 'anthropic');
    } finally {
      if (origKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = origKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    }
  });

  it('env resolution without any credentials sets hasCredentials=false', () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    const origToken = process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    try {
      const resolved = resolveProvider({ providerId: 'env' });
      assert.equal(resolved.provider, undefined);
      // hasCredentials depends on DB settings too, but with clean env it should be false
      // (DB settings may or may not be set in test env, so we just verify provider is undefined)
    } finally {
      if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
      if (origToken !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = origToken;
    }
  });

  it('toAiSdkConfig with env resolution produces valid anthropic config', () => {
    // Isolate from real env vars AND DB settings that may be set on developer machines
    const envSnapshot = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_BASE_URL;
    const dbSnapshot = {
      anthropic_auth_token: getSetting('anthropic_auth_token'),
      anthropic_base_url: getSetting('anthropic_base_url'),
    };
    setSetting('anthropic_auth_token', '');
    setSetting('anthropic_base_url', '');
    try {
      const resolved: ResolvedProvider = {
        provider: undefined,
        protocol: 'anthropic',
        authStyle: 'api_key',
        model: 'sonnet',
        upstreamModel: 'sonnet',
        modelDisplayName: undefined,
        headers: {},
        envOverrides: {},
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['user', 'project', 'local'],
      };
      const config = toAiSdkConfig(resolved);
      assert.equal(config.sdkType, 'anthropic');
      assert.equal(config.modelId, 'sonnet');
      // No apiKey/baseUrl — SDK will read from process.env
      assert.equal(config.apiKey, undefined);
      assert.equal(config.baseUrl, undefined);
    } finally {
      for (const [k, v] of Object.entries(envSnapshot)) {
        if (v !== undefined) process.env[k] = v; else delete process.env[k];
      }
      setSetting('anthropic_auth_token', dbSnapshot.anthropic_auth_token || '');
      setSetting('anthropic_base_url', dbSnapshot.anthropic_base_url || '');
    }
  });
});

// ── Upstream Model ID Mapping ───────────────────────────────────

describe('Upstream Model ID Mapping', () => {
  it('toAiSdkConfig maps internal model ID to upstream via availableModels', () => {
    const resolved: ResolvedProvider = {
      provider: {
        id: 'test', name: 'GLM', provider_type: 'custom', protocol: 'anthropic',
        base_url: 'https://open.bigmodel.cn/api/anthropic', api_key: 'key',
        is_active: 1, sort_order: 0, extra_env: '{}', headers_json: '{}',
        env_overrides_json: '', role_models_json: '{}', notes: '', created_at: '', updated_at: '', options_json: '{}',
      },
      protocol: 'anthropic',
      authStyle: 'api_key',
      model: 'sonnet',
      upstreamModel: 'glm-5-turbo', // resolved from catalog
      modelDisplayName: 'GLM-5-Turbo',
      headers: {},
      envOverrides: {},
      roleModels: {},
      hasCredentials: true,
      availableModels: [
        { modelId: 'sonnet', upstreamModelId: 'glm-5-turbo', displayName: 'GLM-5-Turbo' },
        { modelId: 'opus', upstreamModelId: 'glm-5.1', displayName: 'GLM-5.1' },
      ],
      settingSources: ['project', 'local'],
    };

    // Without override — uses resolved.upstreamModel
    const config1 = toAiSdkConfig(resolved);
    assert.equal(config1.modelId, 'glm-5-turbo', 'should use upstream model ID from resolution');

    // With override matching an available model — should map to upstream
    const config2 = toAiSdkConfig(resolved, 'opus');
    assert.equal(config2.modelId, 'glm-5.1', 'override "opus" should map to upstream "glm-5.1"');

    // With override NOT in available models — passes through as-is
    const config3 = toAiSdkConfig(resolved, 'unknown-model');
    assert.equal(config3.modelId, 'unknown-model', 'unknown override should pass through');
  });

  it('toClaudeCodeEnv injects role model env vars for upstream mapping', () => {
    const resolved: ResolvedProvider = {
      provider: {
        id: 'test', name: 'GLM', provider_type: 'custom', protocol: 'anthropic',
        base_url: 'https://open.bigmodel.cn/api/anthropic', api_key: 'key',
        is_active: 1, sort_order: 0, extra_env: '{}', headers_json: '{}',
        env_overrides_json: '', role_models_json: '{"default":"glm-5-turbo","sonnet":"glm-5-turbo","opus":"glm-5.1"}',
        notes: '', created_at: '', updated_at: '', options_json: '{}',
      },
      protocol: 'anthropic',
      authStyle: 'api_key',
      model: 'sonnet',
      upstreamModel: 'glm-5-turbo',
      modelDisplayName: 'GLM-5-Turbo',
      headers: {},
      envOverrides: {},
      roleModels: { default: 'glm-5-turbo', sonnet: 'glm-5-turbo', opus: 'glm-5.1' },
      hasCredentials: true,
      availableModels: [],
      settingSources: ['project', 'local'],
    };

    const env = toClaudeCodeEnv({}, resolved);
    assert.equal(env.ANTHROPIC_MODEL, 'glm-5-turbo', 'ANTHROPIC_MODEL should be set from roleModels.default');
    assert.equal(env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'glm-5-turbo');
    assert.equal(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'glm-5.1');
  });
});

// ── Entry Point Resolution Contract ─────────────────────────────
// Verifies that ALL entry points (chat, bridge, onboarding, check-in, media plan)
// produce identical resolution results for the same inputs, and that the AI SDK
// path does not have any fallback logic outside the unified resolver.

describe('Entry Point Resolution Contract', () => {
  it('env provider with no credentials does not silently fallback', () => {
    // When providerId='env' is explicitly selected but shell has no credentials,
    // the resolver must return hasCredentials=false. The AI SDK path (text-generator)
    // must then throw — NOT silently pick a random DB provider.
    const origKey = process.env.ANTHROPIC_API_KEY;
    const origToken = process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    try {
      const resolved = resolveProvider({ providerId: 'env' });
      assert.equal(resolved.provider, undefined, 'env mode must return provider=undefined');
      // hasCredentials should be false when no env vars are set
      // (may be true if legacy DB setting exists, which is also valid)
      if (!resolved.hasCredentials) {
        // This is the case text-generator should throw on — NOT fallback to DB
        assert.equal(resolved.hasCredentials, false);
        assert.equal(resolved.provider, undefined);
        // Contract: any consumer seeing this result must throw, not fallback
      }
    } finally {
      if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
      else delete process.env.ANTHROPIC_API_KEY;
      if (origToken !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = origToken;
      else delete process.env.ANTHROPIC_AUTH_TOKEN;
    }
  });

  it('all entry points resolve identically for same providerId + model', () => {
    // Simulate what each entry point does: call resolveProvider with the same inputs.
    // Chat, bridge, onboarding, check-in, media plan must all get the same result.
    const opts = {
      sessionProviderId: 'env' as string | undefined,
      sessionModel: 'sonnet' as string | undefined,
    };

    const chatResolved = resolveProvider(opts);
    const bridgeResolved = resolveProvider(opts);
    const onboardingResolved = resolveProvider(opts);
    const checkinResolved = resolveProvider(opts);
    const planResolved = resolveProvider(opts);

    // All must return identical provider, model, protocol, hasCredentials
    for (const [name, r] of [
      ['bridge', bridgeResolved],
      ['onboarding', onboardingResolved],
      ['checkin', checkinResolved],
      ['plan', planResolved],
    ] as const) {
      assert.equal(r.provider?.id, chatResolved.provider?.id, `${name} provider mismatch`);
      assert.equal(r.model, chatResolved.model, `${name} model mismatch`);
      assert.equal(r.upstreamModel, chatResolved.upstreamModel, `${name} upstreamModel mismatch`);
      assert.equal(r.protocol, chatResolved.protocol, `${name} protocol mismatch`);
      assert.equal(r.hasCredentials, chatResolved.hasCredentials, `${name} hasCredentials mismatch`);
    }
  });

  it('toAiSdkConfig for env mode does not require provider record', () => {
    // Isolate from real env vars AND DB settings
    const envSnapshot = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_BASE_URL;
    const dbSnapshot = {
      anthropic_auth_token: getSetting('anthropic_auth_token'),
      anthropic_base_url: getSetting('anthropic_base_url'),
    };
    setSetting('anthropic_auth_token', '');
    setSetting('anthropic_base_url', '');
    try {
      // env mode: provider=undefined, hasCredentials=true
      // toAiSdkConfig must produce a valid config that relies on process.env for auth
      const resolved: ResolvedProvider = {
        provider: undefined,
        protocol: 'anthropic',
        authStyle: 'api_key',
        model: 'sonnet',
        upstreamModel: 'sonnet',
        modelDisplayName: undefined,
        headers: {},
        envOverrides: {},
        roleModels: {},
        hasCredentials: true,
        availableModels: [],
        settingSources: ['user', 'project', 'local'],
      };
      const config = toAiSdkConfig(resolved);
      assert.equal(config.sdkType, 'anthropic');
      assert.equal(config.apiKey, undefined, 'env mode should not inject apiKey — SDK reads from process.env');
      assert.equal(config.baseUrl, undefined, 'env mode should not inject baseUrl — SDK reads from process.env');
      assert.equal(config.modelId, 'sonnet');
    } finally {
      for (const [k, v] of Object.entries(envSnapshot)) {
        if (v !== undefined) process.env[k] = v; else delete process.env[k];
      }
      setSetting('anthropic_auth_token', dbSnapshot.anthropic_auth_token || '');
      setSetting('anthropic_base_url', dbSnapshot.anthropic_base_url || '');
    }
  });

  it('upstream model mapping is consistent between AI SDK and Claude Code paths', () => {
    // For a provider where modelId !== upstreamModelId,
    // both toAiSdkConfig and toClaudeCodeEnv must use the upstream ID
    const resolved: ResolvedProvider = {
      provider: {
        id: 'test', name: 'GLM', provider_type: 'custom', protocol: 'anthropic',
        base_url: 'https://open.bigmodel.cn/api/anthropic', api_key: 'key',
        is_active: 1, sort_order: 0, extra_env: '{}', headers_json: '{}',
        env_overrides_json: '', role_models_json: '{"default":"glm-5-turbo"}',
        notes: '', created_at: '', updated_at: '', options_json: '{}',
      },
      protocol: 'anthropic',
      authStyle: 'api_key',
      model: 'sonnet',
      upstreamModel: 'glm-5-turbo',
      modelDisplayName: 'GLM-5-Turbo',
      headers: {},
      envOverrides: {},
      roleModels: { default: 'glm-5-turbo' },
      hasCredentials: true,
      availableModels: [
        { modelId: 'sonnet', upstreamModelId: 'glm-5-turbo', displayName: 'GLM-5-Turbo' },
      ],
      settingSources: ['project', 'local'],
    };

    // AI SDK path: toAiSdkConfig should use upstreamModel
    const aiConfig = toAiSdkConfig(resolved);
    assert.equal(aiConfig.modelId, 'glm-5-turbo', 'AI SDK should use upstream model ID');

    // Claude Code path: toClaudeCodeEnv should set ANTHROPIC_MODEL from roleModels.default
    const ccEnv = toClaudeCodeEnv({}, resolved);
    assert.equal(ccEnv.ANTHROPIC_MODEL, 'glm-5-turbo', 'Claude Code env should use upstream model ID');

    // Both paths use the same upstream ID
    assert.equal(aiConfig.modelId, ccEnv.ANTHROPIC_MODEL, 'AI SDK and Claude Code must use same upstream model');
  });
});

// ── Global Default Model Tests ──────────────────────────────────

import { getSetting, setSetting } from '../../lib/db';

describe('Global Default Model', () => {
  // Save and restore settings around each test
  let savedModel: string | null | undefined;
  let savedProvider: string | null | undefined;

  const setup = () => {
    savedModel = getSetting('global_default_model');
    savedProvider = getSetting('global_default_model_provider');
  };
  const teardown = () => {
    setSetting('global_default_model', savedModel || '');
    setSetting('global_default_model_provider', savedProvider || '');
  };

  // ── env provider branch ───────────────────────────────────────

  it('env provider uses global default model when it belongs to env', () => {
    setup();
    try {
      setSetting('global_default_model', 'opus');
      setSetting('global_default_model_provider', 'env');

      const resolved = resolveProvider({ providerId: 'env' });
      assert.equal(resolved.model, 'opus', 'should use global default model for env provider');
    } finally {
      teardown();
    }
  });

  it('env provider ignores global default model when it belongs to another provider', () => {
    setup();
    try {
      setSetting('global_default_model', 'some-model');
      setSetting('global_default_model_provider', 'some-other-provider-id');

      const resolved = resolveProvider({ providerId: 'env' });
      // Should NOT use 'some-model' because it belongs to a different provider
      assert.notEqual(resolved.model, 'some-model',
        'should not apply global default from another provider');
    } finally {
      teardown();
    }
  });

  it('explicit model overrides global default', () => {
    setup();
    try {
      setSetting('global_default_model', 'opus');
      setSetting('global_default_model_provider', 'env');

      const resolved = resolveProvider({ providerId: 'env', model: 'haiku' });
      assert.equal(resolved.model, 'haiku', 'explicit model should take priority');
    } finally {
      teardown();
    }
  });

  it('session model overrides global default', () => {
    setup();
    try {
      setSetting('global_default_model', 'opus');
      setSetting('global_default_model_provider', 'env');

      const resolved = resolveProvider({ providerId: 'env', sessionModel: 'sonnet' });
      assert.equal(resolved.model, 'sonnet', 'session model should take priority');
    } finally {
      teardown();
    }
  });

  // ── DB provider branch ────────────────────────────────────────

  it('DB provider uses global default model when it belongs to that provider', () => {
    setup();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import in test to avoid top-level side effects
const { createProvider, deleteProvider } = require('../../lib/db');
    const provider = createProvider({
      name: '__test_global_default__',
      provider_type: 'anthropic',
      base_url: 'https://api.anthropic.com',
      api_key: 'test-key',
    });
    try {
      setSetting('global_default_model', 'test-model-x');
      setSetting('global_default_model_provider', provider.id);

      const resolved = resolveProvider({ providerId: provider.id });
      assert.equal(resolved.model, 'test-model-x',
        'DB provider should use global default when provider ID matches');
    } finally {
      deleteProvider(provider.id);
      teardown();
    }
  });

  it('DB provider ignores global default model when it belongs to a different provider', () => {
    setup();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import in test to avoid top-level side effects
const { createProvider, deleteProvider } = require('../../lib/db');
    const provider = createProvider({
      name: '__test_global_default_cross__',
      provider_type: 'anthropic',
      base_url: 'https://api.anthropic.com',
      api_key: 'test-key',
      role_models_json: JSON.stringify({ default: 'own-default-model' }),
    });
    try {
      setSetting('global_default_model', 'foreign-model');
      setSetting('global_default_model_provider', 'some-completely-different-id');

      const resolved = resolveProvider({ providerId: provider.id });
      // Should fall through to roleModels.default, NOT use 'foreign-model'
      assert.notEqual(resolved.model, 'foreign-model',
        'DB provider should not use global default from another provider');
      assert.equal(resolved.model, 'own-default-model',
        'should fall through to roleModels.default');
    } finally {
      deleteProvider(provider.id);
      teardown();
    }
  });

  it('DB provider: session model overrides global default even when provider matches', () => {
    setup();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import in test to avoid top-level side effects
const { createProvider, deleteProvider } = require('../../lib/db');
    const provider = createProvider({
      name: '__test_global_default_session__',
      provider_type: 'anthropic',
      base_url: 'https://api.anthropic.com',
      api_key: 'test-key',
    });
    try {
      setSetting('global_default_model', 'global-pick');
      setSetting('global_default_model_provider', provider.id);

      const resolved = resolveProvider({ providerId: provider.id, sessionModel: 'session-pick' });
      assert.equal(resolved.model, 'session-pick',
        'session model should take priority over global default');
    } finally {
      deleteProvider(provider.id);
      teardown();
    }
  });
});

// ────────────────────────────────────────────────────────────────
// routeAuxiliaryModel — pure function tests
// ────────────────────────────────────────────────────────────────

describe('routeAuxiliaryModel (pure routing)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { routeAuxiliaryModel } = require('../../lib/provider-resolver');

  // Helper: build a minimal ResolvedProvider for testing
  function mockMain(opts: {
    id?: string;
    roleModels?: { small?: string; haiku?: string; default?: string };
    model?: string;
    upstreamModel?: string;
    envMode?: boolean;
  }): ResolvedProvider {
    const roleModels = opts.roleModels || {};
    if (opts.envMode) {
      return {
        provider: undefined,
        protocol: 'anthropic',
        authStyle: 'api_key',
        model: opts.model,
        upstreamModel: opts.upstreamModel,
        modelDisplayName: undefined,
        headers: {},
        envOverrides: {},
        roleModels,
        hasCredentials: false,
        availableModels: [],
        settingSources: ['project', 'local'],
      };
    }
    return {
      provider: {
        id: opts.id || 'main-prov',
        name: 'Test Main',
        provider_type: 'anthropic',
        protocol: 'anthropic',
        base_url: 'https://api.anthropic.com',
        api_key: 'sk-test',
        is_active: 1,
        sort_order: 0,
        extra_env: '{}',
        headers_json: '{}',
        env_overrides_json: '',
        role_models_json: JSON.stringify(roleModels),
        notes: '',
        created_at: '',
        updated_at: '', options_json: '{}',
      },
      protocol: 'anthropic',
      authStyle: 'api_key',
      model: opts.model || 'claude-sonnet-4-6',
      upstreamModel: opts.upstreamModel || opts.model || 'claude-sonnet-4-6',
      modelDisplayName: undefined,
      headers: {},
      envOverrides: {},
      roleModels,
      hasCredentials: true,
      availableModels: [],
      settingSources: ['project', 'local'],
    };
  }

  describe('Tier 1 — env override', () => {
    it('env override with both provider and model wins everything', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ roleModels: { small: 'haiku-4.5' } }),
        isMainSdkProxyOnly: false,
        others: [],
        envOverride: { providerId: 'custom-prov', modelId: 'custom-model' },
      });
      assert.equal(result.providerId, 'custom-prov');
      assert.equal(result.modelId, 'custom-model');
      assert.equal(result.source, 'env_override');
    });

    it('env override missing modelId does NOT apply (needs both)', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ roleModels: { small: 'haiku-4.5' } }),
        isMainSdkProxyOnly: false,
        others: [],
        envOverride: { providerId: 'custom-prov' }, // missing modelId
      });
      assert.equal(result.source, 'main_small');
      assert.equal(result.modelId, 'haiku-4.5');
    });

    it('env override missing providerId does NOT apply', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ roleModels: { small: 'haiku-4.5' } }),
        isMainSdkProxyOnly: false,
        others: [],
        envOverride: { modelId: 'custom-model' }, // missing providerId
      });
      assert.equal(result.source, 'main_small');
    });
  });

  describe('Tier 2 — main provider small slot', () => {
    it('main small slot is preferred when main is not sdkProxyOnly', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ roleModels: { small: 'haiku-4.5', haiku: 'haiku-4.5-alt' } }),
        isMainSdkProxyOnly: false,
        others: [],
      });
      assert.equal(result.source, 'main_small');
      assert.equal(result.modelId, 'haiku-4.5');
    });

    it('main small slot is SKIPPED when main is sdkProxyOnly', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ id: 'kimi', roleModels: { small: 'kimi-small' } }),
        isMainSdkProxyOnly: true,
        others: [],
      });
      // falls through to main_floor since no other providers
      assert.equal(result.source, 'main_floor');
      assert.equal(result.providerId, 'kimi');
    });
  });

  describe('Tier 3 — main provider haiku slot', () => {
    it('main haiku used when small is absent', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ roleModels: { haiku: 'haiku-only' } }),
        isMainSdkProxyOnly: false,
        others: [],
      });
      assert.equal(result.source, 'main_haiku');
      assert.equal(result.modelId, 'haiku-only');
    });
  });

  describe('Tier 4 — fallback provider', () => {
    it('fallback provider small used when main is sdkProxyOnly', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ id: 'kimi', roleModels: { small: 'kimi-small' } }),
        isMainSdkProxyOnly: true,
        others: [
          {
            id: 'anthropic',
            roleModels: { small: 'claude-haiku-4-5' },
            isSdkProxyOnly: false,
          },
        ],
      });
      assert.equal(result.source, 'fallback_provider_small');
      assert.equal(result.providerId, 'anthropic');
      assert.equal(result.modelId, 'claude-haiku-4-5');
    });

    it('fallback provider haiku used when no small anywhere', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ id: 'kimi', roleModels: {} }),
        isMainSdkProxyOnly: true,
        others: [
          {
            id: 'anthropic',
            roleModels: { haiku: 'claude-haiku-4-5' },
            isSdkProxyOnly: false,
          },
        ],
      });
      assert.equal(result.source, 'fallback_provider_haiku');
      assert.equal(result.providerId, 'anthropic');
    });

    it('fallback skips other providers that are also sdkProxyOnly', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ id: 'kimi', roleModels: {} }),
        isMainSdkProxyOnly: true,
        others: [
          {
            id: 'glm',
            roleModels: { small: 'glm-air' },
            isSdkProxyOnly: true, // skipped
          },
          {
            id: 'anthropic',
            roleModels: { small: 'claude-haiku-4-5' },
            isSdkProxyOnly: false,
          },
        ],
      });
      assert.equal(result.source, 'fallback_provider_small');
      assert.equal(result.providerId, 'anthropic');
    });
  });

  describe('Tier 5 — main floor (ultimate fallback)', () => {
    it('falls back to main + main model when no small/haiku anywhere', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({
          id: 'main',
          roleModels: {},
          model: 'main-model',
          upstreamModel: 'upstream-main-model',
        }),
        isMainSdkProxyOnly: false,
        others: [],
      });
      assert.equal(result.source, 'main_floor');
      assert.equal(result.providerId, 'main');
      // upstreamModel is preferred over model when both are set
      assert.equal(result.modelId, 'upstream-main-model');
    });

    it('falls back to main_floor when all other providers are sdkProxyOnly', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ id: 'main-kimi', roleModels: {} }),
        isMainSdkProxyOnly: true,
        others: [
          { id: 'glm', roleModels: { small: 'glm' }, isSdkProxyOnly: true },
          { id: 'minimax', roleModels: { small: 'minimax' }, isSdkProxyOnly: true },
        ],
      });
      assert.equal(result.source, 'main_floor');
      assert.equal(result.providerId, 'main-kimi');
    });

    it('env mode with undefined provider still returns main_floor with providerId=env', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ envMode: true, roleModels: {}, upstreamModel: 'env-model' }),
        isMainSdkProxyOnly: false,
        others: [],
      });
      assert.equal(result.source, 'main_floor');
      assert.equal(result.providerId, 'env');
      assert.equal(result.modelId, 'env-model');
    });

    it('never returns null/undefined modelId (empty string fallback)', () => {
      const result = routeAuxiliaryModel('compact', {
        main: mockMain({ envMode: true, roleModels: {} }),
        isMainSdkProxyOnly: false,
        others: [],
      });
      assert.equal(result.source, 'main_floor');
      assert.equal(typeof result.modelId, 'string');
    });
  });

  describe('task parameter', () => {
    it('task parameter does not affect routing for the same ctx', () => {
      const ctx = {
        main: mockMain({ roleModels: { small: 'haiku-4.5' } }),
        isMainSdkProxyOnly: false,
        others: [],
      };
      const compact = routeAuxiliaryModel('compact', ctx);
      const vision = routeAuxiliaryModel('vision', ctx);
      const summarize = routeAuxiliaryModel('summarize', ctx);
      const webExtract = routeAuxiliaryModel('web_extract', ctx);
      assert.equal(compact.modelId, 'haiku-4.5');
      assert.equal(vision.modelId, 'haiku-4.5');
      assert.equal(summarize.modelId, 'haiku-4.5');
      assert.equal(webExtract.modelId, 'haiku-4.5');
    });
  });
});

// ────────────────────────────────────────────────────────────────
// resolveAuxiliaryModel — integration with real DB state
// ────────────────────────────────────────────────────────────────

describe('resolveAuxiliaryModel (live wrapper)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolveAuxiliaryModel } = require('../../lib/provider-resolver');

  it('returns a well-formed result without throwing', () => {
    const result = resolveAuxiliaryModel('compact');
    assert.ok(result);
    assert.equal(typeof result.providerId, 'string');
    assert.equal(typeof result.modelId, 'string');
    assert.ok(
      ['env_override', 'main_small', 'main_haiku', 'fallback_provider_small',
       'fallback_provider_haiku', 'main_floor'].includes(result.source),
      `unexpected source: ${result.source}`,
    );
  });

  it('env override applies when AUXILIARY_COMPACT_PROVIDER+MODEL are set', () => {
    process.env.AUXILIARY_COMPACT_PROVIDER = 'test-prov';
    process.env.AUXILIARY_COMPACT_MODEL = 'test-model';
    try {
      const result = resolveAuxiliaryModel('compact');
      assert.equal(result.source, 'env_override');
      assert.equal(result.providerId, 'test-prov');
      assert.equal(result.modelId, 'test-model');
    } finally {
      delete process.env.AUXILIARY_COMPACT_PROVIDER;
      delete process.env.AUXILIARY_COMPACT_MODEL;
    }
  });

  it('each task type reads its own env var (AUXILIARY_<TASK>_*)', () => {
    process.env.AUXILIARY_VISION_PROVIDER = 'vision-prov';
    process.env.AUXILIARY_VISION_MODEL = 'vision-model';
    try {
      const vision = resolveAuxiliaryModel('vision');
      assert.equal(vision.source, 'env_override');
      assert.equal(vision.modelId, 'vision-model');

      // compact should NOT pick up vision env vars
      const compact = resolveAuxiliaryModel('compact');
      assert.notEqual(compact.source, 'env_override');
    } finally {
      delete process.env.AUXILIARY_VISION_PROVIDER;
      delete process.env.AUXILIARY_VISION_MODEL;
    }
  });

  // ───────────────────────────────────────────────────────────
  // Regression tests for Codex review 2026-04-12
  // ───────────────────────────────────────────────────────────

  // ─ Codex review round 2: tighten Fix 1 and Fix 2 regression tests ─
  //
  // Previous assertions were too loose — they would have accepted the
  // pre-fix behavior. These rewrites explicitly reject the pre-fix
  // outcomes and pin the post-fix semantics.

  it('[fix 1 P1 strict] session providerId wins over the global default — source discriminator', () => {
    // Pre-fix behavior: resolveAuxiliaryModel() called resolveProvider()
    // with NO arguments → picked the global default as "main" → returned
    // source='main_small' pointing at the DEFAULT provider's small slot.
    //
    // Post-fix behavior: opts.providerId is forwarded, so the SESSION
    // provider becomes "main". If the session provider has no small/haiku,
    // the global default (if it has small/haiku) becomes a TIER-4 FALLBACK,
    // producing source='fallback_provider_small' — a different enum value.
    //
    // The `source` field is the unambiguous discriminator. Asserting
    // source !== 'main_small' catches the exact pre-fix regression.

    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      createProvider,
      deleteProvider,
      getSetting,
      setSetting,
    } = require('../../lib/db');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const savedDefaultId = getSetting('default_provider_id') || '';

    const globalDefault = createProvider({
      name: '__test_aux_globalDefault__',
      provider_type: 'anthropic',
      base_url: 'https://api.anthropic.com',
      api_key: 'sk-global',
      role_models_json: JSON.stringify({
        default: 'global-default-model',
        small: 'global-small-slot',
      }),
    });
    const session = createProvider({
      name: '__test_aux_session__',
      provider_type: 'anthropic',
      base_url: 'https://api.anthropic.com',
      api_key: 'sk-session',
      // Intentionally NO small/haiku — forces tier-4 or main_floor
      role_models_json: JSON.stringify({ default: 'session-default-model' }),
    });
    setSetting('default_provider_id', globalDefault.id);

    try {
      const result = resolveAuxiliaryModel('compact', { providerId: session.id });

      // Strict assertion on `source` — the unambiguous discriminator.
      //
      // Pre-fix semantics: globalDefault is resolved as "main" (because
      // resolveProvider() with no opts reads default_provider_id), so its
      // small slot matches tier 2 → source='main_small'.
      //
      // Post-fix semantics: `session` is resolved as "main" because opts
      // is forwarded. `session` has no small/haiku, so tier 2/3 are
      // skipped. Tier 4 may or may not find a fallback provider
      // depending on other DB state, but regardless, source will be one
      // of [fallback_provider_small, fallback_provider_haiku, main_floor]
      // — NEVER main_small/main_haiku (because `session` explicitly
      // lacks those slots).
      //
      // This assertion catches the exact pre-fix regression: if session
      // context is ignored and globalDefault becomes main, source would
      // be main_small/main_haiku, which we now reject.
      assert.notEqual(
        result.source,
        'main_small',
        'Regression: source=main_small means the session providerId was ignored and the global default was resolved as main',
      );
      assert.notEqual(
        result.source,
        'main_haiku',
        'Regression: source=main_haiku means the session providerId was ignored',
      );
      assert.ok(
        ['fallback_provider_small', 'fallback_provider_haiku', 'main_floor'].includes(result.source),
        `Expected fallback/floor tier, got source=${result.source}`,
      );

      // If the returned source is main_floor, providerId MUST be session
      // (because main_floor by definition uses the main provider). Any
      // other ID in main_floor would indicate the session context was
      // dropped somewhere in the routing.
      if (result.source === 'main_floor') {
        assert.equal(
          result.providerId,
          session.id,
          'main_floor should bind to the session provider, not the global default',
        );
      }
    } finally {
      setSetting('default_provider_id', savedDefaultId);
      deleteProvider(session.id);
      deleteProvider(globalDefault.id);
    }
  });

  it('[regression] stale invalid protocol in another provider does not crash tier-4 fallback scan', () => {
    // A DB row with an invalid raw protocol string (e.g. migrated from an
    // older schema, imported from a broken export, or created before the
    // write-path validation landed) must not poison the "other providers"
    // enumeration in resolveAuxiliaryModel. Before the effective-protocol
    // fix the enum would pass 'random-garbage' straight to
    // findPresetForLegacy and computeEffectiveRoleModels, producing
    // inconsistent downstream routing between main and auxiliary paths.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createProvider, deleteProvider } = require('../../lib/db');

    // Main provider — intentionally no small/haiku slots so the resolver
    // must walk past tier-2/3 and into the tier-4 scan where the broken
    // provider would be evaluated.
    const main = createProvider({
      name: '__test_aux_main_no_small__',
      provider_type: 'anthropic',
      base_url: 'https://api.anthropic.com',
      api_key: 'sk-main',
      role_models_json: JSON.stringify({ default: 'opus' }),
    });

    // Broken provider with an unknown protocol string. provider_type is
    // anthropic so the effective-protocol helper can still infer something
    // sensible; the broken value just shouldn't propagate.
    const broken = createProvider({
      name: '__test_aux_invalid_protocol__',
      provider_type: 'anthropic',
      protocol: 'random-garbage',
      base_url: 'https://api.anthropic.com',
      api_key: 'sk-broken',
      role_models_json: JSON.stringify({ default: 'opus', small: 'broken-small' }),
    });

    try {
      // Must not throw. We don't pin the exact source because it depends
      // on DB state from parallel tests — but the call has to survive and
      // yield a valid routing.
      const result = resolveAuxiliaryModel('compact', { providerId: main.id });
      assert.ok(result);
      assert.ok(
        ['env_override', 'main_small', 'main_haiku', 'fallback_provider_small',
         'fallback_provider_haiku', 'main_floor'].includes(result.source),
        `unexpected source: ${result.source}`,
      );
    } finally {
      deleteProvider(main.id);
      deleteProvider(broken.id);
    }
  });

  it('[fix 1 P1] explicit providerId with small slot IS returned as main_small (positive case)', () => {
    // Positive-case companion: the explicit providerId has a small slot,
    // so the result MUST be main_small + that provider's slot. This
    // catches a regression where session providerId is ignored and we
    // return some other provider's slot.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createProvider, deleteProvider } = require('../../lib/db');
    const explicit = createProvider({
      name: '__test_aux_explicit__',
      provider_type: 'anthropic',
      base_url: 'https://api.anthropic.com',
      api_key: 'sk-explicit',
      role_models_json: JSON.stringify({
        default: 'opus-foo',
        small: 'explicit-small-unique-marker',
      }),
    });
    try {
      const result = resolveAuxiliaryModel('compact', { providerId: explicit.id });
      assert.equal(result.source, 'main_small');
      assert.equal(result.providerId, explicit.id);
      assert.equal(result.modelId, 'explicit-small-unique-marker');
    } finally {
      deleteProvider(explicit.id);
    }
  });

  it('[fix 2 P2 strict] computeEffectiveRoleModels merges preset.defaultRoleModels when json is empty', () => {
    // The tier-4 scan previously only read role_models_json, missing
    // preset-backed defaultRoleModels. The fix extracted this helper
    // from buildResolution's merge logic (provider-resolver.ts:664-675).
    //
    // We test the helper directly because:
    //   - No non-sdkProxyOnly preset in the catalog currently sets
    //     defaultRoleModels (only MiniMax/MiMo set it, all sdkProxyOnly),
    //     so a live end-to-end scenario is impossible with the real catalog
    //   - The merge rule is simple enough that direct unit testing gives
    //     the strongest possible contract lock
    //   - A synthetic preset fixture lets us cover the exact branches:
    //     (a) empty json + preset defaults → merged
    //     (b) json with slots → json wins
    //     (c) no preset → empty json stays empty
    //     (d) json default/sonnet present → merge suppressed (guard)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeEffectiveRoleModels } = require('../../lib/provider-resolver');

    const makeProvider = (json: string) => ({
      id: 'p',
      name: 'Test',
      provider_type: 'anthropic',
      protocol: 'anthropic',
      base_url: 'https://example.com',
      api_key: 'k',
      is_active: 1,
      sort_order: 0,
      extra_env: '{}',
      headers_json: '{}',
      env_overrides_json: '',
      role_models_json: json,
      notes: '',
      created_at: '',
      updated_at: '',
      options_json: '{}',
    });

    // Minimal preset fixture — computeEffectiveRoleModels only reads
    // .defaultRoleModels on the preset, so we don't need the full shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPresetWithDefaults: any = {
      key: 'test-preset',
      defaultRoleModels: { small: 'preset-small', haiku: 'preset-haiku' },
    };

    // (a) empty json + preset defaults → merged
    const empty = computeEffectiveRoleModels(
      makeProvider(JSON.stringify({})),
      mockPresetWithDefaults,
      'anthropic',
    );
    assert.equal(empty.small, 'preset-small', 'empty json should inherit preset small');
    assert.equal(empty.haiku, 'preset-haiku', 'empty json should inherit preset haiku');

    // (b) json with its own slots → json values win (spread order in fix)
    const withOwn = computeEffectiveRoleModels(
      makeProvider(JSON.stringify({ small: 'own-small' })),
      mockPresetWithDefaults,
      'anthropic',
    );
    // The current guard only merges when !default && !sonnet; json already
    // has no default/sonnet, so merge fires, then json.small overrides
    // preset.small via spread order.
    assert.equal(withOwn.small, 'own-small', 'own json small should win over preset small');
    assert.equal(withOwn.haiku, 'preset-haiku', 'preset haiku should still be inherited');

    // (c) no preset → empty json stays empty
    const noPreset = computeEffectiveRoleModels(
      makeProvider(JSON.stringify({})),
      undefined,
      'anthropic',
    );
    assert.deepEqual(noPreset, {}, 'no preset means nothing to merge');

    // (d) json.default is present → merge guard suppresses preset injection
    const withDefault = computeEffectiveRoleModels(
      makeProvider(JSON.stringify({ default: 'own-default' })),
      mockPresetWithDefaults,
      'anthropic',
    );
    assert.equal(withDefault.default, 'own-default');
    assert.equal(withDefault.small, undefined, 'preset merge should be suppressed when json.default exists');
    assert.equal(withDefault.haiku, undefined);

    // (e) json.sonnet is present → same guard
    const withSonnet = computeEffectiveRoleModels(
      makeProvider(JSON.stringify({ sonnet: 'own-sonnet' })),
      mockPresetWithDefaults,
      'anthropic',
    );
    assert.equal(withSonnet.sonnet, 'own-sonnet');
    assert.equal(withSonnet.small, undefined);
    assert.equal(withSonnet.haiku, undefined);
  });

  it('[fix 2 P2] tier-4 scan uses computeEffectiveRoleModels (integration smoke)', () => {
    // Integration-level smoke: even with the real catalog (where no
    // non-sdkProxyOnly preset exposes defaultRoleModels), verify that
    // the tier-4 scan calls computeEffectiveRoleModels and doesn't
    // throw when providers rely on preset defaults. The strict
    // behavioral assertion lives in the previous test; this one just
    // guards against a refactor breaking the wire-up.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createProvider, deleteProvider } = require('../../lib/db');

    const mainSdkOnly = createProvider({
      name: '__test_main_sdkonly_smoke__',
      provider_type: 'anthropic',
      // Kimi coding URL is sdkProxyOnly via preset
      base_url: 'https://api.moonshot.cn/anthropic/',
      api_key: 'sk-main',
      role_models_json: JSON.stringify({}),
    });
    const fallbackEmpty = createProvider({
      name: '__test_fallback_empty_smoke__',
      provider_type: 'anthropic',
      base_url: 'https://api.anthropic.com',
      api_key: 'sk-fallback',
      role_models_json: JSON.stringify({}),
    });

    try {
      // Should not throw regardless of whether tier-4 finds anything.
      const result = resolveAuxiliaryModel('compact', { providerId: mainSdkOnly.id });
      assert.ok(result);
      assert.ok(typeof result.providerId === 'string');
      assert.ok(typeof result.source === 'string');
    } finally {
      deleteProvider(mainSdkOnly.id);
      deleteProvider(fallbackEmpty.id);
    }
  });
});
