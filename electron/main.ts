import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  safeStorage,
  shell,
  Tray,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { classicAddressToXAddress, xAddressToClassicAddress } from 'xrpl';
import type {
  AssetSpec,
  DesktopNotificationPayload,
  DockerProvisionRequest,
  MarketOhlcRequest,
  NetworkId,
  NodeConnectionConfig,
  TrayAndUpdaterSettings,
  WalletAlgorithm,
  WalletTxIntent,
} from '../src/shared/types';
import {
  compareSemver,
  parseSha256Manifest,
  pickPlatformAsset,
  verifySha256Digest,
  type GithubReleaseAssetLike,
} from '../src/shared/updaterUtils';
import { buildTaxReadyCsv, redactDiagnosticText } from '../src/shared/v020Utils';
import { AnalyticsSqliteService } from './analyticsService';
import { DirectoryService } from './directoryService';
import { DockerNodeService } from './dockerNodeService';
import { McpAgentService } from './mcpAgentService';
import { NodeOpsService } from './nodeOpsService';
import { resolveRustSidecarBinaryPath, RustVaultSidecarClient } from './rustVaultClient';
import { WalletVaultService } from './walletVaultService';
import { XrplStreamManager } from './xrplStream';
import type { AgentProviderId, LedgerSnapshot } from '../src/shared/types';

const APP_VERSION = '0.3.0-beta';
const GITHUB_OWNER = 'petebiggam357';
const GITHUB_REPO = 'xrpl-command-center';
const LEDGER_USB_VENDOR_ID = 0x2c97;
const TREZOR_USB_VENDOR_IDS = new Set([0x1209, 0x534c]);
const execFileAsync = promisify(execFile);

interface PendingDirectUpdate {
  version: string;
  releaseUrl: string;
  releaseNotes: string;
  binary: GithubReleaseAssetLike;
  checksumFile: GithubReleaseAssetLike | null;
}

let pendingDirectUpdate: PendingDirectUpdate | null = null;
let stagedUpdateFile: string | null = null;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let rustSidecar: RustVaultSidecarClient | null = null;
let watchdogTimer: NodeJS.Timeout | null = null;
let lastMonitoredNodeConfig: NodeConnectionConfig = {
  label: 'Local rippled Admin Node',
  rpcUrl: 'http://127.0.0.1:5005',
};
let lastNodeHealthy: boolean | null = null;
const recentLedgers: LedgerSnapshot[] = [];

const trayUpdaterState: TrayAndUpdaterSettings = {
  minimizeToTray: false,
  nodeWatchdogEnabled: false,
  currentVersion: APP_VERSION,
  updateState: 'idle',
};

const streamManager = new XrplStreamManager();
const directoryService = new DirectoryService();
const nodeOpsService = new NodeOpsService();
let walletVault: WalletVaultService;
let dockerService: DockerNodeService;
let analyticsService: AnalyticsSqliteService;
let mcpAgentService: McpAgentService;

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function showOsNotification(payload: DesktopNotificationPayload): void {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: payload.title,
      body: payload.body,
    });
    notif.show();
  }
}

streamManager.on('status', (status) => sendToRenderer('xrpl:status', status));
streamManager.on('ledger', (ledger) => {
  if (recentLedgers[0]?.ledgerIndex !== ledger.ledgerIndex) {
    recentLedgers.unshift(ledger);
    if (recentLedgers.length > 30) recentLedgers.length = 30;
  }
  sendToRenderer('xrpl:ledger', ledger);
  if (analyticsService) {
    void analyticsService
      .recordLedger(streamManager.getStatus().networkId, ledger)
      .catch(() => undefined);
  }
});
streamManager.on('transaction', (tx) => {
  sendToRenderer('xrpl:tx', tx);
  if (
    analyticsService &&
    tx.validated &&
    walletVault &&
    (walletVault.isTrackedAddress(tx.account) || walletVault.isTrackedAddress(tx.destination))
  ) {
    void analyticsService
      .recordMatchedStreamTx(streamManager.getStatus().networkId, tx)
      .catch(() => undefined);
  }
});
streamManager.on('validation', (val) => sendToRenderer('xrpl:validation', val));
streamManager.on('consensus', (phase) => sendToRenderer('xrpl:consensus', phase));

function resolveIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'build', 'icon.png');
}

/**
 * On Linux desktops (Wayland/COSMIC/GNOME/KDE), running an .AppImage directly shows a generic
 * dock icon unless a matching hicolor icon and .desktop entry with StartupWMClass exist in
 * ~/.local/share. Sync them quietly on AppImage launch so the dock always shows our custom icon.
 */
async function ensureLinuxDesktopIconIntegration(): Promise<void> {
  if (process.platform !== 'linux') return;
  const appImagePath = process.env.APPIMAGE;
  if (!appImagePath) return;

  try {
    const homeDir = app.getPath('home');
    const iconDestDir = path.join(homeDir, '.local', 'share', 'icons', 'hicolor', '512x512', 'apps');
    const iconDestPath = path.join(iconDestDir, 'xrpl-command-center.png');
    const appsDir = path.join(homeDir, '.local', 'share', 'applications');
    const desktopPath = path.join(appsDir, 'xrpl-command-center.desktop');

    await fs.mkdir(iconDestDir, { recursive: true });
    await fs.mkdir(appsDir, { recursive: true });
    await fs.copyFile(resolveIconPath(), iconDestPath);

    const desktopEntry = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=XRPL Command Center',
      'Comment=Real-Time XRP Ledger Command Center, Rust Vault & Node Ops',
      `Exec="${appImagePath}" --no-sandbox %U`,
      `Icon=${iconDestPath}`,
      'Terminal=false',
      'Categories=Network;Development;Utility;',
      'StartupWMClass=xrpl-command-center',
      '',
    ].join('\n');

    await fs.writeFile(desktopPath, desktopEntry, 'utf8');
  } catch {
    // non-fatal on restricted filesystems
  }
}

