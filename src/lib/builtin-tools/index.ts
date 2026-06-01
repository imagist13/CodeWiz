/**
 * builtin-tools/index.ts — Registry of built-in MCP-equivalent tools for Native Runtime.
 *
 * These tools provide the same capabilities as the 7 built-in MCP servers
 * (notification, memory, dashboard, cli-tools, media, image-gen, widget)
 * but packaged as Vercel AI SDK tools for the Native Runtime.
 *
 * Migration status:
 * ✅ notification (4 tools) — fully migrated
 * ✅ memory-search (3 tools) — fully migrated
 * ✅ dashboard (5 tools) — fully migrated
 * ✅ media (2 tools: import + generate) — fully migrated
 * ✅ widget-guidelines (1 tool) — fully migrated
 * ✅ cli-tools (6 tools) — fully migrated
 */

import type { ToolSet } from 'ai';

export interface BuiltinToolGroup {
  name: string;
  systemPrompt: string;
  condition: 'always' | 'workspace' | { keywords: RegExp };
  tools: ToolSet;
}

/**
 * Get all built-in tools that should be registered for the current context.
 */
export function getBuiltinTools(options: {
  workspacePath?: string;
  prompt?: string;
}): { tools: ToolSet; systemPrompts: string[] } {
  const tools: ToolSet = {};
  const systemPrompts: string[] = [];

  for (const group of getToolGroups(options)) {
    // Check condition
    if (group.condition === 'always') {
      // Always include
    } else if (group.condition === 'workspace') {
      if (!options.workspacePath) continue;
    } else if (typeof group.condition === 'object' && group.condition.keywords) {
      const text = (options.prompt || '').toLowerCase();
      if (!group.condition.keywords.test(text)) continue;
    }

    Object.assign(tools, group.tools);
    if (group.systemPrompt) {
      systemPrompts.push(group.systemPrompt);
    }
  }

  return { tools, systemPrompts };
}

function getToolGroups(options: { workspacePath?: string }): BuiltinToolGroup[] {
  const groups: BuiltinToolGroup[] = [];

  // Notification tools — always available
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createNotificationTools, NOTIFICATION_SYSTEM_PROMPT } = require('./notification');
    groups.push({
      name: 'codepilot-notify',
      systemPrompt: NOTIFICATION_SYSTEM_PROMPT,
      condition: 'always',
      tools: createNotificationTools(),
    });
  } catch { /* notification module not available */ }

  // Widget guidelines — keyword-gated
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createWidgetGuidelinesTools, WIDGET_SYSTEM_PROMPT } = require('./widget-guidelines');
    groups.push({
      name: 'codepilot-widget-guidelines',
      systemPrompt: WIDGET_SYSTEM_PROMPT,
      condition: 'always',
      tools: createWidgetGuidelinesTools(),
    });
  } catch { /* module not available */ }

  // Dashboard tools — keyword-gated
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createDashboardTools, DASHBOARD_SYSTEM_PROMPT } = require('./dashboard');
    groups.push({
      name: 'codepilot-dashboard',
      systemPrompt: DASHBOARD_SYSTEM_PROMPT,
      condition: 'always',
      tools: createDashboardTools(),
    });
  } catch { /* module not available */ }

  // Media tools — keyword-gated
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMediaTools, MEDIA_SYSTEM_PROMPT } = require('./media');
    groups.push({
      name: 'codepilot-media',
      systemPrompt: MEDIA_SYSTEM_PROMPT,
      condition: 'always',
      tools: createMediaTools(),
    });
  } catch { /* module not available */ }

  // Memory search tools — workspace-gated
  if (options.workspacePath) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createMemorySearchTools, MEMORY_SEARCH_SYSTEM_PROMPT } = require('./memory-search');
      groups.push({
        name: 'codepilot-memory',
        systemPrompt: MEMORY_SEARCH_SYSTEM_PROMPT,
        condition: 'workspace',
        tools: createMemorySearchTools(options.workspacePath),
      });
    } catch { /* module not available */ }
  }

  // Session history search tool — always available (queries SQLite messages table)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSessionSearchTools, SESSION_SEARCH_SYSTEM_PROMPT } = require('./session-search');
    groups.push({
      name: 'codepilot-session-search',
      systemPrompt: SESSION_SEARCH_SYSTEM_PROMPT,
      condition: 'always',
      tools: createSessionSearchTools(),
    });
  } catch { /* module not available */ }

  // AskUserQuestion — structured question UI for Native Runtime.
  // SDK Runtime has this built in; Native Runtime needs it as a builtin tool.
  // The tool goes through the permission wrapper which emits permission_request SSE,
  // and the existing AskUserQuestionUI in PermissionPrompt.tsx renders the UI.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAskUserQuestionTools, ASK_USER_QUESTION_SYSTEM_PROMPT } = require('./ask-user-question');
    groups.push({
      name: 'codepilot-ask-user',
      systemPrompt: ASK_USER_QUESTION_SYSTEM_PROMPT,
      condition: 'always',
      tools: createAskUserQuestionTools(),
    });
  } catch { /* module not available */ }

  // CLI tools — keyword-gated
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createCliToolsTools, CLI_TOOLS_SYSTEM_PROMPT } = require('./cli-tools');
    groups.push({
      name: 'codepilot-cli-tools',
      systemPrompt: CLI_TOOLS_SYSTEM_PROMPT,
      condition: 'always',
      tools: createCliToolsTools(),
    });
  } catch { /* module not available */ }

  return groups;
}
