/**
 * runtime/python-chat.ts — Subprocess management for the Python Agent CLI.
 *
 * Phase 1: one-shot per-request invocation, no multi-turn session management.
 *
 * SSE format from Python CLI:
 *   data: {"type":"status",   "data":"{\"session_id\":\"...\",\"model\":\"...\"}"}
 *   data: {"type":"text",     "data":"Hello"}
 *   data: {"type":"thinking", "data":"Reasoning..."}
 *   data: {"type":"result",   "data":"{\"usage\":{...},\"num_turns\":1,...}"}
 *   data: {"type":"error",    "data":"{\"category\":\"...\",\"userMessage\":\"...\"}"}
 *   data: {"type":"done",     "data":""}
 */

import { spawn } from 'child_process';
import { Readable } from 'stream';

export interface PythonChatOptions {
  prompt: string;
  sessionId: string;
  model?: string;
  systemPrompt?: string;
  thinking?:
    | { type: 'adaptive' }
    | { type: 'enabled'; budgetTokens?: number }
    | { type: 'disabled' };
  apiKey: string;
  baseUrl?: string;
  protocol?: 'anthropic' | 'openai-compatible';
  maxTokens?: number;
  abortController?: AbortController;
}

/** Detect a Python interpreter with the codepilot-agent package installed. */
export function findPythonExecutable(): string | null {
  const { execFileSync } = require('child_process');
  const isWindows = process.platform === 'win32';

  const candidates = isWindows
    ? [
        'D:\\compiler\\Anaconda3\\python.exe',
        'D:\\compiler\\Python312\\python.exe',
        'python',
        'python3',
      ]
    : ['python3', 'python'];

  for (const exe of candidates) {
    try {
      const out = execFileSync(exe, ['-c', 'import codepilot_agent; print("ok")'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: false,
      });
      if (out.trim() === 'ok') return exe;
    } catch {
      // Not found or package missing
    }
  }
  return null;
}

function buildArgv(o: PythonChatOptions): string[] {
  const a: string[] = ['--prompt', o.prompt, '--session-id', o.sessionId];
  if (o.model) a.push('--model', o.model);
  if (o.systemPrompt) a.push('--system-prompt', o.systemPrompt);
  if (o.maxTokens) a.push('--max-tokens', String(o.maxTokens));
  if (o.protocol) a.push('--protocol', o.protocol);
  if (o.thinking) {
    a.push('--thinking', o.thinking.type);
    if (o.thinking.type === 'enabled' && o.thinking.budgetTokens) {
      a.push('--thinking-budget', String(o.thinking.budgetTokens));
    }
  }
  if (o.baseUrl) a.push('--base-url', o.baseUrl);
  return a;
}

function buildEnv(o: PythonChatOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (o.apiKey) env['ANTHROPIC_API_KEY'] = o.apiKey;
  if (o.baseUrl) {
    if (o.protocol === 'openai-compatible') env['OPENAI_BASE_URL'] = o.baseUrl;
    else env['ANTHROPIC_BASE_URL'] = o.baseUrl;
  }
  if (o.protocol) env['CODEPILOT_PROVIDER_TYPE'] = o.protocol;
  return env;
}

/**
 * Parse one SSE line: "data: {...}\n"
 * Returns {type, data} or null if the line is not a valid SSE event.
 */
function parseSSELine(raw: string): { type: string; data: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('data: ')) return null;
  try {
    return JSON.parse(trimmed.slice(6)) as { type: string; data: string };
  } catch {
    return null;
  }
}

/**
 * Convert a Node.js Readable into a Web ReadableStream<Buffer>.
 * Uses the async iterator pattern for reliable backpressure.
 */
function nodeToWebReadable(nodeReadable: Readable): ReadableStream<Buffer> {
  const reader = nodeReadable[Symbol.asyncIterator]
    ? (nodeReadable as AsyncIterable<Buffer>)[Symbol.asyncIterator]()
    : null;

  if (reader) {
    return new ReadableStream({
      async pull(controller) {
        const { value, done } = await reader.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      },
      cancel() {
        (reader as { return?: () => void }).return?.();
      },
    });
  }

  // Fallback for Node < 12 where Readable is not AsyncIterable
  return new ReadableStream({
    async pull(controller) {
      const chunk = await new Promise<Buffer | null>((resolve) => {
        const onData = (c: Buffer) => {
          nodeReadable.removeListener('data', onData);
          nodeReadable.removeListener('end', onEnd);
          nodeReadable.removeListener('error', onError);
          resolve(c);
        };
        const onEnd = () => { resolve(null); };
        const onError = () => { resolve(null); };
        nodeReadable.on('data', onData);
        nodeReadable.on('end', onEnd);
        nodeReadable.on('error', onError);
        nodeReadable.pause();
      });
      if (chunk === null) {
        controller.close();
      } else {
        controller.enqueue(chunk);
      }
    },
    cancel() {
      nodeReadable.destroy();
    },
  });
}

/**
 * Run the Python CLI and return a ReadableStream<string> of SSE lines.
 *
 * The stream yields raw SSE lines ready to forward to the client.
 * Events are streamed as they arrive — no buffering of the complete response.
 */
export function pythonChat(options: PythonChatOptions): ReadableStream<string> {
  const pythonExe = findPythonExecutable();

  if (!pythonExe) {
    const errorPayload = JSON.stringify({
      type: 'error',
      data: JSON.stringify({
        category: 'PYTHON_NOT_FOUND',
        userMessage:
          'Python 3.9+ not found. Install Python and run: pip install codepilot-agent',
        actionHint: 'pip install -e scripts/codepilot-agent',
        retryable: false,
      }),
    });
    const donePayload = JSON.stringify({ type: 'done', data: '' });
    return new ReadableStream({
      start(c) {
        c.enqueue(`data: ${errorPayload}\n\n`);
        c.enqueue(`data: ${donePayload}\n\n`);
        c.close();
      },
    });
  }

  const argv = buildArgv(options);
  const env = buildEnv(options);

  const child = spawn(pythonExe, ['-m', 'codepilot_agent.cli', ...argv], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  const stderrChunks: string[] = [];
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString('utf-8'));
  });

  options.abortController?.signal.addEventListener('abort', () => {
    child.kill('SIGTERM');
  });

  // ── SSE-transforming stream ───────────────────────────────────────────────
  // Collects raw bytes, assembles complete lines, parses SSE, forwards lines.
  let lineBuffer = '';

  const byteStream = nodeToWebReadable(child.stdout as Readable);

  const transform = new TransformStream<Buffer, string>({
    transform(chunk, controller) {
      const text = lineBuffer + new TextDecoder('utf-8').decode(chunk, { stream: true });
      const lines = text.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const parsed = parseSSELine(rawLine);
        if (parsed) {
          controller.enqueue(rawLine.trim() + '\n');
        }
      }
    },

    flush(controller) {
      if (lineBuffer.trim()) {
        const parsed = parseSSELine(lineBuffer);
        if (parsed) controller.enqueue(lineBuffer.trim() + '\n');
      }
      const stderr = stderrChunks.join('');
      if (stderr) console.warn('[python-chat] stderr:', stderr);
      child.removeAllListeners();
    },
  });

  return byteStream.pipeThrough(transform);
}