function setupTray(): void {
  try {
    const img = nativeImage.createFromPath(resolveIconPath()).resize({ width: 20, height: 20 });
    tray = new Tray(img);
    tray.setToolTip(`XRPL Command Center v${APP_VERSION}`);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `XRPL Command Center v${APP_VERSION}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Show Command Center',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        },
      },
      {
        label: 'Lock Wallet Vault Now',
        click: () => {
          walletVault?.lock();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Completely',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) mainWindow.focus();
        else mainWindow.show();
      }
    });
  } catch {
    // Tray may be unsupported in headless window managers
  }
}

function syncNodeWatchdogTimer(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  if (!trayUpdaterState.nodeWatchdogEnabled) {
    lastNodeHealthy = null;
    return;
  }

  watchdogTimer = setInterval(async () => {
    const snap = await nodeOpsService.pollNode(lastMonitoredNodeConfig);
    const healthy =
      snap.connected &&
      (snap.serverState === 'full' || snap.serverState === 'proposing') &&
      (snap.peersCount ?? 0) >= 3;

    if (lastNodeHealthy !== false && !healthy) {
      showOsNotification({
        title: 'XRPL Node Watchdog Alert',
        body: !snap.connected
          ? `Your rippled node (${lastMonitoredNodeConfig.rpcUrl}) is unreachable.`
          : `Node state: ${snap.serverState ?? 'degraded'} • Peers: ${snap.peersCount ?? 0}`,
      });
    } else if (lastNodeHealthy === false && healthy) {
      showOsNotification({
        title: 'XRPL Node Recovered',
        body: `Node back in ${snap.serverState} sync (${snap.peersCount} peers).`,
      });
    }
    lastNodeHealthy = healthy;
  }, 30_000);
}

function getUpdaterAuthPath(): string {
  return path.join(app.getPath('userData'), 'updater-auth.json');
}

async function readSavedUpdaterToken(): Promise<string | null> {
  try {
    const raw = await fs.readFile(getUpdaterAuthPath(), 'utf8');
    const parsed = JSON.parse(raw) as { encrypted?: string; plain?: string };
    if (parsed.encrypted && safeStorage.isEncryptionAvailable()) {
      const dec = safeStorage.decryptString(Buffer.from(parsed.encrypted, 'base64')).trim();
      return dec || null;
    }
    if (typeof parsed.plain === 'string' && parsed.plain.trim()) {
      return parsed.plain.trim();
    }
    return null;
  } catch {
    return null;
  }
}

async function saveUpdaterToken(token: string | null): Promise<boolean> {
  const authPath = getUpdaterAuthPath();
  if (!token || !token.trim()) {
    await fs.rm(authPath, { force: true });
    return false;
  }
  const clean = token.trim();
  const payload = safeStorage.isEncryptionAvailable()
    ? { encrypted: safeStorage.encryptString(clean).toString('base64') }
    : { plain: clean };
  await fs.writeFile(authPath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
  return true;
}

async function resolveUpdaterToken(): Promise<{ token: string | null; hasSavedToken: boolean }> {
  const saved = await readSavedUpdaterToken();
  if (saved) return { token: saved, hasSavedToken: true };

  const envToken = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  if (envToken) return { token: envToken, hasSavedToken: false };

  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { timeout: 2000 });
    const ghToken = stdout.trim();
    if (ghToken) return { token: ghToken, hasSavedToken: false };
  } catch {
    // gh CLI not installed or not authenticated — totally fine
  }
  return { token: null, hasSavedToken: false };
}

function getUpdaterSnapshot(): TrayAndUpdaterSettings {
  const runningAppImage = process.env.APPIMAGE || null;
  return {
    ...trayUpdaterState,
    userDataDir: app.getPath('userData'),
    runningAppImagePath: runningAppImage,
    canInstallInPlace:
      Boolean(runningAppImage) || trayUpdaterState.updateChannel === 'electron-updater',
  };
}

function emitUpdaterState(): void {
  sendToRenderer('system:updaterState', getUpdaterSnapshot());
}

function configureAutoUpdater(): void {
  autoUpdater.logger = null;
  autoUpdater.allowPrerelease = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    trayUpdaterState.updateState = 'checking';
    trayUpdaterState.updateMessage = 'Checking release feed...';
    emitUpdaterState();
  });
  autoUpdater.on('update-available', (info) => {
    trayUpdaterState.updateState = 'available';
    trayUpdaterState.updateChannel = 'electron-updater';
    trayUpdaterState.availableVersion = info.version;
    trayUpdaterState.releaseNotes =
      typeof info.releaseNotes === 'string' ? info.releaseNotes.slice(0, 600) : undefined;
    trayUpdaterState.updateMessage = `Update v${info.version} is available. Download & install seamlessly without losing settings.`;
    emitUpdaterState();
  });
  autoUpdater.on('update-not-available', () => {
    trayUpdaterState.updateState = 'not-available';
    trayUpdaterState.updateMessage = `You are running the latest version (v${APP_VERSION}).`;
    emitUpdaterState();
  });
  autoUpdater.on('download-progress', (prog) => {
    trayUpdaterState.updateState = 'downloading';
    trayUpdaterState.downloadPercent = Math.round(prog.percent);
    trayUpdaterState.downloadedBytes = prog.transferred;
    trayUpdaterState.totalBytes = prog.total;
    trayUpdaterState.bytesPerSecond = prog.bytesPerSecond;
    trayUpdaterState.updateMessage = `Downloading update… ${Math.round(prog.percent)}%`;
    emitUpdaterState();
  });
  autoUpdater.on('update-downloaded', (info) => {
    trayUpdaterState.updateState = 'downloaded';
    trayUpdaterState.updateChannel = 'electron-updater';
    trayUpdaterState.downloadPercent = 100;
    trayUpdaterState.sha256Verified = true;
    trayUpdaterState.availableVersion = info.version;
    trayUpdaterState.updateMessage = `Update v${info.version} downloaded & verified! Click Restart & Install — all settings & wallets stay intact.`;
    emitUpdaterState();
  });
  autoUpdater.on('error', (err) => {
    // Only surface electron-updater error if we aren't actively using github-direct
    if (trayUpdaterState.updateChannel !== 'github-direct') {
      trayUpdaterState.updateState = 'error';
      trayUpdaterState.updateMessage = app.isPackaged
        ? `Release feed check note: ${err.message.slice(0, 100)}`
        : 'Update check skipped in unpackaged dev mode.';
      emitUpdaterState();
    }
  });
}

async function checkGithubReleasesDirect(): Promise<TrayAndUpdaterSettings> {
  const { token, hasSavedToken } = await resolveUpdaterToken();
  trayUpdaterState.hasSavedToken = hasSavedToken;
  trayUpdaterState.updateState = 'checking';
  trayUpdaterState.updateMessage = 'Checking GitHub Releases…';
  emitUpdaterState();

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': `XRPL-Command-Center/${APP_VERSION}`,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=10`,
    { headers }
  );

  if (res.status === 404 || res.status === 401 || res.status === 403) {
    trayUpdaterState.updateState = 'error';
    trayUpdaterState.updateMessage =
      'Repository is private — sign in with `gh auth login` or enter a GitHub read-only token below to enable 1-click updates.';
    emitUpdaterState();
    return getUpdaterSnapshot();
  }
  if (!res.ok) {
    throw new Error(`GitHub Releases HTTP ${res.status}`);
  }

  const releases = (await res.json()) as Array<{
    tag_name?: string;
    draft?: boolean;
    html_url?: string;
    body?: string;
    assets?: GithubReleaseAssetLike[];
  }>;

  const valid = releases
    .filter((r) => !r.draft && typeof r.tag_name === 'string' && r.tag_name.length > 0)
    .sort((a, b) => compareSemver(b.tag_name!, a.tag_name!));

  if (valid.length === 0) {
    trayUpdaterState.updateState = 'not-available';
    trayUpdaterState.updateMessage = `No published releases found yet (installed v${APP_VERSION}).`;
    emitUpdaterState();
    return getUpdaterSnapshot();
  }

  const latest = valid[0];
  const latestVersion = latest.tag_name!.replace(/^v/i, '');

  if (compareSemver(latestVersion, APP_VERSION) <= 0) {
    pendingDirectUpdate = null;
    trayUpdaterState.updateState = 'not-available';
    trayUpdaterState.availableVersion = undefined;
    trayUpdaterState.updateMessage = `You are running the latest version (v${APP_VERSION}).`;
    emitUpdaterState();
    return getUpdaterSnapshot();
  }

  const picked = pickPlatformAsset(latest.assets ?? [], process.platform);
  if (!picked.binary) {
    trayUpdaterState.updateState = 'available';
    trayUpdaterState.updateChannel = 'github-direct';
    trayUpdaterState.availableVersion = latestVersion;
    trayUpdaterState.releaseUrl = latest.html_url;
    trayUpdaterState.releaseNotes = (latest.body ?? '').slice(0, 600);
    trayUpdaterState.updateMessage = `v${latestVersion} is published, but no ${process.platform} binary is attached yet.`;
    emitUpdaterState();
    return getUpdaterSnapshot();
  }

  pendingDirectUpdate = {
    version: latestVersion,
    releaseUrl: latest.html_url ?? '',
    releaseNotes: (latest.body ?? '').slice(0, 600),
    binary: picked.binary,
    checksumFile: picked.checksumFile,
  };

  trayUpdaterState.updateState = 'available';
  trayUpdaterState.updateChannel = 'github-direct';
  trayUpdaterState.availableVersion = latestVersion;
  trayUpdaterState.releaseUrl = latest.html_url;
  trayUpdaterState.releaseNotes = pendingDirectUpdate.releaseNotes;
  trayUpdaterState.totalBytes = picked.binary.size;
  trayUpdaterState.downloadPercent = 0;
  trayUpdaterState.sha256Verified = false;
  trayUpdaterState.updateMessage = `Update v${latestVersion} is ready to download (${(picked.binary.size / (1024 * 1024)).toFixed(1)} MB). All settings & wallets are preserved.`;
  emitUpdaterState();
  return getUpdaterSnapshot();
}

