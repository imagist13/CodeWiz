/**
 * builtin-tools/widget-guidelines.ts — Widget design guidelines tool (shared).
 *
 * Provides the codepilot_load_widget_guidelines tool for loading
 * design system guidelines when generating visual widgets.
 */

import { tool } from 'ai';
import { z } from 'zod';

export const WIDGET_SYSTEM_PROMPT = `<widget-capability>
You can create interactive visualizations using the \`show-widget\` code fence.

## Format
\`\`\`show-widget
{"title":"snake_case_id","widget_code":"<raw HTML/SVG string>"}
\`\`\`

## Design Principles
- Use pure HTML/SVG/CSS. No external frameworks.
- All code in a single string (inline styles, inline scripts).
- Support dark/light themes via CSS variables.
- Use codepilot_load_widget_guidelines for detailed design specifications.
</widget-capability>`;

export function createWidgetGuidelinesTools() {
  return {
    codepilot_load_widget_guidelines: tool({
      description: 'Load detailed design guidelines for generating visual widgets. Call this before creating complex visualizations.',
      inputSchema: z.object({
        modules: z.array(z.enum(['interactive', 'chart', 'mockup', 'art', 'diagram']))
          .describe('Which guideline modules to load'),
      }),
      execute: async ({ modules }) => {
        try {
          // Dynamic import to avoid circular deps
          const { getGuidelines } = await import('@/lib/widget-guidelines');
          return getGuidelines(modules);
        } catch (err) {
          return `Failed to load widget guidelines: ${err instanceof Error ? err.message : 'unknown'}`;
        }
      },
    }),
  };
}
