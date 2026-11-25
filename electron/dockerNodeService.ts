import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateRippledConfigBundle } from '../src/shared/studioUtils';
import type {
  DockerNodeStatus,
  DockerProvisionRequest,
  NodeConfigBundle,
} from '../src/shared/types';

const execFileAsync = promisify(execFile);
const CONTAINER_NAME = 'xrpl-command-node';
const DEFAULT_IMAGE = 'xrpllabsofficial/xrpld:latest';

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

export class DockerNodeService {
  private readonly managedRoot: string;

  constructor(userDataDir: string) {
    this.managedRoot = path.join(userDataDir, 'managed-rippled');
  }

  public get defaultConfigDir(): string {
    return path.join(this.managedRoot, 'config');
  }

  private get defaultDataDir(): string {
    return path.join(this.managedRoot, 'data');
  }

  public async getStatus(): Promise<DockerNodeStatus> {
    const base: DockerNodeStatus = {
      dockerInstalled: false,
      daemonRunning: false,
      containerExists: false,
      containerRunning: false,
      containerName: CONTAINER_NAME,
      configDir: this.defaultConfigDir,
    };

    try {
      const ver = await runDocker(['version', '--format', '{{.Server.Version}}'], 6_000);
      base.dockerInstalled = true;
      base.daemonRunning = Boolean(ver.stdout);
      base.dockerVersion = ver.stdout || undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/ENOENT|not found/i.test(msg)) {
        return { ...base, error: 'Docker CLI not found on PATH. Install Docker Engine / Docker Desktop to launch local containers.' };
      }
      return {
        ...base,
        dockerInstalled: true,
        daemonRunning: false,
        error: 'Docker daemon is not running or current user lacks permission to access the Docker socket.',
      };
    }

    try {
      const inspect = await runDocker(['inspect', CONTAINER_NAME], 6_000);
      const arr = JSON.parse(inspect.stdout) as Array<Record<string, unknown>>;
      const info = arr[0];
      if (info) {
        const stateObj = (info.State ?? {}) as Record<string, unknown>;
        const configObj = (info.Config ?? {}) as Record<string, unknown>;
        base.containerExists = true;
        base.containerRunning = Boolean(stateObj.Running);
        base.containerState = String(stateObj.Status ?? 'unknown');
        base.image = String(configObj.Image ?? DEFAULT_IMAGE);
        base.portsSummary = '127.0.0.1:5005 (Admin RPC), 127.0.0.1:6006 (WS), 0.0.0.0:51235 (Peer)';
      }
    } catch {
      // Container does not exist yet — normal initial state
    }

    return base;
  }

  public async loadConfigBundle(customDir?: string): Promise<NodeConfigBundle> {
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
    const status = await this.getStatus();
    if (!status.daemonRunning) {
      return {
        ok: false,
        error: status.error ?? 'Docker daemon is not running.',
        status,
      };
    }

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
      configDir: this.defaultConfigDir,
      rippledCfg: bundle.rippledCfg,
      validatorsTxt: bundle.validatorsTxt,
    });
    if (!saved.ok) {
      return { ok: false, error: saved.error };
    }

    await fs.mkdir(path.join(this.defaultDataDir, 'db'), { recursive: true });
    await fs.mkdir(path.join(this.defaultDataDir, 'log'), { recursive: true });

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
          `${this.defaultConfigDir}:/config`,
          '-v',
          `${this.defaultDataDir}:/var/lib/rippled`,
          image,
        ],
        180_000
      );

      return {
        ok: true,
        message: `Provisioned & started ${CONTAINER_NAME} (${req.network.toUpperCase()}) with loopback Admin RPC on 127.0.0.1:5005.`,
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