async function swapAndRelaunchLinuxAppImage(newAppImagePath: string): Promise<void> {
  const currentAppImage = process.env.APPIMAGE;
  if (!currentAppImage) {
    throw new Error('In-place swap requires running from the packaged .AppImage binary.');
  }

  await fs.chmod(newAppImagePath, 0o755);
  const backupPath = `${currentAppImage}.prev.bak`;
  await fs.rm(backupPath, { force: true }).catch(() => undefined);

  // Rename running AppImage to rollback backup (safe on Linux while mapped in memory)
  await fs.rename(currentAppImage, backupPath);

  try {
    await fs.rename(newAppImagePath, currentAppImage);
  } catch {
    // Cross-device fallback (e.g., Downloads on different mount than AppImage)
    await fs.copyFile(newAppImagePath, currentAppImage);
    await fs.rm(newAppImagePath, { force: true }).catch(() => undefined);
  }

  await fs.chmod(currentAppImage, 0o755);

  // Strip parent AppImage runtime variables so the new AppImage mounts its own SquashFS fresh
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
  delete cleanEnv.APPIMAGE;
  delete cleanEnv.APPDIR;
  delete cleanEnv.ARGV0;
  delete cleanEnv.OWD;

  const child = spawn(currentAppImage, [], {
    detached: true,
    stdio: 'ignore',
    env: cleanEnv,
  });
  child.unref();

  isQuitting = true;
  setTimeout(() => {
    app.quit();
  }, 250);
}

