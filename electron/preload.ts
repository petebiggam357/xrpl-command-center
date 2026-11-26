import { contextBridge, ipcRenderer } from 'electron';
import type {
  AssetSpec,
  ConsensusPhase,
  DesktopNotificationPayload,
  DockerProvisionRequest,
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
  version: '0.2.2-beta',
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

  // Node Ops + Docker & Config Diff Studio
  nodeOpsPoll: (config: NodeConnectionConfig) => ipcRenderer.invoke('nodeOps:poll', config),
  nodeOpsAdminCommand: (
    config: NodeConnectionConfig,
    method: string,
    params?: Record<string, unknown>
  ) => ipcRenderer.invoke('nodeOps:adminCommand', config, method, params),
  nodeOpsReadLogTail: (filePath: string, maxLines?: number) =>
    ipcRenderer.invoke('nodeOps:readLogTail', filePath, maxLines),
  dockerGetStatus: () => ipcRenderer.invoke('docker:getStatus'),
  dockerChooseStorageFolder: () => ipcRenderer.invoke('docker:chooseStorageFolder'),
  dockerSetStorageFolder: (customRoot: string | null) =>
    ipcRenderer.invoke('docker:setStorageFolder', customRoot),
  dockerInspectStorage: (targetPath?: string) =>
    ipcRenderer.invoke('docker:inspectStorage', targetPath),
  dockerProvisionNode: (req: DockerProvisionRequest) => ipcRenderer.invoke('docker:provision', req),
  dockerLifecycleAction: (action: 'start' | 'stop' | 'restart' | 'remove') =>
    ipcRenderer.invoke('docker:lifecycle', action),
  dockerReadLogs: (tailLines?: number) => ipcRenderer.invoke('docker:readLogs', tailLines),
  nodeConfigLoad: (customDir?: string) => ipcRenderer.invoke('nodeConfig:load', customDir),
  nodeConfigSaveWithBackup: (payload: {
    configDir?: string;
    rippledCfg: string;
    validatorsTxt: string;
  }) => ipcRenderer.invoke('nodeConfig:saveWithBackup', payload),

  // Wallet Vault, Hardware/QR, Multi-Sig & Pro DEX Pathfinding
  walletGetStatus: () => ipcRenderer.invoke('wallet:getStatus'),
  walletSetupVault: (passphrase: string) => ipcRenderer.invoke('wallet:setup', passphrase),
  walletUnlockVault: (passphrase: string) => ipcRenderer.invoke('wallet:unlock', passphrase),
  walletLockVault: () => ipcRenderer.invoke('wallet:lock'),
  walletCreate: (label: string, algorithm: WalletAlgorithm) =>
    ipcRenderer.invoke('wallet:create', label, algorithm),
  walletImportSeed: (label: string, seed: string) =>
    ipcRenderer.invoke('wallet:importSeed', label, seed),
  walletAddWatchOnly: (
    label: string,
    address: string,
    isHardwareLedger?: boolean,
    derivationPath?: string
  ) => ipcRenderer.invoke('wallet:addWatchOnly', label, address, isHardwareLedger, derivationPath),
  walletRemoveAccount: (walletId: string) => ipcRenderer.invoke('wallet:removeAccount', walletId),
  walletFetchPortfolio: (address: string) => ipcRenderer.invoke('wallet:fetchPortfolio', address),
  walletFundFaucet: (address: string, networkId: NetworkId) =>
    ipcRenderer.invoke('wallet:fundFaucet', address, networkId),
  walletPreflightTx: (intent: WalletTxIntent) => ipcRenderer.invoke('wallet:preflightTx', intent),
  walletSignAndSubmitTx: (walletId: string, intent: WalletTxIntent) =>
    ipcRenderer.invoke('wallet:signAndSubmitTx', walletId, intent),
  walletSubmitSignedBlob: (txBlobHex: string) =>
    ipcRenderer.invoke('wallet:submitSignedBlob', txBlobHex),
  walletSignMultisigPartial: (walletId: string, txJson: Record<string, unknown>) =>
    ipcRenderer.invoke('wallet:signMultisigPartial', walletId, txJson),
  walletCombineAndSubmitMultisig: (partialBlobs: string[]) =>
    ipcRenderer.invoke('wallet:combineAndSubmitMultisig', partialBlobs),
  dexFindBestPath: (params: {
    sourceAccount: string;
    destinationAccount: string;
    destinationAsset: AssetSpec;
    slippagePct: number;
  }) => ipcRenderer.invoke('dex:findBestPath', params),

  // Institutional Primitives
  oracleQueryAggregate: (params: {
    baseAsset: string;
    quoteAsset: string;
    oracles: Array<{ account: string; oracleDocumentId: number }>;
  }) => ipcRenderer.invoke('oracle:queryAggregate', params),
  didResolveAccount: (address: string) => ipcRenderer.invoke('did:resolveAccount', address),

  // SQLite Analytics, CSV Export, Tray & Auto-Updater
  analyticsGetSummary: () => ipcRenderer.invoke('analytics:getSummary'),
  analyticsExportCsv: (kind: 'transactions' | 'ledgers') =>
    ipcRenderer.invoke('analytics:exportCsv', kind),
  systemGetTrayUpdaterState: () => ipcRenderer.invoke('system:getTrayUpdaterState'),
  systemUpdateTraySettings: (patch: { minimizeToTray?: boolean; nodeWatchdogEnabled?: boolean }) =>
    ipcRenderer.invoke('system:updateTraySettings', patch),
  systemCheckForUpdates: () => ipcRenderer.invoke('system:checkForUpdates'),

  // v0.1.0-beta: Live Prices, Amendment Voting, X-Address Codec & Encrypted Vault Backups
  fetchMarketPrices: () => ipcRenderer.invoke('market:fetchPrices'),
  fetchAmendments: () => ipcRenderer.invoke('xrpl:fetchAmendments'),
  decodeXAddress: (xAddress: string) => ipcRenderer.invoke('wallet:decodeXAddress', xAddress),
  encodeXAddress: (classicAddress: string, tag?: number | null, isTestnet?: boolean) =>
    ipcRenderer.invoke('wallet:encodeXAddress', classicAddress, tag, isTestnet),
  walletExportBackup: () => ipcRenderer.invoke('wallet:exportBackup'),
  walletImportBackup: () => ipcRenderer.invoke('wallet:importBackup'),
  walletSetAutoLockMinutes: (minutes: number) =>
    ipcRenderer.invoke('wallet:setAutoLockMinutes', minutes),
  analyticsExportTaxCsv: () => ipcRenderer.invoke('analytics:exportTaxCsv'),
  systemExportDiagnostics: () => ipcRenderer.invoke('system:exportDiagnostics'),

  notifyDesktop: (payload: DesktopNotificationPayload) => ipcRenderer.invoke('desktop:notify', payload),
  onStreamStatus: (cb: (status: StreamStatus) => void) => subscribeChannel('xrpl:status', cb),
  onLedgerClosed: (cb: (ledger: LedgerSnapshot) => void) => subscribeChannel('xrpl:ledger', cb),
  onTransaction: (cb: (tx: LiveTransaction) => void) => subscribeChannel('xrpl:tx', cb),
  onValidation: (cb: (val: ValidationPulse) => void) => subscribeChannel('xrpl:validation', cb),
  onConsensusPhase: (cb: (phase: ConsensusPhase) => void) => subscribeChannel('xrpl:consensus', cb),
};

contextBridge.exposeInMainWorld('xrplApi', api);
