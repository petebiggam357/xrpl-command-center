import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import path from 'node:path';
import type {
  DesktopNotificationPayload,
  NetworkId,
  NodeConnectionConfig,
} from '../src/shared/types';
import { DirectoryService } from './directoryService';
import { NodeOpsService } from './nodeOpsService';
import { XrplStreamManager } from './xrplStream';

let mainWindow: BrowserWindow | null = null;
const streamManager = new XrplStreamManager();
const directoryService = new DirectoryService();
const nodeOpsService = new NodeOpsService();

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

streamManager.on('status', (status) => sendToRenderer('xrpl:status', status));
streamManager.on('ledger', (ledger) => sendToRenderer('xrpl:ledger', ledger));
streamManager.on('transaction', (tx) => sendToRenderer('xrpl:tx', tx));
streamManager.on('validation', (val) => sendToRenderer('xrpl:validation', val));
streamManager.on('consensus', (phase) => sendToRenderer('xrpl:consensus', phase));

function createWindow(): void {
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL) || !app.isPackaged;
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#040811',
    title: 'XRPL Command Center — v0.0.1-alpha',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
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

  ipcMain.handle('nodeOps:poll', (_evt, config: NodeConnectionConfig) => {
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

  ipcMain.handle('desktop:notify', (_evt, payload: DesktopNotificationPayload) => {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: payload.title,
        body: payload.body,
      });
      notif.show();
    }
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  void streamManager.connect('mainnet');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  streamManager.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
