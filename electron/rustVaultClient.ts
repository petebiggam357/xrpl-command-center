import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import fsSync from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { VaultStatus, WalletAccountPublic, WalletAlgorithm } from '../src/shared/types';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface SidecarResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export function resolveRustSidecarBinaryPath(isPackaged: boolean, resourcesPath?: string): string | null {
  const binName = process.platform === 'win32' ? 'xrpl-vault-sidecar.exe' : 'xrpl-vault-sidecar';
  const candidates: string[] = [];

  if (isPackaged && resourcesPath) {
    candidates.push(path.join(resourcesPath, binName));
    candidates.push(path.join(resourcesPath, 'bin', binName));
  }
  candidates.push(path.resolve(process.cwd(), 'rust-vault', 'target', 'release', binName));
  candidates.push(path.resolve(process.cwd(), 'rust-vault', 'target', 'debug', binName));
  candidates.push(path.resolve(__dirname, '..', 'rust-vault', 'target', 'release', binName));

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export class RustVaultSidecarClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private seq = 1;
  private pending = new Map<number, PendingCall>();

  constructor(
    private readonly binaryPath: string,
    private readonly storageDir: string
  ) {}

  public isRunning(): boolean {
    return Boolean(this.proc && !this.proc.killed && this.proc.exitCode === null);
  }

  public start(): void {
    if (this.isRunning()) return;
    fsSync.mkdirSync(this.storageDir, { recursive: true });

    const child = spawn(this.binaryPath, ['--vault-dir', this.storageDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc = child;
    this.rl = readline.createInterface({ input: child.stdout });

    this.rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line) as SidecarResponse;
        const call = this.pending.get(msg.id);
        if (!call) return;
        clearTimeout(call.timer);
        this.pending.delete(msg.id);
        if (msg.ok) {
          call.resolve(msg.result);
        } else {
          call.reject(new Error(msg.error ?? 'Rust vault sidecar error'));
        }
      } catch {
        // ignore non-JSON stderr/noise
      }
    });

    child.on('exit', () => {
      for (const [id, item] of this.pending.entries()) {
        clearTimeout(item.timer);
        item.reject(new Error('Rust vault sidecar exited unexpectedly'));
        this.pending.delete(id);
      }
      this.proc = null;
      this.rl = null;
    });
  }

  public shutdown(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.proc) {
      try {
        this.proc.stdin.end();
        this.proc.kill();
      } catch {
        // ignore
      }
      this.proc = null;
    }
  }

  private call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.isRunning()) {
      this.start();
    }
    return new Promise<T>((resolve, reject) => {
      if (!this.proc || !this.proc.stdin.writable) {
        reject(new Error('Rust vault sidecar stdin unavailable'));
        return;
      }
      const id = this.seq++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Rust vault sidecar timeout for "${method}"`));
      }, 20_000);

      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });

      this.proc.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  public async getStatus(): Promise<VaultStatus> {
    const raw = await this.call<{
      initialized: boolean;
      unlocked: boolean;
      backend: 'rust-sidecar';
      kdf: string;
      pid: number;
      accounts: WalletAccountPublic[];
    }>('status');

    return {
      initialized: raw.initialized,
      unlocked: raw.unlocked,
      osKeychainAvailable: false,
      backend: 'rust-sidecar',
      kdf: raw.kdf,
      sidecarPid: raw.pid,
      accounts: raw.accounts,
    };
  }

  public async setupVault(passphrase: string): Promise<VaultStatus> {
    await this.call('setup', { passphrase });
    return this.getStatus();
  }

  public async unlock(passphrase: string): Promise<VaultStatus> {
    await this.call('unlock', { passphrase });
    return this.getStatus();
  }

  public async lock(): Promise<VaultStatus> {
    await this.call('lock');
    return this.getStatus();
  }

  public async createWallet(
    label: string,
    algorithm: WalletAlgorithm
  ): Promise<{ account: WalletAccountPublic; oneTimeSeed: string; status: VaultStatus }> {
    const res = await this.call<{
      account: WalletAccountPublic;
      oneTimeSeed: string;
    }>('create', { label, algorithm });
    return {
      account: res.account,
      oneTimeSeed: res.oneTimeSeed,
      status: await this.getStatus(),
    };
  }

  public async importSeed(
    label: string,
    seed: string
  ): Promise<{ account: WalletAccountPublic; status: VaultStatus }> {
    const res = await this.call<{ account: WalletAccountPublic }>('import', { label, seed });
    return {
      account: res.account,
      status: await this.getStatus(),
    };
  }

  public async addWatchOnly(
    label: string,
    address: string,
    isHardwareLedger = false,
    derivationPath?: string
  ): Promise<{ account: WalletAccountPublic; status: VaultStatus }> {
    const res = await this.call<{ account: WalletAccountPublic }>('addWatch', {
      label,
      address,
      isHardwareLedger,
      derivationPath,
    });
    return {
      account: res.account,
      status: await this.getStatus(),
    };
  }

  public async removeAccount(walletId: string): Promise<VaultStatus> {
    await this.call('remove', { walletId });
    return this.getStatus();
  }

  public async getPublicKey(walletId: string): Promise<{ address: string; publicKeyHex: string }> {
    return this.call<{ address: string; publicKeyHex: string }>('getPublicKey', { walletId });
  }

  public async signPayload(
    walletId: string,
    signingPayloadHex: string
  ): Promise<{ address: string; publicKeyHex: string; signatureHex: string }> {
    return this.call<{ address: string; publicKeyHex: string; signatureHex: string }>('signPayload', {
      walletId,
      signingPayloadHex,
    });
  }
}
