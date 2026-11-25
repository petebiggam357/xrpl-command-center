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
import { WalletVaultService } from './walletVaultService';
import { XrplStreamManager } from './xrplStream';

const APP_VERSION = '0.0.2-alpha';
const LEDGER_USB_VENDOR_ID = 0x2c97;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
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
  if (analyticsService && tx.validated) {
    void walletVault
      ?.getStatus()
      .then((st) => {
        const tracked = st.accounts.some(
          (a) => a.address === tx.account || a.address === tx.destination
        );
        if (tracked) {
          void analyticsService.recordMatchedStreamTx(streamManager.getStatus().networkId, tx);
        }
      })
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

  mainWindow = new BrowserWindow({
    width: 1540,
    height: 970,
    minWidth: 1140,
    minHeight: 720,
    backgroundColor: '#040811',
    title: `XRPL Command Center — v${APP_VERSION}`,
    icon: resolveIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  // Enable Chromium WebHID device selection exclusively for Ledger hardware wallets (0x2c97)
  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'hid' && details.device?.vendorId === LEDGER_USB_VENDOR_ID) {
      return true;
    }
    return false;
  });

  mainWindow.webContents.session.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const ledgerDevice = details.deviceList.find((d) => d.vendorId === LEDGER_USB_VENDOR_ID);
    callback(ledgerDevice ? ledgerDevice.deviceId : '');
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
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
}

app.whenReady().then(() => {
  const userDataDir = app.getPath('userData');

  walletVault = new WalletVaultService(userDataDir, {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (buf) => safeStorage.decryptString(buf),
  });
  dockerService = new DockerNodeService(userDataDir);
  analyticsService = new AnalyticsSqliteService(userDataDir);
  void analyticsService.init();

  configureAutoUpdater();
  registerIpcHandlers();
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
  void analyticsService?.close();
  streamManager.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !trayUpdaterState.minimizeToTray) {
    app.quit();
  }
});