function createWindow(): void {
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL) || !app.isPackaged;
  const appIcon = nativeImage.createFromPath(resolveIconPath());

  mainWindow = new BrowserWindow({
    width: 1540,
    height: 970,
    minWidth: 1140,
    minHeight: 720,
    backgroundColor: '#040811',
    title: `XRPL Command Center — v${APP_VERSION}`,
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  if (process.platform === 'linux' && !appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon);
  }

  // Hardened Electron session: deny unneeded browser permissions (WebHID is handled by setDevicePermissionHandler)
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  // Enable Chromium WebHID exclusively for Ledger (0x2c97) and WebUSB exclusively for Trezor (0x1209 / 0x534c)
  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'hid' && details.device?.vendorId === LEDGER_USB_VENDOR_ID) {
      return true;
    }
    if (details.deviceType === 'usb' && details.device?.vendorId !== undefined && TREZOR_USB_VENDOR_IDS.has(Number(details.device.vendorId))) {
      return true;
    }
    return false;
  });

  // Prevent unexpected top-level navigation outside our local renderer origin
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://127.0.0.1:5173') && !url.startsWith('http://localhost:5173')) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.session.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const ledgerDevice = details.deviceList.find((d) => d.vendorId === LEDGER_USB_VENDOR_ID);
    callback(ledgerDevice ? ledgerDevice.deviceId : '');
  });

  mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    const trezorDevice = details.deviceList.find((d) => TREZOR_USB_VENDOR_IDS.has(d.vendorId));
    callback(trezorDevice ? trezorDevice.deviceId : '');
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && trayUpdaterState.minimizeToTray && tray) {
      event.preventDefault();
      mainWindow?.hide();
      showOsNotification({
        title: 'XRPL Command Center Running in Tray',
        body: 'Live watchlist & node watchdog alerts remain active in the background.',
      });
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (isDev) {
    void mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('xrpl:connect', (_evt, networkId: NetworkId, customEndpoint?: string) => {
    return streamManager.connect(networkId, customEndpoint);
  });

  ipcMain.handle('xrpl:getStatus', () => streamManager.getStatus());

  ipcMain.handle('xrpl:rpc', async (_evt, command: string, params?: Record<string, unknown>) => {
    try {
      return await streamManager.request(command, params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        status: 'error',
        error: 'rpc_error',
        error_message: msg,
      };
    }
  });

  ipcMain.handle('xrpl:fetchValidators', (_evt, networkId: NetworkId) => {
    return directoryService.fetchValidators(networkId);
  });

  ipcMain.handle(
    'xrpl:fetchTokens',
    (_evt, networkId: NetworkId, options?: { limit?: number; offset?: number; sortBy?: string }) => {
      return directoryService.fetchTokens(networkId, options);
    }
  );

  ipcMain.handle('xrpl:searchTokens', (_evt, query: string, networkId: NetworkId) => {
    return directoryService.searchTokens(streamManager, query, networkId);
  });

  ipcMain.handle('xrpl:inspectToken', (_evt, currencyRaw: string, issuer: string) => {
    return directoryService.inspectTokenOnLedger(streamManager, currencyRaw, issuer);
  });

  ipcMain.handle('xrpl:inspectQuery', (_evt, query: string) => {
    return directoryService.inspectQuery(streamManager, query);
  });

  // Node Ops + Track 1 Docker & Config Diff Studio
  ipcMain.handle('nodeOps:poll', (_evt, config: NodeConnectionConfig) => {
    lastMonitoredNodeConfig = config;
    return nodeOpsService.pollNode(config);
  });

  ipcMain.handle(
    'nodeOps:adminCommand',
    (_evt, config: NodeConnectionConfig, method: string, params?: Record<string, unknown>) => {
      return nodeOpsService.executeAdminCommand(config, method, params);
    }
  );

  ipcMain.handle('nodeOps:readLogTail', async (_evt, filePath: string, maxLines?: number) => {
    const primary = await nodeOpsService.readLogTail(filePath, maxLines);
    if (primary.ok) return primary;

    // Auto-fallback for 1-Click Docker nodes: try managed data/log/debug.log, then docker logs
    const dockerLogFile = path.join(dockerService.activeDataDir, 'log', 'debug.log');
    if (dockerLogFile !== filePath) {
      const fromDockerFile = await nodeOpsService.readLogTail(dockerLogFile, maxLines);
      if (fromDockerFile.ok) {
        return {
          ok: true,
          lines: [`[Auto-detected Docker log file: ${dockerLogFile}]`, ...fromDockerFile.lines],
        };
      }
    }

    const fromContainer = await dockerService.readLogs(maxLines ?? 120);
    if (fromContainer.ok && fromContainer.lines.length > 0) {
      return {
        ok: true,
        lines: [
          `[Auto-streaming live Docker container logs (local file "${filePath}" not found)]`,
          ...fromContainer.lines,
        ],
      };
    }

    return primary;
  });

  ipcMain.handle('docker:getStatus', () => dockerService.getStatus());
  ipcMain.handle('docker:chooseStorageFolder', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Choose XRPL Node Storage Drive / Folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Use This Folder for XRPL Node',
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, cancelled: true };
    }
    return dockerService.setCustomStorageRoot(picked.filePaths[0]);
  });
  ipcMain.handle('docker:setStorageFolder', (_evt, customRoot: string | null) =>
    dockerService.setCustomStorageRoot(customRoot)
  );
  ipcMain.handle('docker:inspectStorage', (_evt, targetPath?: string) =>
    dockerService.inspectStoragePath(targetPath)
  );
  ipcMain.handle('docker:provision', (_evt, req: DockerProvisionRequest) =>
    dockerService.provisionNode(req)
  );
  ipcMain.handle('docker:lifecycle', (_evt, action: 'start' | 'stop' | 'restart' | 'remove') =>
    dockerService.lifecycleAction(action)
  );
  ipcMain.handle('docker:readLogs', (_evt, tailLines?: number) =>
    dockerService.readLogs(tailLines)
  );
  ipcMain.handle('nodeConfig:load', (_evt, customDir?: string) =>
    dockerService.loadConfigBundle(customDir)
  );
  ipcMain.handle(
    'nodeConfig:saveWithBackup',
    (_evt, payload: { configDir?: string; rippledCfg: string; validatorsTxt: string }) =>
      dockerService.saveConfigWithBackup(payload)
  );

  // Wallet Vault, Hardware/QR, Multi-Sig & Pro DEX Pathfinding
  ipcMain.handle('wallet:getStatus', () => walletVault.getStatus());
  ipcMain.handle('wallet:setup', (_evt, passphrase: string) => walletVault.setupVault(passphrase));
  ipcMain.handle('wallet:unlock', (_evt, passphrase: string) => walletVault.unlock(passphrase));
  ipcMain.handle('wallet:lock', async () => {
    walletVault.lock();
    return walletVault.getStatus();
  });
  ipcMain.handle('wallet:create', (_evt, label: string, algorithm: WalletAlgorithm) =>
    walletVault.createWallet(label, algorithm)
  );
  ipcMain.handle('wallet:importSeed', (_evt, label: string, seed: string) =>
    walletVault.importSeed(label, seed)
  );
  ipcMain.handle(
    'wallet:addWatchOnly',
    (_evt, label: string, address: string, isHardwareLedger?: boolean, derivationPath?: string) =>
      walletVault.addWatchOnly(label, address, isHardwareLedger, derivationPath)
  );
  ipcMain.handle('wallet:removeAccount', (_evt, walletId: string) =>
    walletVault.removeAccount(walletId)
  );
  ipcMain.handle('wallet:fetchPortfolio', (_evt, address: string) =>
    walletVault.fetchPortfolio(streamManager, address)
  );
  ipcMain.handle('wallet:fundFaucet', (_evt, address: string, networkId: NetworkId) =>
    walletVault.fundFromFaucet(address, networkId)
  );
  ipcMain.handle('wallet:preflightTx', (_evt, intent: WalletTxIntent) =>
    walletVault.preflightTransaction(streamManager, intent)
  );
  ipcMain.handle('wallet:signAndSubmitTx', async (_evt, walletId: string, intent: WalletTxIntent) => {
    const res = await walletVault.signAndSubmit(streamManager, walletId, intent);
    if (res.hash) {
      void analyticsService
        .recordJournalEntry({
          network: streamManager.getStatus().networkId,
          txType: intent.kind,
          account: intent.account,
          destination: 'destination' in intent ? intent.destination : '',
          amountDisplay: intent.kind,
          feeDrops: 12,
          hash: res.hash,
          status: res.engineResult ?? (res.ok ? 'submitted' : 'failed'),
        })
        .catch(() => undefined);
    }
    return res;
  });
  ipcMain.handle('wallet:submitSignedBlob', (_evt, txBlobHex: string) =>
    walletVault.submitSignedBlob(streamManager, txBlobHex)
  );
  ipcMain.handle(
    'wallet:signMultisigPartial',
    (_evt, walletId: string, txJson: Record<string, unknown>) =>
      walletVault.signMultisigPartial(walletId, txJson)
  );
  ipcMain.handle('wallet:combineAndSubmitMultisig', (_evt, partialBlobs: string[]) =>
    walletVault.combineAndSubmitMultisig(streamManager, partialBlobs)
  );
  ipcMain.handle(
    'dex:findBestPath',
    (
      _evt,
      params: {
        sourceAccount: string;
        destinationAccount: string;
        destinationAsset: AssetSpec;
        slippagePct: number;
      }
    ) => walletVault.findBestSwapPath(streamManager, params)
  );

  // Track 4: Institutional Primitives Queries
  ipcMain.handle(
    'oracle:queryAggregate',
    (
      _evt,
      params: {
        baseAsset: string;
        quoteAsset: string;
        oracles: Array<{ account: string; oracleDocumentId: number }>;
      }
    ) => directoryService.queryOracleAggregate(streamManager, params)
  );
  ipcMain.handle('did:resolveAccount', (_evt, address: string) =>
    directoryService.resolveDid(streamManager, address)
  );

  // Track 5: SQLite Analytics, CSV Export, Tray & Auto-Updater
  ipcMain.handle('analytics:getSummary', () => analyticsService.getSummary());
  ipcMain.handle('analytics:exportCsv', async (_evt, kind: 'transactions' | 'ledgers') => {
    try {
      const { csv, rowCount } = await analyticsService.buildCsvExport(kind);
      const defaultName = `xrpl-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      const saveRes = await dialog.showSaveDialog(mainWindow!, {
        title: `Export ${kind === 'transactions' ? 'Wallet Transactions' : 'Ledger Telemetry'} CSV`,
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        filters: [{ name: 'CSV Spreadsheet', extensions: ['csv'] }],
      });
      if (saveRes.canceled || !saveRes.filePath) {
        return { ok: false, error: 'Export cancelled' };
      }
      await fs.writeFile(saveRes.filePath, csv, 'utf8');
      return { ok: true, filePath: saveRes.filePath, rowCount };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'CSV export failed',
      };
    }
  });

  ipcMain.handle('system:getTrayUpdaterState', async () => {
    const saved = await readSavedUpdaterToken();
    trayUpdaterState.hasSavedToken = Boolean(saved);
    return getUpdaterSnapshot();
  });

  ipcMain.handle(
    'system:updateTraySettings',
    (_evt, patch: { minimizeToTray?: boolean; nodeWatchdogEnabled?: boolean }) => {
      if (patch.minimizeToTray !== undefined) {
        trayUpdaterState.minimizeToTray = patch.minimizeToTray;
      }
      if (patch.nodeWatchdogEnabled !== undefined) {
        trayUpdaterState.nodeWatchdogEnabled = patch.nodeWatchdogEnabled;
        syncNodeWatchdogTimer();
      }
      emitUpdaterState();
      return getUpdaterSnapshot();
    }
  );

  ipcMain.handle('system:setUpdaterToken', async (_evt, token: string | null) => {
    try {
      const saved = await saveUpdaterToken(token);
      trayUpdaterState.hasSavedToken = saved;
      emitUpdaterState();
      return { ok: true, hasSavedToken: saved };
    } catch (err) {
      return {
        ok: false,
        hasSavedToken: Boolean(trayUpdaterState.hasSavedToken),
        error: err instanceof Error ? err.message : 'Unable to save updater token.',
      };
    }
  });

  ipcMain.handle('system:checkForUpdates', async () => {
    try {
      const { token, hasSavedToken } = await resolveUpdaterToken();
      trayUpdaterState.hasSavedToken = hasSavedToken;

      // If a private-repo token / gh auth token is available (or in dev), query GitHub Releases directly
      if (token || !app.isPackaged) {
        return await checkGithubReleasesDirect();
      }

      // Packaged public repo: try native electron-updater first, fallback to GitHub Releases API
      try {
        trayUpdaterState.updateChannel = 'electron-updater';
        await autoUpdater.checkForUpdates();
        if (trayUpdaterState.updateState === 'available' || trayUpdaterState.updateState === 'not-available') {
          return getUpdaterSnapshot();
        }
      } catch {
        // Fallback to GitHub Releases direct API
      }

      return await checkGithubReleasesDirect();
    } catch (err) {
      trayUpdaterState.updateState = 'error';
      trayUpdaterState.updateMessage =
        err instanceof Error
          ? `Update check failed (${err.message.slice(0, 90)})`
          : 'Update check unavailable';
      emitUpdaterState();
      return getUpdaterSnapshot();
    }
  });

  ipcMain.handle('system:downloadUpdate', async () => {
    try {
      if (trayUpdaterState.updateChannel === 'electron-updater') {
        trayUpdaterState.updateState = 'downloading';
        trayUpdaterState.downloadPercent = 0;
        trayUpdaterState.updateMessage = 'Starting update download…';
        emitUpdaterState();
        await autoUpdater.downloadUpdate();
        return getUpdaterSnapshot();
      }

      if (!pendingDirectUpdate) {
        trayUpdaterState.updateState = 'error';
        trayUpdaterState.updateMessage = 'No update selected. Click Check for Updates first.';
        emitUpdaterState();
        return getUpdaterSnapshot();
      }

      const { token } = await resolveUpdaterToken();
      const target = pendingDirectUpdate;
      const downloadUrl = token ? target.binary.url : target.binary.browser_download_url;
      const headers: Record<string, string> = {
        Accept: 'application/octet-stream',
        'User-Agent': `XRPL-Command-Center/${APP_VERSION}`,
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      trayUpdaterState.updateState = 'downloading';
      trayUpdaterState.downloadPercent = 0;
      trayUpdaterState.downloadedBytes = 0;
      trayUpdaterState.totalBytes = target.binary.size;
      trayUpdaterState.bytesPerSecond = 0;
      trayUpdaterState.sha256Verified = false;
      trayUpdaterState.updateMessage = `Downloading v${target.version} (${target.binary.name})…`;
      emitUpdaterState();

      const res = await fetch(downloadUrl, { headers, redirect: 'follow' });
      if (!res.ok || !res.body) {
        throw new Error(`Download HTTP ${res.status}`);
      }

      const runningAppImage = process.env.APPIMAGE;
      const destPath =
        process.platform === 'linux' && runningAppImage
          ? `${runningAppImage}.update.tmp`
          : path.join(app.getPath('downloads'), target.binary.name);

      await fs.rm(destPath, { force: true }).catch(() => undefined);

      const contentLen = Number(res.headers.get('content-length') || target.binary.size || 0);
      const hasher = crypto.createHash('sha256');
      const out = createWriteStream(destPath, { mode: 0o755 });
      const reader = res.body.getReader();

      let downloaded = 0;
      const startedAt = Date.now();
      let lastEmitAt = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          const chunk = Buffer.from(value);
          hasher.update(chunk);
          if (!out.write(chunk)) {
            await new Promise<void>((resolve) => out.once('drain', resolve));
          }
          downloaded += chunk.length;

          const now = Date.now();
          if (now - lastEmitAt >= 200) {
            lastEmitAt = now;
            const elapsedSec = Math.max(0.2, (now - startedAt) / 1000);
            const pct = contentLen > 0 ? Math.min(99, Math.round((downloaded / contentLen) * 100)) : 0;
            trayUpdaterState.downloadPercent = pct;
            trayUpdaterState.downloadedBytes = downloaded;
            trayUpdaterState.totalBytes = contentLen || downloaded;
            trayUpdaterState.bytesPerSecond = Math.round(downloaded / elapsedSec);
            trayUpdaterState.updateMessage = `Downloading v${target.version}… ${pct}% (${(downloaded / (1024 * 1024)).toFixed(1)} MB)`;
            emitUpdaterState();
          }
        }
      } finally {
        await new Promise<void>((resolve, reject) => {
          out.end();
          out.on('finish', resolve);
          out.on('error', reject);
        });
      }

      const actualSha256 = hasher.digest('hex');

      // Verify SHA-256 manifest if attached to the release
      let expectedSha256: string | null = null;
      if (target.checksumFile) {
        try {
          const sumUrl = token
            ? target.checksumFile.url
            : target.checksumFile.browser_download_url;
          const sumRes = await fetch(sumUrl, { headers, redirect: 'follow' });
          if (sumRes.ok) {
            const manifestText = await sumRes.text();
            expectedSha256 = parseSha256Manifest(manifestText, target.binary.name);
          }
        } catch {
          // Proceed with HTTPS integrity note if checksum fetch failed
        }
      }

      const verify = verifySha256Digest(actualSha256, expectedSha256);
      if (!verify.ok) {
        await fs.rm(destPath, { force: true }).catch(() => undefined);
        throw new Error(verify.reason);
      }

      if (process.platform === 'linux') {
        await fs.chmod(destPath, 0o755);
      }

      stagedUpdateFile = destPath;
      trayUpdaterState.updateState = 'downloaded';
      trayUpdaterState.downloadPercent = 100;
      trayUpdaterState.downloadedBytes = downloaded;
      trayUpdaterState.totalBytes = downloaded;
      trayUpdaterState.sha256Verified = verify.verified;
      trayUpdaterState.updateMessage =
        process.platform === 'linux' && runningAppImage
          ? `v${target.version} ready (${verify.reason}). Click Restart & Install — your wallets, settings & node stay intact.`
          : `v${target.version} saved to ${path.basename(destPath)} (${verify.reason}). Click Install Update to launch.`;
      emitUpdaterState();
      return getUpdaterSnapshot();
    } catch (err) {
      trayUpdaterState.updateState = 'error';
      trayUpdaterState.updateMessage =
        err instanceof Error ? `Update download failed: ${err.message}` : 'Update download failed.';
      emitUpdaterState();
      return getUpdaterSnapshot();
    }
  });

  ipcMain.handle('system:installUpdate', async () => {
    try {
      if (trayUpdaterState.updateChannel === 'electron-updater') {
        isQuitting = true;
        autoUpdater.quitAndInstall(false, true);
        return { ok: true, message: 'Restarting to apply verified update…' };
      }

      if (!stagedUpdateFile) {
        return { ok: false, error: 'No downloaded update file staged yet.' };
      }

      if (process.platform === 'linux' && process.env.APPIMAGE) {
        await swapAndRelaunchLinuxAppImage(stagedUpdateFile);
        return {
          ok: true,
          message: 'Swapped AppImage in-place (with .prev.bak rollback) and relaunching…',
        };
      }

      // Windows (.exe), macOS (.dmg), or non-AppImage Linux: open downloaded installer/AppImage
      const openErr = await shell.openPath(stagedUpdateFile);
      if (openErr) {
        shell.showItemInFolder(stagedUpdateFile);
        return {
          ok: true,
          message: `Opened folder containing ${path.basename(stagedUpdateFile)}. Close this app and run it — all settings stay preserved.`,
        };
      }
      return {
        ok: true,
        message: `Launched ${path.basename(stagedUpdateFile)}. All wallets, settings & node data stay preserved in userData.`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to install update.',
      };
    }
  });

  ipcMain.handle('system:installLocalAppImage', async () => {
    try {
      if (process.platform !== 'linux' || !process.env.APPIMAGE) {
        return {
          ok: false,
          error:
            'In-place local AppImage upgrade is available when running the packaged Linux .AppImage binary.',
        };
      }
      const picked = await dialog.showOpenDialog(mainWindow!, {
        title: 'Select Newer XRPL Command Center .AppImage to Install In-Place',
        properties: ['openFile'],
        filters: [{ name: 'Linux AppImage', extensions: ['AppImage'] }],
      });
      if (picked.canceled || picked.filePaths.length === 0) {
        return { ok: false, cancelled: true };
      }
      const selectedFile = picked.filePaths[0];
      if (path.resolve(selectedFile) === path.resolve(process.env.APPIMAGE)) {
        return { ok: false, error: 'Selected file is the exact AppImage currently running.' };
      }
      const stagedCopy = `${process.env.APPIMAGE}.update.tmp`;
      await fs.copyFile(selectedFile, stagedCopy);
      await swapAndRelaunchLinuxAppImage(stagedCopy);
      return {
        ok: true,
        message: 'Upgraded AppImage in-place and relaunching — all settings & wallets preserved.',
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Local AppImage upgrade failed.',
      };
    }
  });

  ipcMain.handle('desktop:notify', (_evt, payload: DesktopNotificationPayload) => {
    showOsNotification(payload);
  });

  // v0.1.0-beta: Live Market Prices, Amendment Voting, X-Address Codec & Encrypted Vault Backups
  ipcMain.handle('market:fetchPrices', () => directoryService.fetchMarketPrices());
  ipcMain.handle('market:fetchOhlc', (_evt, req: MarketOhlcRequest) =>
    directoryService.fetchMarketOhlc(req)
  );
  ipcMain.handle('xrpl:fetchAmendments', () => directoryService.fetchAmendments(streamManager));

  ipcMain.handle('wallet:decodeXAddress', (_evt, xAddr: string) => {
    try {
      const decoded = xAddressToClassicAddress(String(xAddr ?? '').trim());
      return {
        ok: true,
        classicAddress: decoded.classicAddress,
        tag: decoded.tag === false ? null : Number(decoded.tag),
        test: Boolean(decoded.test),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid XRPL X-Address',
      };
    }
  });

  ipcMain.handle(
    'wallet:encodeXAddress',
    (_evt, classicAddress: string, tag?: number | null, isTestnet = false) => {
      try {
        const cleanTag = tag === null || tag === undefined ? false : Number(tag);
        const xAddress = classicAddressToXAddress(String(classicAddress ?? '').trim(), cleanTag, Boolean(isTestnet));
        return { ok: true, xAddress };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to encode X-Address',
        };
      }
    }
  );

  ipcMain.handle('wallet:exportBackup', async () => {
    try {
      const userDataDir = app.getPath('userData');
      const rustPath = path.join(userDataDir, 'wallet-vault-rust.enc.json');
      const nodePath = path.join(userDataDir, 'wallet-vault.enc.json');

      let sourceFile: string | null = null;
      let engine: 'rust-sidecar' | 'node-fallback' = 'rust-sidecar';
      try {
        await fs.access(rustPath);
        sourceFile = rustPath;
        engine = 'rust-sidecar';
      } catch {
        try {
          await fs.access(nodePath);
          sourceFile = nodePath;
          engine = 'node-fallback';
        } catch {
          return {
            ok: false,
            error: 'No encrypted vault file exists yet. Initialize your vault first.',
          };
        }
      }

      const rawEncrypted = await fs.readFile(sourceFile, 'utf8');
      const parsedVault = JSON.parse(rawEncrypted) as Record<string, unknown>;
      const canonicalVaultJson = JSON.stringify(parsedVault);
      const sha512Integrity = crypto.createHash('sha512').update(canonicalVaultJson, 'utf8').digest('hex');
      const envelope = {
        format: 'xrpl-command-center-encrypted-vault-v1',
        exportedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        engine,
        pqcAtRest: 'Argon2id-AES-256-GCM-128bit-PQ',
        sha512Integrity,
        encryptedVault: parsedVault,
      };

      const defaultName = `xrpl-vault-backup-${new Date().toISOString().slice(0, 10)}.xrplvault`;
      const picked = await dialog.showSaveDialog({
        title: 'Export Encrypted XRPL Vault Backup (.xrplvault)',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: 'Encrypted XRPL Vault', extensions: ['xrplvault', 'json'] }],
      });

      if (picked.canceled || !picked.filePath) {
        return { ok: false, cancelled: true };
      }

      await fs.writeFile(picked.filePath, JSON.stringify(envelope, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });

      return {
        ok: true,
        filePath: picked.filePath,
        message: 'Encrypted vault backup exported (Argon2id + AES-256-GCM ciphertext only — no plaintext seeds).',
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to export encrypted vault backup.',
      };
    }
  });

  ipcMain.handle('wallet:importBackup', async () => {
    try {
      const picked = await dialog.showOpenDialog({
        title: 'Restore Encrypted XRPL Vault Backup (.xrplvault)',
        properties: ['openFile'],
        filters: [{ name: 'Encrypted XRPL Vault', extensions: ['xrplvault', 'json'] }],
      });
      if (picked.canceled || picked.filePaths.length === 0) {
        return { ok: false, cancelled: true };
      }

      const rawText = await fs.readFile(picked.filePaths[0], 'utf8');
      const envelope = JSON.parse(rawText) as {
        format?: string;
        engine?: 'rust-sidecar' | 'node-fallback';
        sha512Integrity?: string;
        encryptedVault?: Record<string, unknown>;
      };

      if (
        envelope.format !== 'xrpl-command-center-encrypted-vault-v1' ||
        !envelope.encryptedVault ||
        typeof envelope.encryptedVault !== 'object'
      ) {
        return {
          ok: false,
          error: 'Invalid .xrplvault backup file format.',
        };
      }

      if (typeof envelope.sha512Integrity === 'string' && envelope.sha512Integrity.length === 128) {
        const expectedHash = crypto
          .createHash('sha512')
          .update(JSON.stringify(envelope.encryptedVault), 'utf8')
          .digest('hex');
        if (expectedHash !== envelope.sha512Integrity.toLowerCase()) {
          return {
            ok: false,
            error: 'SHA-512 integrity check FAILED — backup file may be corrupted or tampered with.',
          };
        }
      }

      const userDataDir = app.getPath('userData');
      const targetName =
        envelope.engine === 'node-fallback' ? 'wallet-vault.enc.json' : 'wallet-vault-rust.enc.json';
      const targetPath = path.join(userDataDir, targetName);

      // Lock active vault & back up existing vault file before overwriting
      walletVault.lock();
      try {
        await fs.access(targetPath);
        await fs.copyFile(targetPath, `${targetPath}.bak-${Date.now()}`);
      } catch {
        // no existing vault to back up
      }

      await fs.writeFile(targetPath, JSON.stringify(envelope.encryptedVault, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });

      // Restart Rust sidecar so it reloads the restored encrypted vault cleanly
      if (rustSidecar) {
        rustSidecar.shutdown();
        rustSidecar.start();
      }

      const status = await walletVault.getStatus();
      return {
        ok: true,
        filePath: picked.filePaths[0],
        status,
        message: 'Encrypted vault restored! Unlock it with your backup master passphrase.',
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to restore encrypted vault backup.',
      };
    }
  });

  ipcMain.handle('wallet:setAutoLockMinutes', (_evt, minutes: number) => {
    const applied = walletVault.setAutoLockMinutes(minutes);
    return { ok: true, minutes: applied, autoLockAt: walletVault.getAutoLockAt() };
  });

  // v0.3.0-beta: Local MCP Server & In-App Agent Copilot IPC
  ipcMain.handle('mcp:getStatus', () => mcpAgentService.getStatus());
  ipcMain.handle(
    'mcp:updateConfig',
    (
      _evt,
      patch: { enabled?: boolean; port?: number; allowAutomation?: boolean; allowTxDrafting?: boolean }
    ) => mcpAgentService.updateConfig(patch)
  );
  ipcMain.handle('mcp:rotateToken', () => mcpAgentService.rotateToken());
  ipcMain.handle(
    'mcp:updateProvider',
    (
      _evt,
      patch: {
        provider?: AgentProviderId;
        endpointUrl?: string;
        model?: string;
        apiKey?: string | null;
      }
    ) => mcpAgentService.updateProvider(patch)
  );
  ipcMain.handle('mcp:clearAuditLog', () => mcpAgentService.clearAuditLog());
  ipcMain.handle(
    'agent:sendMessage',
    (
      _evt,
      message: string,
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
    ) => mcpAgentService.runAgentChat(message, history ?? [])
  );

  ipcMain.handle(
    'wallet:exportSecurityAudit',
    async (_evt, payload: { defaultFilename: string; markdown: string }) => {
      try {
        const safeName =
          (payload?.defaultFilename || `xrpl-security-audit-${new Date().toISOString().slice(0, 10)}.md`)
            .replace(/[^a-zA-Z0-9._-]/g, '_');
        const picked = await dialog.showSaveDialog({
          title: 'Export XRPL Account Security & Reserve Audit (.md)',
          defaultPath: path.join(app.getPath('documents'), safeName),
          filters: [{ name: 'Markdown Report', extensions: ['md', 'txt'] }],
        });
        if (picked.canceled || !picked.filePath) {
          return { ok: false, cancelled: true };
        }
        await fs.writeFile(picked.filePath, String(payload?.markdown ?? ''), 'utf8');
        return { ok: true, filePath: picked.filePath };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to export security audit report.',
        };
      }
    }
  );

  ipcMain.handle('analytics:exportTaxCsv', async () => {
    try {
      const summary = await analyticsService.getSummary();
      const csv = buildTaxReadyCsv(summary.recentJournal);
      const defaultName = `xrpl-tax-journal-${new Date().toISOString().slice(0, 10)}.csv`;
      const picked = await dialog.showSaveDialog({
        title: 'Export Tax-Ready XRPL CSV (CoinTracker / Koinly)',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: 'CSV Spreadsheet', extensions: ['csv'] }],
      });
      if (picked.canceled || !picked.filePath) {
        return { ok: false, error: 'Export cancelled' };
      }
      await fs.writeFile(picked.filePath, csv, 'utf8');
      return { ok: true, filePath: picked.filePath, rowCount: summary.recentJournal.length };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to export tax-ready CSV',
      };
    }
  });

  ipcMain.handle('system:exportDiagnostics', async () => {
    try {
      const [vaultSt, dockerSt, analyticsSum] = await Promise.all([
        walletVault.getStatus().catch(() => null),
        dockerService.getStatus().catch(() => null),
        analyticsService.getSummary().catch(() => null),
      ]);
      const reportObj = {
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        streamStatus: streamManager.getStatus(),
        vault: vaultSt
          ? {
              initialized: vaultSt.initialized,
              unlocked: vaultSt.unlocked,
              backend: vaultSt.backend,
              kdf: vaultSt.kdf,
              autoLockMinutes: vaultSt.autoLockMinutes,
              accountCount: vaultSt.accounts.length,
            }
          : null,
        docker: dockerSt
          ? {
              dockerInstalled: dockerSt.dockerInstalled,
              daemonRunning: dockerSt.daemonRunning,
              containerExists: dockerSt.containerExists,
              containerRunning: dockerSt.containerRunning,
              freeGb: dockerSt.storageInfo?.freeGb ?? null,
            }
          : null,
        analytics: analyticsSum
          ? {
              recordedLedgers: analyticsSum.recordedLedgers,
              recordedTxJournal: analyticsSum.recordedTxJournal,
              dbSizeBytes: analyticsSum.dbSizeBytes,
            }
          : null,
      };

      const redacted = redactDiagnosticText(JSON.stringify(reportObj, null, 2));
      const defaultName = `xrpl-command-center-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
      const picked = await dialog.showSaveDialog({
        title: 'Export Redacted Diagnostic Report (Zero Keys/Seeds)',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: 'JSON Report', extensions: ['json'] }],
      });
      if (picked.canceled || !picked.filePath) {
        return { ok: false, cancelled: true };
      }
      await fs.writeFile(picked.filePath, redacted, 'utf8');
      return { ok: true, filePath: picked.filePath };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to export diagnostics.',
      };
    }
  });
}

