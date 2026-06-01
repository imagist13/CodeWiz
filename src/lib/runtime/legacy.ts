/**
 * runtime/legacy.ts — Translate any persisted `agent_runtime` value to the
 * concrete two-state runtime (0.50.3+).
 *
 * Why this exists:
 *   Before 0.50.3, `agent_runtime` had three values — 'auto' (default),
 *   'native', and 'claude-code-sdk'. 0.50.3 removed the user-visible Auto
 *   option from Settings and migrates stored 'auto' rows to a concrete value
 *   the first time the Settings page loads. But:
 *
 *     1. That migration can be skipped for users who never open Settings.
 *     2. The chat runtime badge must not surface "Agent: Auto" even if the
 *        DB still holds 'auto'.
 *
 *   Both call sites therefore need the same coercion rule. Centralising it
 *   here keeps Settings' one-shot migration and the badge's transient display
 *   in lockstep — no chance of the badge showing "Claude Code" while the
 *   migration writes "Native".
 */

export type ConcreteRuntime = 'native' | 'claude-code-sdk';

export function isConcreteRuntime(v: unknown): v is ConcreteRuntime {
  return v === 'native' || v === 'claude-code-sdk';
}

/**
 * Coerce any stored runtime value to a concrete runtime for display /
 * migration purposes. Rules:
 *   - 'claude-code-sdk' → 'claude-code-sdk'   (user's explicit choice)
 *   - 'native'          → 'native'            (user's explicit choice)
 *   - 'auto' / null / undefined / anything else → environment-driven:
 *                          cliConnected ? 'claude-code-sdk' : 'native'
 *
 * `cliConnected` must come from a real /api/claude-status read. Passing a
 * pessimistic default (false) while the status is still loading will silently
 * migrate Claude Code users to Native — callers should either await status
 * resolution or gate the persistence step, and only use this for local
 * display when status is unknown.
 */
export function resolveLegacyRuntimeForDisplay(
  saved: string | undefined | null,
  cliConnected: boolean,
): ConcreteRuntime {
  if (isConcreteRuntime(saved)) return saved;
  return cliConnected ? 'claude-code-sdk' : 'native';
}
