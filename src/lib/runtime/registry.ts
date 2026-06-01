/**
 * runtime/registry.ts — Runtime registration and resolution.
 *
 * Keeps a Map of available runtimes. resolveRuntime() picks the best one
 * based on user settings and CLI binary availability (auto mode).
 *
 * auto 语义（自 0.50.3 起简化为 binary check）：
 *   - 装了 Claude Code CLI → SDK runtime
 *   - 没装 → Native runtime
 *
 * 此前 auto 会综合 env vars / DB provider / ~/.claude/settings.json 做凭据推断，
 * 但推断逻辑在边缘场景（cc-switch 代理占位符、全新未配置用户等）频繁出错，
 * 导致 Sentry NEXT-2Z "No provider credentials" 长期高位。改为二元判定后，
 * 没凭据的场景由 Chat API 入口的 NEEDS_PROVIDER_SETUP 精准拦截，不再由
 * runtime 决策层胡乱猜测。
 */

import type { AgentRuntime } from './types';
import { getSetting } from '@/lib/db';

const runtimes = new Map<string, AgentRuntime>();

export function registerRuntime(runtime: AgentRuntime): void {
  runtimes.set(runtime.id, runtime);
}

export function getRuntime(id: string): AgentRuntime | undefined {
  return runtimes.get(id);
}

export function getAllRuntimes(): AgentRuntime[] {
  return Array.from(runtimes.values());
}

export function getAvailableRuntimes(): AgentRuntime[] {
  return getAllRuntimes().filter(r => r.isAvailable());
}

/**
 * Pick the runtime to use for a given request.
 *
 * Priority:
 * 0. cli_enabled=false → ALWAYS use native (highest-priority constraint)
 * 1. Explicit override (from function arg or per-session setting)
 * 2. Global user setting (agent_runtime)
 * 3. Auto: SDK if CLI binary exists, else Native
 */
export function resolveRuntime(overrideId?: string, _providerId?: string): AgentRuntime {
  // 0. cli_enabled=false is an absolute constraint — never return SDK
  const cliDisabled = getSetting('cli_enabled') === 'false';

  if (cliDisabled) {
    const native = getRuntime('native');
    if (native) return native;
    throw new Error('Native runtime not registered but CLI is disabled. This is a bug.');
  }

  // 1. Explicit override
  if (overrideId && overrideId !== 'auto') {
    const r = getRuntime(overrideId);
    if (r?.isAvailable()) return r;
  }

  // 2. Global setting
  const settingId = getSetting('agent_runtime');
  if (settingId && settingId !== 'auto') {
    const r = getRuntime(settingId);
    if (r?.isAvailable()) return r;
  }

  // 3. Auto: CLI installed → SDK, otherwise Native.
  //    No credential inference — missing credentials are caught earlier at
  //    /api/chat by hasCodePilotProvider(); if we reach this point the user
  //    has at least one provider source the caller expects to work.
  const sdk = getRuntime('claude-code-sdk');
  if (sdk?.isAvailable()) return sdk;

  const native = getRuntime('native');
  if (native?.isAvailable()) return native;

  // Last resort: return native even if "unavailable" — it only needs an API key,
  // and will produce a clear error message if credentials are missing.
  if (native) return native;

  throw new Error('No agent runtime registered. This is a bug — please report it.');
}

/**
 * Predict whether the native runtime will be used for a given request.
 *
 * Mirrors resolveRuntime() logic WITHOUT instantiating the runtime, so callers
 * (chat route, bridge) can prepare the right MCP config upfront.
 *
 * @param providerId - The provider for this request ('openai-oauth' forces native)
 */
export function predictNativeRuntime(providerId?: string): boolean {
  // Non-Anthropic providers always force native
  if (providerId === 'openai-oauth') return true;

  // cli_enabled=false → always native
  if (getSetting('cli_enabled') === 'false') return true;

  // Explicit setting — but verify SDK is actually usable
  const settingId = getSetting('agent_runtime');
  if (settingId === 'native') return true;
  if (settingId === 'claude-code-sdk') {
    // If CLI doesn't exist, explicit selection will fallback to native at runtime
    const sdk = getRuntime('claude-code-sdk');
    return !sdk?.isAvailable();
  }

  // Auto: CLI installed → SDK (native=false), otherwise Native (native=true)
  const sdk = getRuntime('claude-code-sdk');
  return !sdk?.isAvailable();
}
