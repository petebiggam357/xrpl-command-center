import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DockerNodeService } from '../electron/dockerNodeService';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe('v0.1.1-beta Custom Node Storage Drive & Folder Persistence', () => {
  it('persists custom node storage folder, reports disk free space, and writes rippled.cfg into custom drive', async () => {
    const userDataDir = await makeTempDir('xrpl-cc-userdata-');
    const customDriveDir = await makeTempDir('xrpl-cc-custom-drive-');
    const chosenNodeRoot = path.join(customDriveDir, 'xrpl-mainnet-node');

    const svc1 = new DockerNodeService(userDataDir);
    const initialInfo = await svc1.inspectStoragePath();
    expect(initialInfo.isDefault).toBe(true);
    expect(initialInfo.writable).toBe(true);
    expect(initialInfo.freeGb === null || initialInfo.freeGb > 0).toBe(true);

    // Switch storage root to custom drive folder
    const setRes = await svc1.setCustomStorageRoot(chosenNodeRoot);
    expect(setRes.ok).toBe(true);
    expect(setRes.storageInfo?.isDefault).toBe(false);
    expect(setRes.storageInfo?.storageRoot).toBe(chosenNodeRoot);
    expect(setRes.storageInfo?.dataDir).toBe(path.join(chosenNodeRoot, 'data'));
    expect(setRes.storageInfo?.configDir).toBe(path.join(chosenNodeRoot, 'config'));

    // Save rippled.cfg & validators.txt and confirm they land inside the custom drive folder
    const saved = await svc1.saveConfigWithBackup({
      rippledCfg: '[server]\nport_rpc_admin_local\n',
      validatorsTxt: '[validator_list_sites]\nhttps://vl.ripple.com\n',
    });
    expect(saved.ok).toBe(true);

    const cfgOnDisk = await fs.readFile(path.join(chosenNodeRoot, 'config', 'rippled.cfg'), 'utf8');
    expect(cfgOnDisk).toContain('port_rpc_admin_local');

    // Re-instantiate service (simulating app restart) and verify persistence
    const svc2 = new DockerNodeService(userDataDir);
    const reloadedInfo = await svc2.inspectStoragePath();
    expect(reloadedInfo.isDefault).toBe(false);
    expect(reloadedInfo.storageRoot).toBe(chosenNodeRoot);

    const loadedBundle = await svc2.loadConfigBundle();
    expect(loadedBundle.existsOnDisk).toBe(true);
    expect(loadedBundle.configDir).toBe(path.join(chosenNodeRoot, 'config'));
    expect(loadedBundle.rippledCfg).toContain('port_rpc_admin_local');

    // Reset back to default
    const resetRes = await svc2.setCustomStorageRoot(null);
    expect(resetRes.ok).toBe(true);
    expect(resetRes.storageInfo?.isDefault).toBe(true);
  });
});
