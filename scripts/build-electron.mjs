import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('dist-electron');
fs.mkdirSync(outDir, { recursive: true });

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  external: ['electron', 'ws', 'bufferutil', 'utf-8-validate'],
};

await Promise.all([
  esbuild.build({
    ...shared,
    entryPoints: ['electron/main.ts'],
    outfile: 'dist-electron/main.js',
  }),
  esbuild.build({
    ...shared,
    entryPoints: ['electron/preload.ts'],
    outfile: 'dist-electron/preload.js',
  }),
]);

console.log('[build-electron] Built dist-electron/main.js and dist-electron/preload.js');
