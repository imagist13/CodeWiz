/**
 * builtin-tools/notification.ts — Notification tool handlers (shared between runtimes).
 *
 * These are the pure handler functions extracted from notification-mcp.ts.
 * Both SDK Runtime (via createSdkMcpServer) and Native Runtime (via AI SDK tool())
 * use these same handlers — single source of truth.
 */

import { tool } from 'ai';
import { z } from 'zod';

function getBaseUrl(): string {
  const port = process.env.PORT || '3000';
  return `http://localhost:${port}`;
}

export const NOTIFICATION_SYSTEM_PROMPT = `## 通知与定时任务

你可以发送通知和创建定时任务：

- codepilot_notify: 立即发送通知给用户（支持系统通知和应用内提示）
- codepilot_schedule_task: 创建定时任务（支持 cron 表达式、固定间隔、一次性定时）
- codepilot_list_tasks: 查看已有的定时任务
- codepilot_cancel_task: 取消定时任务
- codepilot_hatch_buddy: 孵化或命名用户的助理伙伴

使用场景：
- 用户说"提醒我..."或"X 分钟后..." → 用 codepilot_schedule_task（schedule_type: "once"）
- 用户说"每天/每小时..." → 用 codepilot_schedule_task（schedule_type: "cron" 或 "interval"）
- 任务完成需要告知用户 → 用 codepilot_notify
- 用户问"有哪些定时任务" → 用 codepilot_list_tasks
- 用户说"孵化"、"领养"、"hatch" → 用 codepilot_hatch_buddy
- 用户给伙伴起名字 → 用 codepilot_hatch_buddy(buddyName: 名字)`;

/**
 * Create notification tools as Vercel AI SDK ToolSet.
 * Can be used by both Native Runtime and as reference for SDK Runtime.
 */
export function createNotificationTools() {
  return {
    codepilot_notify: tool({
      description: 'Send an immediate notification to the user.',
      inputSchema: z.object({
        title: z.string().describe('Notification title'),
        body: z.string().describe('Notification body text'),
        priority: z.enum(['low', 'normal', 'urgent']).optional().describe('low=toast, normal=toast+system, urgent=+telegram'),
      }),
      execute: async ({ title, body, priority }) => {
        try {
          const { sendNotification } = await import('@/lib/notification-manager');
          await sendNotification({ title, body, priority: priority || 'normal' });
          return `Notification sent: "${title}"`;
        } catch (err) {
          return `Failed to send notification: ${err instanceof Error ? err.message : 'unknown'}`;
        }
      },
    }),

    codepilot_schedule_task: tool({
      description: 'Create a scheduled task (cron/interval/once).',
      inputSchema: z.object({
        name: z.string().describe('Task name'),
        prompt: z.string().describe('Instruction to execute when triggered'),
        schedule_type: z.enum(['cron', 'interval', 'once']),
        schedule_value: z.string().describe('cron: "0 9 * * *", interval: "30m", once: ISO timestamp'),
        priority: z.enum(['low', 'normal', 'urgent']).optional(),
        notify_on_complete: z.boolean().optional(),
        durable: z.boolean().optional().describe('true=persists across restart'),
      }),
      execute: async ({ name, prompt, schedule_type, schedule_value, priority, notify_on_complete, durable }) => {
        try {
          const baseUrl = getBaseUrl();
          const res = await fetch(`${baseUrl}/api/tasks/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, prompt, schedule_type, schedule_value, priority, notify_on_complete, durable }),
          });
          const data = await res.json();
          if (!res.ok) return `Failed to create task: ${data.error || res.statusText}`;
          return `Task "${name}" created (${schedule_type}: ${schedule_value})`;
        } catch (err) {
          return `Failed to create task: ${err instanceof Error ? err.message : 'unknown'}`;
        }
      },
    }),

    codepilot_list_tasks: tool({
      description: 'List scheduled tasks.',
      inputSchema: z.object({
        status: z.enum(['active', 'paused', 'completed', 'disabled', 'all']).optional(),
      }),
      execute: async ({ status }) => {
        try {
          const baseUrl = getBaseUrl();
          const qs = status ? `?status=${status}` : '';
          const res = await fetch(`${baseUrl}/api/tasks/list${qs}`);
          const data = await res.json();
          if (!res.ok) return `Failed to list tasks: ${data.error || res.statusText}`;
          const tasks = data.tasks || [];
          if (tasks.length === 0) return 'No scheduled tasks found.';
          return tasks.map((t: { name: string; status: string; schedule_type: string; schedule_value: string }) =>
            `- ${t.name} (${t.status}) [${t.schedule_type}: ${t.schedule_value}]`
          ).join('\n');
        } catch (err) {
          return `Failed to list tasks: ${err instanceof Error ? err.message : 'unknown'}`;
        }
      },
    }),

    codepilot_cancel_task: tool({
      description: 'Cancel a scheduled task by ID.',
      inputSchema: z.object({
        task_id: z.string().describe('Task ID to cancel'),
      }),
      execute: async ({ task_id }) => {
        try {
          const baseUrl = getBaseUrl();
          const res = await fetch(`${baseUrl}/api/tasks/${task_id}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return `Failed to cancel task: ${(data as { error?: string }).error || res.statusText}`;
          }
          return `Task ${task_id} cancelled.`;
        } catch (err) {
          return `Failed to cancel task: ${err instanceof Error ? err.message : 'unknown'}`;
        }
      },
    }),
  };
}
