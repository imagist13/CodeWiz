/**
 * claude-model-options.ts — shared model-option sanitizer for Claude models.
 *
 * The Claude Agent SDK path (claude-client.ts) and the native/AI-SDK path
 * (agent-loop.ts) both assemble thinking / effort / context1m options for
 * Anthropic requests. Without a shared sanitizer, breaking-change guards
 * have to be duplicated across paths and drift (which is exactly what Codex
 * flagged in the Opus 4.7 review).
 *
 * Scope for Opus 4.7 (per official migration guide):
 *   - Opus 4.7 does NOT accept manual extended thinking
 *     ({ type: 'enabled', budgetTokens }) — returns 400. Convert to adaptive.
 *   - Opus 4.7 supports adaptive thinking and effort-based reasoning budget.
 *     (Display=summarized can be added by callers separately.)
 *   - 1M context is the default on 4.7 — context-1m-2025-08-07 beta header
 *     is unnecessary and gets skipped.
 */

export type ThinkingConfig =
  | { type: 'adaptive'; display?: 'summarized' | 'omitted' }
  | { type: 'enabled'; budgetTokens?: number; display?: 'summarized' | 'omitted' }
  | { type: 'disabled' };

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ClaudeModelOptionsInput {
  /** Upstream / full model ID (e.g. 'claude-opus-4-7'). Short aliases like
   *  'opus' are not detected as 4.7 — callers should resolve to upstream
   *  before sanitizing. */
  model: string | undefined;
  thinking?: ThinkingConfig;
  effort?: EffortLevel | string;
  context1m?: boolean;
}

export interface ClaudeModelOptionsOutput {
  thinking?: ThinkingConfig;
  effort?: string;
  /** After sanitization, whether the caller should attach the
   *  context-1m-2025-08-07 beta header. Opus 4.7 is 1M by default and
   *  returns true only for models that still need the beta. */
  applyContext1mBeta: boolean;
  /** Whether the input model is Opus 4.7. Exposed so callers can log or
   *  make additional runtime-specific decisions. */
  isOpus47: boolean;
}

const OPUS_4_7_PATTERN = /opus-?4-?7/i;

export function isOpus47Model(model: string | undefined): boolean {
  if (!model) return false;
  return OPUS_4_7_PATTERN.test(model);
}

/**
 * Normalize thinking / effort / context1m for a single Anthropic request.
 * Idempotent — safe to call multiple times on the same input.
 */
export function sanitizeClaudeModelOptions(
  input: ClaudeModelOptionsInput,
): ClaudeModelOptionsOutput {
  const isOpus47 = isOpus47Model(input.model);

  let thinking = input.thinking;
  if (isOpus47 && thinking) {
    // Opus 4.7 rejects manual extended thinking. Convert to adaptive so
    // the user's "thinking enabled" intent survives without triggering
    // a 400.
    if (thinking.type === 'enabled') {
      thinking = { type: 'adaptive', display: 'summarized' };
    } else if (thinking.type === 'adaptive' && !thinking.display) {
      // Opus 4.7 adaptive thinking defaults display to 'omitted', which
      // means the SDK will not emit thinking deltas and CodePilot's
      // reasoning block disappears. Explicitly request 'summarized' so
      // users still see the reasoning UI they saw on 4.6.
      thinking = { ...thinking, display: 'summarized' };
    }
  }

  // Opus 4.7 ships 1M by default — the beta header is unnecessary and
  // kept out to make regression hunting cleaner.
  const applyContext1mBeta = !!input.context1m && !isOpus47;

  return {
    thinking,
    effort: input.effort as string | undefined,
    applyContext1mBeta,
    isOpus47,
  };
}
