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
import fs from 'node:fs/promises';
import path from 'node:path';
import { classicAddressToXAddress, xAddressToClassicAddress } from 'xrpl';
import type {
  AssetSpec,
  DesktopNotificationPayload,
  DockerProvisionRequest,
  NetworkId,
  NodeConnectionConfig,
  TrayAndUpdaterSettings,
  WalletAlgorithm,
  WalletTxIntent,
} from '../src/shared/types';
import { AnalyticsSqliteService } from './analyticsService';
import { DirectoryService } from './directoryService';
import { DockerNodeService } from './dockerNodeService';
import { NodeOpsService } from './nodeOpsService';
import { resolveRustSidecarBinaryPath, RustVaultSidecarClient } from './rustVaultClient';
import { WalletVaultService } from './walletVaultService';
import { XrplStreamManager } from './xrplStream';

const APP_VERSION = '0.1.3-beta';
const LEDGER_USB_VENDOR_ID = 0x2c97;
const TREZOR_USB_VENDOR_IDS = new Set([0x1209, 0x534c]);

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

function configureAutoUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    trayUpdaterState.updateState = 'checking';
    trayUpdaterState.updateMessage = 'Checking release feed...';
  });
  autoUpdater.on('update-available', (info) => {
    trayUpdaterState.updateState = 'available';
    trayUpdaterState.availableVersion = info.version;
    trayUpdaterState.updateMessage = `Update v${info.version} is available on your release channel.`;
  });
  autoUpdater.on('update-not-available', () => {
    trayUpdaterState.updateState = 'not-available';
    trayUpdaterState.updateMessage = `You are running the latest version (v${APP_VERSION}).`;
  });
  autoUpdater.on('error', (err) => {
    trayUpdaterState.updateState = 'error';
    trayUpdaterState.updateMessage = app.isPackaged
      ? `Update check unavailable (private repository or offline: ${err.message.slice(0, 90)})`
      : 'Update check skipped in unpackaged dev mode.';
  });
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

  ipcMain.handle('xrpl:rpc', (_evt, command: string, params?: Record<string, unknown>) => {
    return streamManager.request(command, params);
  });

  ipcMain.handle('xrpl:fetchValidators', (_evt, networkId: NetworkId) => {
    return directoryService.fetchValidators(networkId);
  });

  ipcMain.handle('xrpl:fetchTokens', (_evt, networkId: NetworkId) => {
    return directoryService.fetchTokens(networkId);
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

  ipcMain.handle('nodeOps:readLogTail', (_evt, filePath: string, maxLines?: number) => {
    return nodeOpsService.readLogTail(filePath, maxLines);
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

  ipcMain.handle('system:getTrayUpdaterState', () => ({ ...trayUpdaterState }));
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
      return { ...trayUpdaterState };
    }
  );
  ipcMain.handle('system:checkForUpdates', async () => {
    if (!app.isPackaged) {
      trayUpdaterState.updateState = 'not-available';
      trayUpdaterState.updateMessage = `Dev build active (v${APP_VERSION}). Packaged releases check GitHub Releases automatically.`;
      return { ...trayUpdaterState };
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      trayUpdaterState.updateState = 'error';
      trayUpdaterState.updateMessage =
        err instanceof Error
          ? `Release feed private or offline (${err.message.slice(0, 80)})`
          : 'Update check unavailable';
    }
    return { ...trayUpdaterState };
  });

  ipcMain.handle('desktop:notify', (_evt, payload: DesktopNotificationPayload) => {
    showOsNotification(payload);
  });

  // v0.1.0-beta: Live Market Prices, Amendment Voting, X-Address Codec & Encrypted Vault Backups
  ipcMain.handle('market:fetchPrices', () => directoryService.fetchMarketPrices());
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
      const envelope = {
        format: 'xrpl-command-center-encrypted-vault-v1',
        exportedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        engine,
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
}

app.whenReady().then(() => {
  const userDataDir = app.getPath('userData');
  const sidecarBin = resolveRustSidecarBinaryPath(app.isPackaged, process.resourcesPath);
  if (sidecarBin) {
    rustSidecar = new RustVaultSidecarClient(sidecarBin, userDataDir);
    rustSidecar.start();
  }

  walletVault = new WalletVaultService(
    userDataDir,
    {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (plain) => safeStorage.encryptString(plain),
      decrypt: (buf) => safeStorage.decryptString(buf),
    },
    rustSidecar
  );
  dockerService = new DockerNodeService(userDataDir);
  analyticsService = new AnalyticsSqliteService(userDataDir);
  void analyticsService.init();
  void walletVault.getStatus().catch(() => undefined);

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
