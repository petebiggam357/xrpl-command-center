import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentProviderId,
  AssetSpec,
  ConsensusPhase,
  DesktopNotificationPayload,
  DockerProvisionRequest,
  LedgerSnapshot,
  LiveTransaction,
  MarketOhlcRequest,
  McpRendererAction,
  McpServerStatus,
  NetworkId,
  NodeConnectionConfig,
  StreamStatus,
  ValidationPulse,
  VaultStatus,
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
  version: '0.3.0-beta',
  connectNetwork: (networkId: NetworkId, customEndpoint?: string) =>
    ipcRenderer.invoke('xrpl:connect', networkId, customEndpoint),
  getStreamStatus: () => ipcRenderer.invoke('xrpl:getStatus'),
  rpcRequest: (command: string, params?: Record<string, unknown>) =>
    ipcRenderer.invoke('xrpl:rpc', command, params),
  fetchValidators: (networkId: NetworkId) => ipcRenderer.invoke('xrpl:fetchValidators', networkId),
  fetchTokens: (networkId: NetworkId, options?: { limit?: number; offset?: number; sortBy?: string }) =>
    ipcRenderer.invoke('xrpl:fetchTokens', networkId, options),
  searchTokens: (query: string, networkId: NetworkId) =>
    ipcRenderer.invoke('xrpl:searchTokens', query, networkId),
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
  systemDownloadUpdate: () => ipcRenderer.invoke('system:downloadUpdate'),
  systemInstallUpdate: () => ipcRenderer.invoke('system:installUpdate'),
  systemInstallLocalAppImage: () => ipcRenderer.invoke('system:installLocalAppImage'),
  systemSetUpdaterToken: (token: string | null) =>
    ipcRenderer.invoke('system:setUpdaterToken', token),
  onUpdaterState: (cb) => subscribeChannel('system:updaterState', cb),

  // v0.1.0-beta: Live Prices, Amendment Voting, X-Address Codec & Encrypted Vault Backups
  fetchMarketPrices: () => ipcRenderer.invoke('market:fetchPrices'),
  fetchMarketOhlc: (req: MarketOhlcRequest) => ipcRenderer.invoke('market:fetchOhlc', req),
  fetchAmendments: () => ipcRenderer.invoke('xrpl:fetchAmendments'),
  decodeXAddress: (xAddress: string) => ipcRenderer.invoke('wallet:decodeXAddress', xAddress),
  encodeXAddress: (classicAddress: string, tag?: number | null, isTestnet?: boolean) =>
    ipcRenderer.invoke('wallet:encodeXAddress', classicAddress, tag, isTestnet),
  walletExportBackup: () => ipcRenderer.invoke('wallet:exportBackup'),
  walletImportBackup: () => ipcRenderer.invoke('wallet:importBackup'),
  walletSetAutoLockMinutes: (minutes: number) =>
    ipcRenderer.invoke('wallet:setAutoLockMinutes', minutes),
  walletExportSecurityAudit: (payload: { defaultFilename: string; markdown: string }) =>
    ipcRenderer.invoke('wallet:exportSecurityAudit', payload),
  analyticsExportTaxCsv: () => ipcRenderer.invoke('analytics:exportTaxCsv'),
  systemExportDiagnostics: () => ipcRenderer.invoke('system:exportDiagnostics'),

  // v0.3.0-beta: Agent & MCP Hub + Live Vault Lock Push
  mcpGetStatus: () => ipcRenderer.invoke('mcp:getStatus'),
  mcpUpdateConfig: (patch: {
    enabled?: boolean;
    port?: number;
    allowAutomation?: boolean;
    allowTxDrafting?: boolean;
  }) => ipcRenderer.invoke('mcp:updateConfig', patch),
  mcpRotateToken: () => ipcRenderer.invoke('mcp:rotateToken'),
  mcpUpdateProvider: (patch: {
    provider?: AgentProviderId;
    endpointUrl?: string;
    model?: string;
    apiKey?: string | null;
  }) => ipcRenderer.invoke('mcp:updateProvider', patch),
  mcpClearAuditLog: () => ipcRenderer.invoke('mcp:clearAuditLog'),
  agentSendMessage: (
    message: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ) => ipcRenderer.invoke('agent:sendMessage', message, history),
  onMcpStatus: (cb: (status: McpServerStatus) => void) => subscribeChannel('mcp:status', cb),
  onMcpRendererAction: (cb: (action: McpRendererAction) => void) =>
    subscribeChannel('mcp:rendererAction', cb),
  onVaultStatusChanged: (cb: (status: VaultStatus) => void) =>
    subscribeChannel('wallet:vaultStatusChanged', cb),

  notifyDesktop: (payload: DesktopNotificationPayload) => ipcRenderer.invoke('desktop:notify', payload),
  onStreamStatus: (cb: (status: StreamStatus) => void) => subscribeChannel('xrpl:status', cb),
  onLedgerClosed: (cb: (ledger: LedgerSnapshot) => void) => subscribeChannel('xrpl:ledger', cb),
  onTransaction: (cb: (tx: LiveTransaction) => void) => subscribeChannel('xrpl:tx', cb),
  onValidation: (cb: (val: ValidationPulse) => void) => subscribeChannel('xrpl:validation', cb),
  onConsensusPhase: (cb: (phase: ConsensusPhase) => void) => subscribeChannel('xrpl:consensus', cb),
};

contextBridge.exposeInMainWorld('xrplApi', api);
