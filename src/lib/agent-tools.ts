/**
 * agent-tools.ts — Tool assembly layer for the native Agent Loop.
 *
 * Selects which tools to pass to streamText() based on session mode,
 * keyword-gating, and MCP server availability.
 * Wraps tools with permission checking when a permissionContext is provided.
 */

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

/** Tool names that are safe in read-only (plan) mode */
export const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep'] as const;
import { createBuiltinTools } from './tools';
import { buildMcpToolSet } from './mcp-tool-adapter';
import { getBuiltinTools } from './builtin-tools';
import { checkPermission, type PermissionMode } from './permission-checker';
import { registerPendingPermission } from './permission-registry';
import { emit as emitEvent } from './runtime/event-bus';
import { createPermissionRequest } from './db';
import crypto from 'crypto';

export interface AssembleToolsOptions {
  workingDirectory?: string;
  prompt?: string;
  mode?: string;
  /** Provider ID (passed to sub-agents for inheritance) */
  providerId?: string;
  /** Session provider ID (passed to sub-agents for inheritance) */
  sessionProviderId?: string;
  /** Model (passed to sub-agents for inheritance) */
  model?: string;
  /** Permission context — when set, tools are wrapped with permission checks */
  permissionContext?: {
    sessionId: string;
    permissionMode: PermissionMode;
    /** Callback to emit SSE events (for permission_request) */
    emitSSE: (event: { type: string; data: string }) => void;
    abortSignal?: AbortSignal;
  };
}

export interface AssembleToolsResult {
  tools: ToolSet;
  /** System prompt snippets from builtin tool groups (notification, media, etc.) */
  systemPrompts: string[];
}

/**
 * Assemble the tool set for the native Agent Loop.
 * Returns both tools and their associated system prompt snippets.
 */
export function assembleTools(options: AssembleToolsOptions = {}): AssembleToolsResult {
  const cwd = options.workingDirectory || process.cwd();

  // Built-in coding tools — pass permission context through so sub-agents
  // (Agent tool) can inherit the parent's permission mode and SSE emitter.
  const builtinTools = createBuiltinTools({
    workingDirectory: cwd,
    sessionId: options.permissionContext?.sessionId,
    providerId: options.providerId,
    sessionProviderId: options.sessionProviderId,
    model: options.model,
    permissionMode: options.permissionContext?.permissionMode,
    emitSSE: options.permissionContext?.emitSSE,
    abortSignal: options.permissionContext?.abortSignal,
  });

  // In 'plan' mode, restrict to read-only tools
  if (options.mode === 'plan') {
    return {
      tools: { Read: builtinTools.Read, Glob: builtinTools.Glob, Grep: builtinTools.Grep },
      systemPrompts: [],
    };
  }

  // Built-in MCP-equivalent tools (notification, memory, dashboard, etc.)
  const { tools: builtinMcpTools, systemPrompts } = getBuiltinTools({
    workspacePath: cwd,
    prompt: options.prompt,
  });

  // External MCP tools from connected servers
  const mcpTools = buildMcpToolSet();

  const allTools = { ...builtinTools, ...builtinMcpTools, ...mcpTools };

  // Wrap with permission checks if context provided
  if (options.permissionContext) {
    return { tools: wrapWithPermissions(allTools, options.permissionContext), systemPrompts };
  }

  return { tools: allTools, systemPrompts };
}

// ── Permission wrapper ──────────────────────────────────────────

// Session-level auto-approved rules (accumulated from "allow for session" responses)
const sessionApprovals = new Map<string, Array<{ toolName: string; pattern: string }>>();

function getSessionRules(sessionId: string): Array<{ permission: string; pattern: string; action: 'allow' | 'deny' | 'ask' }> {
  const approvals = sessionApprovals.get(sessionId) || [];
  return approvals.map(a => ({ permission: a.toolName, pattern: a.pattern, action: 'allow' as const }));
}

function wrapWithPermissions(
  tools: ToolSet,
  ctx: NonNullable<AssembleToolsOptions['permissionContext']>,
): ToolSet {
  const wrapped: ToolSet = {};

  for (const [name, t] of Object.entries(tools)) {
    // Skip permission checks for safe tools:
    // - Read-only core tools (Read, Glob, Grep, Skill)
    // - All CodePilot built-in tools (codepilot_*) — trusted internal tools
    if (['Read', 'Glob', 'Grep', 'Skill'].includes(name) || name.startsWith('codepilot_')) {
      wrapped[name] = t;
      continue;
    }

    // Wrap execute with permission check
    const original = t as { description?: string; inputSchema?: unknown; execute?: (...args: unknown[]) => unknown };
    wrapped[name] = tool({
      description: original.description || name,
      inputSchema: (original.inputSchema || z.object({})) as z.ZodType,
      execute: async (input: unknown, execOptions: unknown) => {
        emitEvent('tool:pre-use', { sessionId: ctx.sessionId, toolName: name, input });
        const result = checkPermission(name, input, ctx.permissionMode, getSessionRules(ctx.sessionId));

        if (result.action === 'deny') {
          return `Permission denied: ${result.reason || 'Tool not allowed in current mode'}`;
        }

        if (result.action === 'ask') {
          // Emit permission_request SSE and wait for user response
          const permId = crypto.randomBytes(8).toString('hex');

          // Persist to DB
          try {
            createPermissionRequest({
              id: permId,
              sessionId: ctx.sessionId,
              toolName: name,
              toolInput: JSON.stringify(input),
              expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            });
          } catch { /* non-critical */ }

          emitEvent('permission:request', { sessionId: ctx.sessionId, toolName: name, permissionId: permId });

          // Emit SSE
          ctx.emitSSE({
            type: 'permission_request',
            data: JSON.stringify({
              permissionRequestId: permId,
              toolName: name,
              toolInput: input,
              description: result.reason,
            }),
          });

          // Wait for user response
          const permResult = await registerPendingPermission(
            permId,
            (input || {}) as Record<string, unknown>,
            ctx.abortSignal,
          );

          emitEvent('permission:resolved', { sessionId: ctx.sessionId, toolName: name, behavior: permResult.behavior });

          if (permResult.behavior === 'deny') {
            return `Permission denied by user: ${permResult.message || 'Denied'}`;
          }

          // Apply user-modified input if provided (e.g. user edited the command)
          if (permResult.updatedInput) {
            input = permResult.updatedInput;
          }

          // Save session-level approval for future calls (allow_session)
          if (permResult.updatedPermissions && Array.isArray(permResult.updatedPermissions)) {
            const existing = sessionApprovals.get(ctx.sessionId) || [];
            existing.push({ toolName: name, pattern: '*' });
            sessionApprovals.set(ctx.sessionId, existing);
          }
        }

        // Execute the original tool (with possibly updated input from permission approval)
        if (original.execute) {
          const output = await original.execute(input, execOptions);
          emitEvent('tool:post-use', { sessionId: ctx.sessionId, toolName: name });
          return output;
        }
        return '(tool has no execute function)';
      },
    });
  }

  return wrapped;
}

