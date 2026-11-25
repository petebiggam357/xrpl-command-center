import { execFile } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateRippledConfigBundle } from '../src/shared/studioUtils';
import type {
  DockerNodeStatus,
  DockerProvisionRequest,
  NodeConfigBundle,
  NodeStorageInfo,
} from '../src/shared/types';

const execFileAsync = promisify(execFile);
const CONTAINER_NAME = 'xrpl-command-node';
const DEFAULT_IMAGE = 'xrpllabsofficial/xrpld:latest';
const SETTINGS_FILENAME = 'node-storage-settings.json';

interface NodeStorageSettingsFile {
  customStorageRoot?: string;
}

async function runDocker(args: string[], timeoutMs = 15_000): Promise<{ stdout: string; stderr: string }> {
  const res = await execFileAsync('docker', args, {
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    stdout: String(res.stdout ?? '').trim(),
    stderr: String(res.stderr ?? '').trim(),
  };
}

function findNearestExistingAncestor(targetPath: string): string {
  let cur = path.resolve(targetPath);
  for (let i = 0; i < 32; i++) {
    if (fsSync.existsSync(cur)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return cur;
}

export class DockerNodeService {
  private readonly defaultRoot: string;
  private readonly settingsPath: string;
  private customStorageRoot: string | null = null;
  private settingsLoaded = false;

  constructor(userDataDir: string) {
    this.defaultRoot = path.join(userDataDir, 'managed-rippled');
    this.settingsPath = path.join(userDataDir, SETTINGS_FILENAME);
  }

  private async ensureSettingsLoaded(): Promise<void> {
    if (this.settingsLoaded) return;
    this.settingsLoaded = true;
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      const parsed = JSON.parse(raw) as NodeStorageSettingsFile;
      if (typeof parsed.customStorageRoot === 'string' && parsed.customStorageRoot.trim()) {
        this.customStorageRoot = path.resolve(parsed.customStorageRoot.trim());
      }
    } catch {
      this.customStorageRoot = null;
    }
  }

  private async persistSettings(): Promise<void> {
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    const payload: NodeStorageSettingsFile = this.customStorageRoot
      ? { customStorageRoot: this.customStorageRoot }
      : {};
    await fs.writeFile(this.settingsPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  public get activeStorageRoot(): string {
    return this.customStorageRoot || this.defaultRoot;
  }

  public get defaultConfigDir(): string {
    return path.join(this.activeStorageRoot, 'config');
  }

  public get activeDataDir(): string {
    return path.join(this.activeStorageRoot, 'data');
  }

  public async inspectStoragePath(targetRoot?: string): Promise<NodeStorageInfo> {
    await this.ensureSettingsLoaded();
    const resolvedRoot = targetRoot?.trim()
      ? path.resolve(targetRoot.trim())
      : this.activeStorageRoot;
    const configDir = path.join(resolvedRoot, 'config');
    const dataDir = path.join(resolvedRoot, 'data');
    const isDefault = path.resolve(resolvedRoot) === path.resolve(this.defaultRoot);

    let exists = false;
    try {
      const st = await fs.stat(resolvedRoot);
      exists = st.isDirectory();
    } catch {
      exists = false;
    }

    const probeDir = exists ? resolvedRoot : findNearestExistingAncestor(resolvedRoot);
    let writable = false;
    try {
      await fs.access(probeDir, fsSync.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }

    let freeBytes: number | null = null;
    let totalBytes: number | null = null;
    try {
      if (typeof fs.statfs === 'function') {
        const sfs = await fs.statfs(probeDir);
        const bsize = Number(sfs.bsize || 0);
        const bavail = Number(sfs.bavail || 0);
        const blocks = Number(sfs.blocks || 0);
        if (bsize > 0 && blocks > 0) {
          freeBytes = bsize * bavail;
          totalBytes = bsize * blocks;
        }
      }
    } catch {
      // statfs unavailable on some virtual filesystems
    }

    const freeGb = freeBytes !== null ? Number((freeBytes / 1024 ** 3).toFixed(2)) : null;
    const totalGb = totalBytes !== null ? Number((totalBytes / 1024 ** 3).toFixed(2)) : null;

    return {
      storageRoot: resolvedRoot,
      configDir,
      dataDir,
      isDefault,
      exists,
      writable,
      freeBytes,
      totalBytes,
      freeGb,
      totalGb,
    };
  }

  public async setCustomStorageRoot(customRoot: string | null): Promise<{
    ok: boolean;
    storageInfo?: NodeStorageInfo;
    status?: DockerNodeStatus;
    error?: string;
  }> {
    await this.ensureSettingsLoaded();

    if (!customRoot || !customRoot.trim()) {
      this.customStorageRoot = null;
      await this.persistSettings();
      const storageInfo = await this.inspectStoragePath();
      const status = await this.getStatus();
      return { ok: true, storageInfo, status };
    }

    const resolved = path.resolve(customRoot.trim());
    if (!path.isAbsolute(resolved)) {
      return { ok: false, error: 'Storage folder must be an absolute directory path.' };
    }

    try {
      await fs.mkdir(resolved, { recursive: true });
      await fs.access(resolved, fsSync.constants.W_OK);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? `Folder is not writable: ${err.message}`
            : 'Selected folder is not writable.',
      };
    }

    this.customStorageRoot = resolved;
    await this.persistSettings();
    const storageInfo = await this.inspectStoragePath(resolved);
    const status = await this.getStatus();
    return { ok: true, storageInfo, status };
  }

  public async getStatus(): Promise<DockerNodeStatus> {
    await this.ensureSettingsLoaded();
    const storageInfo = await this.inspectStoragePath();

    const base: DockerNodeStatus = {
      dockerInstalled: false,
      daemonRunning: false,
      containerExists: false,
      containerRunning: false,
      containerName: CONTAINER_NAME,
      storageRoot: this.activeStorageRoot,
      configDir: this.defaultConfigDir,
      dataDir: this.activeDataDir,
      storageInfo,
    };

    try {
      const ver = await runDocker(['version', '--format', '{{.Server.Version}}'], 6_000);
      base.dockerInstalled = true;
      base.daemonRunning = Boolean(ver.stdout);
      base.dockerVersion = ver.stdout || undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/ENOENT|not found/i.test(msg)) {
        return {
          ...base,
          error:
            'Docker CLI not found on PATH. Install Docker Engine / Docker Desktop to launch local containers.',
        };
      }
      return {
        ...base,
        dockerInstalled: true,
        daemonRunning: false,
        error:
          'Docker daemon is not running or current user lacks permission to access the Docker socket.',
      };
    }

    try {
      const inspect = await runDocker(['inspect', CONTAINER_NAME], 6_000);
      const arr = JSON.parse(inspect.stdout) as Array<Record<string, unknown>>;
      const info = arr[0];
      if (info) {
        const stateObj = (info.State ?? {}) as Record<string, unknown>;
        const configObj = (info.Config ?? {}) as Record<string, unknown>;
        const mounts = (info.Mounts ?? []) as Array<{ Source?: string; Destination?: string }>;
        const dataMount = mounts.find((m) => m.Destination === '/var/lib/rippled');

        base.containerExists = true;
        base.containerRunning = Boolean(stateObj.Running);
        base.containerState = String(stateObj.Status ?? 'unknown');
        base.image = String(configObj.Image ?? DEFAULT_IMAGE);
        base.mountedDataDir = dataMount?.Source;
        base.portsSummary = '127.0.0.1:5005 (Admin RPC), 127.0.0.1:6006 (WS), 0.0.0.0:51235 (Peer)';
      }
    } catch {
      // Container does not exist yet — normal initial state
    }

    return base;
  }

  public async loadConfigBundle(customDir?: string): Promise<NodeConfigBundle> {
    await this.ensureSettingsLoaded();
    const dir = customDir?.trim() || this.defaultConfigDir;
    const rippledCfgPath = path.join(dir, 'rippled.cfg');
    const validatorsTxtPath = path.join(dir, 'validators.txt');

    try {
      const [rippledCfg, validatorsTxt] = await Promise.all([
        fs.readFile(rippledCfgPath, 'utf8'),
        fs.readFile(validatorsTxtPath, 'utf8').catch(() => ''),
      ]);
      return {
        configDir: dir,
        rippledCfgPath,
        validatorsTxtPath,
        rippledCfg,
        validatorsTxt,
        existsOnDisk: true,
      };
    } catch {
      const generated = generateRippledConfigBundle({
        network: 'mainnet',
        sizing: '32gb-standard',
        dbBackend: 'NuDB',
        dataDir: '/var/lib/rippled',
        onlineDeleteLedgers: 2000,
        maxPeers: 50,
        enablePublicWs: false,
      });
      return {
        configDir: dir,
        rippledCfgPath,
        validatorsTxtPath,
        rippledCfg: generated.rippledCfg,
        validatorsTxt: generated.validatorsTxt,
        existsOnDisk: false,
      };
    }
  }

  public async saveConfigWithBackup(payload: {
    configDir?: string;
    rippledCfg: string;
    validatorsTxt: string;
  }): Promise<{ ok: boolean; backupPaths?: string[]; error?: string }> {
    await this.ensureSettingsLoaded();
    const dir = payload.configDir?.trim() || this.defaultConfigDir;
    const cfgPath = path.join(dir, 'rippled.cfg');
    const valPath = path.join(dir, 'validators.txt');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPaths: string[] = [];

    try {
      await fs.mkdir(dir, { recursive: true });

      for (const targetPath of [cfgPath, valPath]) {
        try {
          await fs.access(targetPath);
          const bak = `${targetPath}.bak.${stamp}`;
          await fs.copyFile(targetPath, bak);
          backupPaths.push(bak);
        } catch {
          // file didn't exist yet
        }
      }

      await fs.writeFile(cfgPath, payload.rippledCfg, 'utf8');
      await fs.writeFile(valPath, payload.validatorsTxt, 'utf8');
      return { ok: true, backupPaths };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to write configuration files',
      };
    }
  }

  public async provisionNode(req: DockerProvisionRequest): Promise<{
    ok: boolean;
    message?: string;
    status?: DockerNodeStatus;
    error?: string;
  }> {
    await this.ensureSettingsLoaded();
    if (req.storageRoot && req.storageRoot.trim()) {
      const setRes = await this.setCustomStorageRoot(req.storageRoot);
      if (!setRes.ok) {
        return { ok: false, error: setRes.error };
      }
    }

    const status = await this.getStatus();
    if (!status.daemonRunning) {
      return {
        ok: false,
        error: status.error ?? 'Docker daemon is not running.',
        status,
      };
    }

    const configDir = this.defaultConfigDir;
    const dataDir = this.activeDataDir;

    const bundle = generateRippledConfigBundle({
      network: req.network,
      sizing: req.sizing,
      dbBackend: req.dbBackend,
      dataDir: '/var/lib/rippled',
      onlineDeleteLedgers: req.onlineDeleteLedgers,
      maxPeers: req.sizing === '64gb-full' ? 80 : 50,
      enablePublicWs: false,
    });

    const saved = await this.saveConfigWithBackup({
      configDir,
      rippledCfg: bundle.rippledCfg,
      validatorsTxt: bundle.validatorsTxt,
    });
    if (!saved.ok) {
      return { ok: false, error: saved.error };
    }

    await fs.mkdir(path.join(dataDir, 'db'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'log'), { recursive: true });

    // Clean up existing container with same name if stopped/present
    if (status.containerExists) {
      await runDocker(['rm', '-f', CONTAINER_NAME], 20_000).catch(() => undefined);
    }

    const image = req.image?.trim() || DEFAULT_IMAGE;
    try {
      await runDocker(
        [
          'run',
          '-d',
          '--name',
          CONTAINER_NAME,
          '--restart',
          'unless-stopped',
          '-p',
          '127.0.0.1:5005:5005',
          '-p',
          '127.0.0.1:6006:6006',
          '-p',
          '51235:51235',
          '-v',
          `${configDir}:/config`,
          '-v',
          `${dataDir}:/var/lib/rippled`,
          image,
        ],
        180_000
      );

      return {
        ok: true,
        message: `Provisioned & started ${CONTAINER_NAME} (${req.network.toUpperCase()}) storing ledger DB in ${dataDir} with loopback Admin RPC on 127.0.0.1:5005.`,
        status: await this.getStatus(),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to start Docker container',
        status: await this.getStatus(),
      };
    }
  }

  public async lifecycleAction(
    action: 'start' | 'stop' | 'restart' | 'remove'
  ): Promise<{ ok: boolean; message?: string; status?: DockerNodeStatus; error?: string }> {
    try {
      if (action === 'remove') {
        await runDocker(['rm', '-f', CONTAINER_NAME], 20_000);
      } else {
        await runDocker([action, CONTAINER_NAME], 30_000);
      }
      return {
        ok: true,
        message: `Container ${CONTAINER_NAME}: ${action} completed.`,
        status: await this.getStatus(),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : `Docker ${action} failed`,
        status: await this.getStatus(),
      };
    }
  }

  public async readLogs(tailLines = 120): Promise<{ ok: boolean; lines: string[]; error?: string }> {
    try {
      const { stdout, stderr } = await runDocker(
        ['logs', '--tail', String(Math.min(400, Math.max(20, tailLines))), CONTAINER_NAME],
        8_000
      );
      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return {
        ok: true,
        lines: combined ? combined.split(/\r?\n/) : [],
      };
    } catch (err) {
      return {
        ok: false,
        lines: [],
        error: err instanceof Error ? err.message : 'Unable to read container logs',
      };
    }
  }
}