app.whenReady().then(() => {
  const userDataDir = app.getPath('userData');
  const sidecarBin = resolveRustSidecarBinaryPath(app.isPackaged, process.resourcesPath);
  if (sidecarBin) {
    rustSidecar = new RustVaultSidecarClient(sidecarBin, userDataDir);
    rustSidecar.start();
  }

  const osCipher = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain: string) => safeStorage.encryptString(plain),
    decrypt: (buf: Buffer) => safeStorage.decryptString(buf),
  };

  walletVault = new WalletVaultService(userDataDir, osCipher, rustSidecar);
  walletVault.setOnLockListener(() => {
    void walletVault
      .getStatus()
      .then((st) => sendToRenderer('wallet:vaultStatusChanged', st))
      .catch(() => undefined);
  });

  dockerService = new DockerNodeService(userDataDir);
  analyticsService = new AnalyticsSqliteService(userDataDir);
  mcpAgentService = new McpAgentService({
    storageDir: userDataDir,
    appVersion: APP_VERSION,
    streamManager,
    directoryService,
    nodeOpsService,
    dockerService,
    walletVault,
    getRecentLedgers: () => recentLedgers,
    getLastNodeConfig: () => lastMonitoredNodeConfig,
    emitStatus: (st) => sendToRenderer('mcp:status', st),
    emitRendererAction: (action) => sendToRenderer('mcp:rendererAction', action),
    osCipher,
  });

  void analyticsService.init();
  void walletVault.getStatus().catch(() => undefined);
  void mcpAgentService.init().catch(() => undefined);

  configureAutoUpdater();
  registerIpcHandlers();
  void ensureLinuxDesktopIconIntegration();
  createWindow();
  setupTray();
  void streamManager.connect('mainnet');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (watchdogTimer) clearInterval(watchdogTimer);
  void mcpAgentService?.shutdown();
  walletVault?.lock();
  rustSidecar?.shutdown();
  void analyticsService?.close();
  streamManager.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !trayUpdaterState.minimizeToTray) {
    app.quit();
  }
});
