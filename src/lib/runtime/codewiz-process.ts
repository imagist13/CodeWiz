/**
 * runtime/codewiz-process.ts — Node.js-only process management for codewiz-agent.
 *
 * This file is imported via dynamic `import()` so it only runs in Node.js,
 * not in the browser. Place all child_process / Node.js built-in usage here.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_PORT = 18732;
const STARTUP_TIMEOUT_MS = 15_000;

let pythonProcess: ReturnType<typeof import('child_process').spawn> | null = null;
let fastApiReady = false;
let fastApiFailed = false;
let startupPromise: Promise<void> | null = null;

function getPySrc(): string {
  // __dirname equivalent for ESM
  const currentFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(currentFile), '..', 'lib', 'codewiz-agent');
}

function getPort(): number {
  return Number(process.env.FASTAPI_PORT ?? DEFAULT_PORT);
}

export function ensureFastApi(): Promise<void> {
  if (fastApiReady) return Promise.resolve();
  if (fastApiFailed) return Promise.reject(new Error('FastAPI backend failed to start'));
  if (startupPromise) return startupPromise;
  startupPromise = _startFastApi().then(() => { startupPromise = null; });
  return startupPromise;
}

async function _startFastApi(): Promise<void> {
  const { spawn } = await import('child_process');
  const port = getPort();
  const pySrc = getPySrc();

  console.log('[codewiz-runtime] Starting FastAPI backend on port', port);

  pythonProcess = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: pySrc,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env, PYTHONPATH: pySrc },
  });

  let stderr = '';
  pythonProcess.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf-8');
  });

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        fastApiReady = true;
        console.log('[codewiz-runtime] FastAPI backend ready');
        return;
      }
    } catch {
      // not ready yet
    }
    if (pythonProcess?.exitCode !== null) {
      fastApiFailed = true;
      console.error('[codewiz-runtime] FastAPI process exited early:\n' + stderr);
      throw new Error(`FastAPI exited with code ${pythonProcess.exitCode}`);
    }
  }
  fastApiFailed = true;
  pythonProcess?.kill();
  throw new Error(`FastAPI did not start within ${STARTUP_TIMEOUT_MS}ms`);
}

export function disposeFastApi(): void {
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
  fastApiReady = false;
  fastApiFailed = false;
  startupPromise = null;
}

export function getFastApiPort(): number {
  return getPort();
}
