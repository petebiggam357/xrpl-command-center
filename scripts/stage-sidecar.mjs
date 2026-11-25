import fs from 'node:fs';
import path from 'node:path';

const binName = process.platform === 'win32' ? 'xrpl-vault-sidecar.exe' : 'xrpl-vault-sidecar';
const srcPath = path.resolve('rust-vault', 'target', 'release', binName);
const destDir = path.resolve('build', 'bin');
const destPath = path.join(destDir, binName);

fs.mkdirSync(destDir, { recursive: true });

if (fs.existsSync(srcPath)) {
  fs.copyFileSync(srcPath, destPath);
  if (process.platform !== 'win32') {
    fs.chmodSync(destPath, 0o755);
  }
  const sizeKb = (fs.statSync(destPath).size / 1024).toFixed(1);
  console.log(`[stage-sidecar] Staged ${binName} (${sizeKb} KB) -> build/bin/${binName}`);
} else {
  console.log(`[stage-sidecar] Rust release binary not found at ${srcPath} (run "npm run build:rust" to bundle native Rust vault)`);
}
