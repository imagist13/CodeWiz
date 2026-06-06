import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.dirname(__dirname);

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: ['electron'],
  sourcemap: true,
  minify: false,
};

async function buildElectron() {
  const outDir = path.join(root, 'dist-electron');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  await Promise.all([
    build({
      ...shared,
      entryPoints: [path.join(root, 'electron', 'main.ts')],
      outfile: path.join(outDir, 'main.js'),
    }),
    build({
      ...shared,
      entryPoints: [path.join(root, 'electron', 'preload.ts')],
      outfile: path.join(outDir, 'preload.js'),
    }),
  ]);

  console.log('[electron:dev] Electron files compiled');
}

buildElectron().catch((err) => {
  console.error('[electron:dev] Build failed:', err);
  process.exit(1);
});
