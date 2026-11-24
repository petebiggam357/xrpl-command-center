import { contextBridge, ipcRenderer } from 'electron';
import type {
  ConsensusPhase,
  DesktopNotificationPayload,
  LedgerSnapshot,
  LiveTransaction,
  NetworkId,
  NodeConnectionConfig,
  StreamStatus,
  ValidationPulse,
  WalletAlgorithm,
  WalletTxIntent,
  XrplDesktopApi,
} from '../src/shared/types';

function subscribeChannel<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: XrplDesktopApi = {
  isElectron: true,
  platform: process.platform,
  version: '0.0.1-alpha',
  connectNetwork: (networkId: NetworkId, customEndpoint?: string) =>
    ipcRenderer.invoke('xrpl:connect', networkId, customEndpoint),
  getStreamStatus: () => ipcRenderer.invoke('xrpl:getStatus'),
  rpcRequest: (command: string, params?: Record<string, unknown>) =>
    ipcRenderer.invoke('xrpl:rpc', command, params),
  fetchValidators: (networkId: NetworkId) => ipcRenderer.invoke('xrpl:fetchValidators', networkId),
  fetchTokens: (networkId: NetworkId) => ipcRenderer.invoke('xrpl:fetchTokens', networkId),
  inspectTokenOnLedger: (currencyRaw: string, issuer: string) =>
    ipcRenderer.invoke('xrpl:inspectToken', currencyRaw, issuer),
  inspectQuery: (query: string) => ipcRenderer.invoke('xrpl:inspectQuery', query),
  nodeOpsPoll: (config: NodeConnectionConfig) => ipcRenderer.invoke('nodeOps:poll', config),
  nodeOpsAdminCommand: (
    config: NodeConnectionConfig,
    method: string,
    params?: Record<string, unknown>
  ) => ipcRenderer.invoke('nodeOps:adminCommand', config, method, params),
  nodeOpsReadLogTail: (filePath: string, maxLines?: number) =>
    ipcRenderer.invoke('nodeOps:readLogTail', filePath, maxLines),
  notifyDesktop: (payload: DesktopNotificationPayload) => ipcRenderer.invoke('desktop:notify', payload),

  // Wallet Vault & DeFi IPC
  walletGetStatus: () => ipcRenderer.invoke('wallet:getStatus'),
  walletSetupVault: (passphrase: string) => ipcRenderer.invoke('wallet:setup', passphrase),
  walletUnlockVault: (passphrase: string) => ipcRenderer.invoke('wallet:unlock', passphrase),
  walletLockVault: () => ipcRenderer.invoke('wallet:lock'),
  walletCreate: (label: string, algorithm: WalletAlgorithm) =>
    ipcRenderer.invoke('wallet:create', label, algorithm),
  walletImportSeed: (label: string, seed: string) =>
    ipcRenderer.invoke('wallet:importSeed', label, seed),
  walletAddWatchOnly: (label: string, address: string) =>
    ipcRenderer.invoke('wallet:addWatchOnly', label, address),
  walletRemoveAccount: (walletId: string) => ipcRenderer.invoke('wallet:removeAccount', walletId),
  walletFetchPortfolio: (address: string) => ipcRenderer.invoke('wallet:fetchPortfolio', address),
  walletFundFaucet: (address: string, networkId: NetworkId) =>
    ipcRenderer.invoke('wallet:fundFaucet', address, networkId),
  walletPreflightTx: (intent: WalletTxIntent) => ipcRenderer.invoke('wallet:preflightTx', intent),
  walletSignAndSubmitTx: (walletId: string, intent: WalletTxIntent) =>
    ipcRenderer.invoke('wallet:signAndSubmitTx', walletId, intent),

  onStreamStatus: (cb: (status: StreamStatus) => void) => subscribeChannel('xrpl:status', cb),
  onLedgerClosed: (cb: (ledger: LedgerSnapshot) => void) => subscribeChannel('xrpl:ledger', cb),
  onTransaction: (cb: (tx: LiveTransaction) => void) => subscribeChannel('xrpl:tx', cb),
  onValidation: (cb: (val: ValidationPulse) => void) => subscribeChannel('xrpl:validation', cb),
  onConsensusPhase: (cb: (phase: ConsensusPhase) => void) => subscribeChannel('xrpl:consensus', cb),
};

contextBridge.exposeInMainWorld('xrplApi', api);
