import type {
  ChartTimeframe,
  MarketOhlcRequest,
  MarketOhlcResponse,
  OhlcCandle,
} from './chartIndicators';

export type { ChartTimeframe, MarketOhlcRequest, MarketOhlcResponse, OhlcCandle };

export type NetworkId = 'mainnet' | 'testnet' | 'devnet' | 'custom';

export type NavTab =
  | 'command'
  | 'globe'
  | 'validators'
  | 'tokens'
  | 'launcher'
  | 'nftstudio'
  | 'vaults'
  | 'wallets'
  | 'primitives'
  | 'rpc'
  | 'nodeops'
  | 'analytics'
  | 'education';

export interface NetworkPreset {
  id: NetworkId;
  label: string;
  badge: string;
  endpoints: string[];
  explorerUrl: string;
  vhsBaseUrl?: string;
  tokenMetaUrl?: string;
}

export type ConsensusPhase = 'open' | 'establish' | 'accepted' | 'unknown';

export type TxCategory =
  | 'payment'
  | 'token'
  | 'dex'
  | 'amm'
  | 'nft'
  | 'mpt'
  | 'trust'
  | 'escrow'
  | 'system';

export interface LedgerSnapshot {
  ledgerIndex: number;
  ledgerHash: string;
  ledgerTime: number;
  txnCount: number;
  feeBaseDrops: number;
  reserveBaseXrp: number;
  reserveIncXrp: number;
  validatedLedgers: string;
  closeDurationMs?: number;
  totalBurnedDrops?: number;
}

export interface LiveTransaction {
  id: string;
  hash: string;
  txType: string;
  category: TxCategory;
  account: string;
  destination?: string;
  amountDisplay: string;
  amountXrpEstimate: number;
  currency?: string;
  issuer?: string;
  feeDrops: number;
  validated: boolean;
  engineResult?: string;
  ledgerIndex?: number;
  timestamp: number;
  isWhale: boolean;
  raw?: Record<string, unknown>;
}

export interface ValidationPulse {
  validationPublicKey: string;
  ledgerHash: string;
  ledgerIndex: number;
  full: boolean;
  timestamp: number;
  serverVersion?: string;
  baseFee?: number;
}

export interface StreamStatus {
  connected: boolean;
  connecting: boolean;
  networkId: NetworkId;
  endpoint: string;
  latencyMs: number | null;
  serverLoadFactor: number;
  serverVersion?: string;
  peerCount?: number;
  consensusPhase: ConsensusPhase;
  error?: string;
}

export interface ValidatorRecord {
  publicKey: string;
  masterKey?: string;
  domain?: string;
  domainVerified: boolean;
  unl: boolean;
  agreement1h: number | null;
  agreement24h: number | null;
  agreement30d: number | null;
  serverVersion?: string;
  chain?: string;
  lat?: number;
  lon?: number;
  country?: string;
  lastValidatedLedger?: number;
  lastSeenAt?: number;
}

export interface TopologyNode {
  pubkey: string;
  version?: string;
  country?: string;
  lat: number;
  lon: number;
  inbound?: number;
  outbound?: number;
  uptime?: number;
  isValidator?: boolean;
}

export interface TokenRecord {
  id: string;
  currency: string;
  currencyRaw: string;
  issuer: string;
  name?: string;
  domain?: string;
  icon?: string;
  holders: number;
  trustlines: number;
  supply: number;
  volume24hUsd: number;
  marketcapUsd: number;
  priceUsd: number;
  source: 'xrplmeta' | 'live-stream' | 'curated';
  lastSeenAt?: number;
}

export interface IssuerRiskFlags {
  blackholed: boolean;
  disableMaster: boolean;
  globalFreeze: boolean;
  noFreeze: boolean;
  allowClawback: boolean;
  requireAuth: boolean;
  defaultRipple: boolean;
  depositAuth: boolean;
  requireDestTag?: boolean;
  regularKey?: string;
  domain?: string;
}

export interface OrderbookLevel {
  price: number;
  size: number;
  total: number;
  account: string;
}

export interface TokenOnLedgerReport {
  currency: string;
  currencyRaw: string;
  issuer: string;
  fetchedAt: number;
  xrpBalance: string;
  totalObligation?: string;
  flags: IssuerRiskFlags;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  amm?: {
    account: string;
    asset1Amount: string;
    asset2Amount: string;
    asset1Numeric?: number;
    asset2Numeric?: number;
    tradingFeeBps: number;
    lpTokenSupply: string;
  } | null;
  error?: string;
}

export interface InspectorResult {
  kind: 'account' | 'transaction' | 'ledger' | 'error';
  query: string;
  title: string;
  subtitle?: string;
  summary: Array<{ label: string; value: string; tone?: 'cyan' | 'mint' | 'amber' | 'rose' | 'slate' }>;
  flags?: IssuerRiskFlags;
  trustlines?: Array<{
    currency: string;
    currencyRaw: string;
    account: string;
    balance: string;
    limit: string;
  }>;
  transactions?: LiveTransaction[];
  raw: unknown;
}

export interface NodeConnectionConfig {
  rpcUrl: string;
  wsUrl?: string;
  logFilePath?: string;
  label: string;
}

export interface NodePeerInfo {
  address: string;
  version: string;
  latencyMs: number;
  inbound: boolean;
  sanity?: string;
  completeLedgers?: string;
  ledgerHash?: string;
  uptime?: number;
}

export interface NodeAmendmentInfo {
  id: string;
  name: string;
  enabled: boolean;
  supported: boolean;
  vetoed?: boolean | string;
  count?: number;
  threshold?: number;
}

export interface NodeOpsSnapshot {
  connected: boolean;
  endpoint: string;
  checkedAt: number;
  error?: string;
  buildVersion?: string;
  serverState?: string;
  completeLedgers?: string;
  validatedLedgerSeq?: number;
  validatedLedgerAgeSec?: number;
  peersCount?: number;
  inboundPeers?: number;
  outboundPeers?: number;
  uptimeSec?: number;
  loadFactor?: number;
  validationQuorum?: number;
  pubkeyNode?: string;
  pubkeyValidator?: string;
  isValidator?: boolean;
  ioLatencyMs?: number;
  hostId?: string;
  stateAccounting?: Record<string, { durationUs: string; transitions: string }>;
  peers: NodePeerInfo[];
  amendments: NodeAmendmentInfo[];
  canDelete?: string | number;
  adminAvailable: boolean;
}

export interface WatchlistEntry {
  id: string;
  label: string;
  type: 'account' | 'token' | 'validator';
  target: string;
  minXrpAlert?: number;
  notifyOs: boolean;
  createdAt: number;
}

export interface DesktopNotificationPayload {
  title: string;
  body: string;
}

// ============================================================================
// Track 1: Docker Node Lifecycle & Visual rippled.cfg Studio Types
// ============================================================================

export interface NodeStorageInfo {
  storageRoot: string;
  configDir: string;
  dataDir: string;
  isDefault: boolean;
  exists: boolean;
  writable: boolean;
  freeBytes: number | null;
  totalBytes: number | null;
  freeGb: number | null;
  totalGb: number | null;
  error?: string;
}

export interface DockerNodeStatus {
  dockerInstalled: boolean;
  daemonRunning: boolean;
  dockerVersion?: string;
  containerExists: boolean;
  containerRunning: boolean;
  containerName: string;
  containerState?: string;
  image?: string;
  network?: 'mainnet' | 'testnet' | 'devnet';
  storageRoot: string;
  configDir: string;
  dataDir: string;
  mountedDataDir?: string;
  storageInfo?: NodeStorageInfo;
  portsSummary?: string;
  error?: string;
}

export interface DockerProvisionRequest {
  network: 'mainnet' | 'testnet' | 'devnet';
  sizing: '16gb-light' | '32gb-standard' | '64gb-full';
  dbBackend: 'NuDB' | 'RocksDB';
  onlineDeleteLedgers: number;
  storageRoot?: string;
  image?: string;
}

export interface NodeConfigBundle {
  configDir: string;
  rippledCfgPath: string;
  validatorsTxtPath: string;
  rippledCfg: string;
  validatorsTxt: string;
  existsOnDisk: boolean;
}

// ============================================================================
// Wallet, Hardware/QR, Multi-Sig, Pro DEX Pathfinding & Institutional Primitives
// ============================================================================

export type WalletAlgorithm = 'ed25519' | 'ecdsa-secp256k1';

export interface WalletAccountPublic {
  id: string;
  label: string;
  address: string;
  kind: 'custodial' | 'watch-only' | 'hardware-ledger';
  algorithm?: WalletAlgorithm;
  derivationPath?: string;
  createdAt: number;
}

export interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
  osKeychainAvailable: boolean;
  backend?: 'rust-sidecar' | 'node-fallback';
  kdf?: string;
  sidecarPid?: number;
  accounts: WalletAccountPublic[];
}

export interface WalletTokenBalance {
  currency: string;
  currencyRaw: string;
  issuer: string;
  balance: string;
  limit: string;
  noRipple: boolean;
  authorized: boolean;
  freeze: boolean;
}

export interface WalletOpenOffer {
  seq: number;
  flags: number;
  takerGetsDisplay: string;
  takerPaysDisplay: string;
  quality?: string;
  expiration?: number;
}

export interface WalletEscrowEntry {
  index: string;
  account: string;
  destination: string;
  amountXrp: string;
  finishAfterMs?: number;
  cancelAfterMs?: number;
  offerSequence?: number;
  condition?: string;
}

export interface WalletCheckEntry {
  index: string;
  account: string;
  destination: string;
  sendMaxDisplay: string;
  sendMaxRaw: string | { currency: string; issuer: string; value: string };
  sequence: number;
  expirationMs?: number;
  destinationTag?: number;
}

export interface WalletNftEntry {
  nftokenId: string;
  issuer: string;
  taxon: number;
  serial: number;
  uriDecoded?: string;
  uriHex?: string;
  transferFeeBps: number;
  flags: number;
}

export interface SignerListInfo {
  signerQuorum: number;
  signers: Array<{ account: string; weight: number }>;
}

export interface WalletPortfolioSnapshot {
  address: string;
  funded: boolean;
  fetchedAt: number;
  totalXrp: number;
  totalXrpDisplay: string;
  baseReserveXrp: number;
  ownerReserveXrp: number;
  spendableXrp: number;
  sequence: number;
  ownerCount: number;
  domain?: string;
  flags: IssuerRiskFlags;
  signerList?: SignerListInfo | null;
  tokens: WalletTokenBalance[];
  offers: WalletOpenOffer[];
  escrows: WalletEscrowEntry[];
  checks: WalletCheckEntry[];
  nfts: WalletNftEntry[];
  recentTransactions: LiveTransaction[];
  qrSvg?: string;
  error?: string;
}

export interface AssetSpec {
  currency: string;
  issuer?: string;
  value: string;
}

export interface PathFindQuote {
  ok: boolean;
  sourceAmountDisplay: string;
  sendMaxSpec: AssetSpec;
  deliverMinSpec: AssetSpec;
  destinationAmountSpec: AssetSpec;
  pathsComputed?: unknown[];
  hopsSummary: string;
  error?: string;
}

export type WalletTxIntent =
  | {
      kind: 'Payment';
      account: string;
      destination: string;
      asset: AssetSpec;
      sendMax?: AssetSpec;
      deliverMin?: AssetSpec;
      paths?: unknown[];
      destinationTag?: number;
      memoText?: string;
    }
  | {
      kind: 'TrustSet';
      account: string;
      currency: string;
      issuer: string;
      limit: string;
      allowRippling?: boolean;
      authorizeTrustLine?: boolean;
    }
  | {
      kind: 'OfferCreate';
      account: string;
      takerGets: AssetSpec;
      takerPays: AssetSpec;
      orderMode?: 'limit' | 'passive' | 'ioc' | 'fok';
    }
  | {
      kind: 'OfferCancel';
      account: string;
      offerSequence: number;
    }
  | {
      kind: 'AMMCreate';
      account: string;
      amount1: AssetSpec;
      amount2: AssetSpec;
      tradingFeeBps: number; // 0..100 bps (0..1000 XRPL units)
    }
  | {
      kind: 'AMMVote';
      account: string;
      asset1: { currency: string; issuer?: string };
      asset2: { currency: string; issuer?: string };
      tradingFeeBps: number;
    }
  | {
      kind: 'AMMDeposit';
      account: string;
      asset1: { currency: string; issuer?: string };
      asset2: { currency: string; issuer?: string };
      amount1: AssetSpec;
      amount2?: AssetSpec;
    }
  | {
      kind: 'AMMWithdraw';
      account: string;
      asset1: { currency: string; issuer?: string };
      asset2: { currency: string; issuer?: string };
      withdrawAll: boolean;
      amount1?: AssetSpec;
    }
  | {
      kind: 'EscrowCreate';
      account: string;
      destination: string;
      amountXrp: string;
      finishAfterUnixMs: number;
      cancelAfterUnixMs?: number;
      destinationTag?: number;
      memoText?: string;
    }
  | {
      kind: 'EscrowFinish';
      account: string;
      owner: string;
      offerSequence: number;
    }
  | {
      kind: 'EscrowCancel';
      account: string;
      owner: string;
      offerSequence: number;
    }
  | {
      kind: 'CheckCreate';
      account: string;
      destination: string;
      sendMax: AssetSpec;
      destinationTag?: number;
      expirationUnixMs?: number;
    }
  | {
      kind: 'CheckCash';
      account: string;
      checkId: string;
      amount: AssetSpec;
    }
  | {
      kind: 'CheckCancel';
      account: string;
      checkId: string;
    }
  | {
      kind: 'PaymentChannelCreate';
      account: string;
      destination: string;
      amountXrp: string;
      settleDelaySec: number;
      publicKeyHex: string;
      cancelAfterUnixMs?: number;
      destinationTag?: number;
    }
  | {
      kind: 'PaymentChannelFund';
      account: string;
      channelId: string;
      amountXrp: string;
      expirationUnixMs?: number;
    }
  | {
      kind: 'SetRegularKey';
      account: string;
      regularKey?: string;
    }
  | {
      kind: 'VaultCreate';
      account: string;
      asset: { currency: string; issuer?: string };
      assetsMaximum?: string;
      domainId?: string;
      dataText?: string;
      isPrivate: boolean;
    }
  | {
      kind: 'VaultDeposit';
      account: string;
      vaultId: string;
      amount: AssetSpec;
    }
  | {
      kind: 'VaultWithdraw';
      account: string;
      vaultId: string;
      amount: AssetSpec;
    }
  | {
      kind: 'LoanBrokerSet';
      account: string;
      vaultId: string;
      managementFeeRateBps: number;
      debtMaximum: string;
      coverRateMinimumPct: number;
      coverRateLiquidationPct: number;
      dataText?: string;
    }
  | {
      kind: 'LoanPay';
      account: string;
      loanId: string;
      amount: AssetSpec;
    }
  | {
      kind: 'NFTokenMint';
      account: string;
      uriText: string;
      taxon: number;
      transferFeeBps: number;
      transferable: boolean;
      burnable: boolean;
      onlyXrp?: boolean;
    }
  | {
      kind: 'NFTokenCreateOffer';
      account: string;
      nftokenId: string;
      amountXrp: string;
      destination?: string;
      isSellOffer: boolean;
    }
  | {
      kind: 'NFTokenBurn';
      account: string;
      nftokenId: string;
    }
  | {
      kind: 'SignerListSet';
      account: string;
      signerQuorum: number;
      signers: Array<{ account: string; weight: number }>;
    }
  | {
      kind: 'AccountSet';
      account: string;
      domain?: string;
      transferRatePercent?: number;
      tickSize?: number;
      enableDefaultRipple?: boolean;
      enableRequireDest?: boolean;
      enableAllowClawback?: boolean;
      enableNoFreeze?: boolean;
      enableRequireAuth?: boolean;
    }
  | {
      kind: 'MPTokenIssuanceCreate';
      account: string;
      assetScale: number;
      maximumAmount?: string;
      transferFeeBps?: number;
      metadataText?: string;
      canTransfer: boolean;
      canTrade: boolean;
      canEscrow: boolean;
      canClawback: boolean;
      canLock: boolean;
      requireAuth: boolean;
    }
  | {
      kind: 'MPTokenAuthorize';
      account: string;
      mptIssuanceId: string;
      holder?: string;
      unauthorize?: boolean;
    }
  | {
      kind: 'Clawback';
      account: string;
      currency: string;
      holder: string;
      value: string;
    }
  | {
      kind: 'OracleSet';
      account: string;
      oracleDocumentId: number;
      provider: string;
      assetClass: string;
      baseAsset: string;
      quoteAsset: string;
      assetPrice: number;
      scale: number;
    }
  | {
      kind: 'OracleDelete';
      account: string;
      oracleDocumentId: number;
    }
  | {
      kind: 'DIDSet';
      account: string;
      uri?: string;
      didDocument?: string;
      dataText?: string;
    }
  | {
      kind: 'DIDDelete';
      account: string;
    };

export interface TxPreflightPreview {
  ok: boolean;
  networkId: NetworkId;
  endpoint: string;
  txJson: Record<string, unknown>;
  unsignedQrSvg?: string;
  signingHex?: string;
  feeDrops: string;
  feeXrp: string;
  summaryLines: Array<{ label: string; value: string }>;
  warnings: string[];
  blockingError?: string;
}

export interface TxSubmitResult {
  ok: boolean;
  hash?: string;
  engineResult?: string;
  engineMessage?: string;
  validated?: boolean;
  ledgerIndex?: number;
  error?: string;
}

// ============================================================================
// Track 4: Institutional Primitives Read Models
// ============================================================================

export interface OracleAggregateReport {
  ok: boolean;
  baseAsset: string;
  quoteAsset: string;
  entireSetMean?: string;
  trimmedMean?: string;
  median?: string;
  size?: number;
  time?: number;
  error?: string;
}

export interface DidResolutionReport {
  ok: boolean;
  did: string;
  address: string;
  uri?: string;
  didDocument?: string;
  data?: string;
  error?: string;
}

// ============================================================================
// Track 5: SQLite Analytics, CSV Export, System Tray & Updater Types
// ============================================================================

export interface WalletJournalRow {
  id: number;
  timestamp: number;
  network: string;
  txType: string;
  account: string;
  destination: string;
  amountDisplay: string;
  feeDrops: number;
  hash: string;
  status: string;
}

export interface SqliteAnalyticsSummary {
  dbPath: string;
  dbSizeBytes: number;
  recordedLedgers: number;
  recordedTxJournal: number;
  avgTpsRecent: number;
  avgFeeDropsRecent: number;
  peakTxnLedger: { ledgerIndex: number; txnCount: number } | null;
  recentJournal: WalletJournalRow[];
  ledgerSeries: Array<{
    ledgerIndex: number;
    ledgerTime: number;
    txnCount: number;
    feeBaseDrops: number;
    closeDurationMs: number;
  }>;
}

export interface TrayAndUpdaterSettings {
  minimizeToTray: boolean;
  nodeWatchdogEnabled: boolean;
  currentVersion: string;
  updateState: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  availableVersion?: string;
  updateMessage?: string;
}

// ============================================================================
// v0.1.0-beta Polish & Utility Suite Types
// ============================================================================

export interface AddressBookContact {
  id: string;
  label: string;
  address: string;
  defaultTag?: number;
  requireTag?: boolean;
  category: 'exchange' | 'personal' | 'issuer' | 'other';
  notes?: string;
  createdAt: number;
}

export interface DecodedMemo {
  type?: string;
  data?: string;
  format?: string;
}

export interface ReserveBreakdown {
  totalXrp: number;
  baseReserveXrp: number;
  ownerReserveXrp: number;
  ownerCount: number;
  lockedXrp: number;
  spendableXrp: number;
  lockedPct: number;
  spendablePct: number;
}

export interface MarketPriceSnapshot {
  xrpUsd: number | null;
  change24hPct: number | null;
  source: string;
  fetchedAt: number;
}

export interface AmendmentVoteRecord {
  id: string;
  name: string;
  enabled: boolean;
  supported: boolean;
  count: number;
  threshold: number;
  percent: number;
  vetoed?: boolean;
}

export interface XAddressDecodeResult {
  ok: boolean;
  classicAddress?: string;
  tag?: number | null;
  test?: boolean;
  error?: string;
}

export interface XAddressEncodeResult {
  ok: boolean;
  xAddress?: string;
  error?: string;
}

export interface VaultBackupResult {
  ok: boolean;
  filePath?: string;
  cancelled?: boolean;
  status?: VaultStatus;
  message?: string;
  error?: string;
}

export interface SavedEndpointProfile {
  id: string;
  label: string;
  wsUrl: string;
  createdAt: number;
}

export type HudThemeId = 'cyber-cyan' | 'emerald-matrix' | 'solar-amber' | 'midnight-contrast';

export interface PriceAlertRule {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  targetUsd: number;
  active: boolean;
  triggeredAt?: number;
  createdAt: number;
}

export interface PortfolioSnapshotPoint {
  timestamp: number;
  totalXrp: number;
  totalUsd: number;
}

export type WalletGroupTag =
  | 'general'
  | 'cold-storage'
  | 'defi-hot'
  | 'issuer-treasury'
  | 'testnet';

export interface XrplDesktopApi {
  isElectron: true;
  platform: string;
  version: string;
  connectNetwork: (networkId: NetworkId, customEndpoint?: string) => Promise<StreamStatus>;
  getStreamStatus: () => Promise<StreamStatus>;
  rpcRequest: (command: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  fetchValidators: (networkId: NetworkId) => Promise<{
    validators: ValidatorRecord[];
    topology: TopologyNode[];
    fetchedAt: number;
    source: string;
  }>;
  fetchTokens: (networkId: NetworkId) => Promise<{
    tokens: TokenRecord[];
    fetchedAt: number;
    source: string;
  }>;
  inspectTokenOnLedger: (currencyRaw: string, issuer: string) => Promise<TokenOnLedgerReport>;
  inspectQuery: (query: string) => Promise<InspectorResult>;

  // Node Ops & Track 1 Docker + Config Studio
  nodeOpsPoll: (config: NodeConnectionConfig) => Promise<NodeOpsSnapshot>;
  nodeOpsAdminCommand: (
    config: NodeConnectionConfig,
    method: string,
    params?: Record<string, unknown>
  ) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
  nodeOpsReadLogTail: (filePath: string, maxLines?: number) => Promise<{ ok: boolean; lines: string[]; error?: string }>;
  dockerGetStatus: () => Promise<DockerNodeStatus>;
  dockerChooseStorageFolder: () => Promise<{
    ok: boolean;
    cancelled?: boolean;
    storageInfo?: NodeStorageInfo;
    status?: DockerNodeStatus;
    error?: string;
  }>;
  dockerSetStorageFolder: (customRoot: string | null) => Promise<{
    ok: boolean;
    storageInfo?: NodeStorageInfo;
    status?: DockerNodeStatus;
    error?: string;
  }>;
  dockerInspectStorage: (targetPath?: string) => Promise<NodeStorageInfo>;
  dockerProvisionNode: (req: DockerProvisionRequest) => Promise<{ ok: boolean; message?: string; status?: DockerNodeStatus; error?: string }>;
  dockerLifecycleAction: (action: 'start' | 'stop' | 'restart' | 'remove') => Promise<{ ok: boolean; message?: string; status?: DockerNodeStatus; error?: string }>;
  dockerReadLogs: (tailLines?: number) => Promise<{ ok: boolean; lines: string[]; error?: string }>;
  nodeConfigLoad: (customDir?: string) => Promise<NodeConfigBundle>;
  nodeConfigSaveWithBackup: (payload: {
    configDir?: string;
    rippledCfg: string;
    validatorsTxt: string;
  }) => Promise<{ ok: boolean; backupPaths?: string[]; error?: string }>;

  // Wallet Vault, Hardware/QR, Multi-Sig & Pro DEX Pathfinding
  walletGetStatus: () => Promise<VaultStatus>;
  walletSetupVault: (passphrase: string) => Promise<{ ok: boolean; status?: VaultStatus; error?: string }>;
  walletUnlockVault: (passphrase: string) => Promise<{ ok: boolean; status?: VaultStatus; error?: string }>;
  walletLockVault: () => Promise<VaultStatus>;
  walletCreate: (
    label: string,
    algorithm: WalletAlgorithm
  ) => Promise<{ ok: boolean; account?: WalletAccountPublic; oneTimeSeed?: string; status?: VaultStatus; error?: string }>;
  walletImportSeed: (
    label: string,
    seed: string
  ) => Promise<{ ok: boolean; account?: WalletAccountPublic; status?: VaultStatus; error?: string }>;
  walletAddWatchOnly: (
    label: string,
    address: string,
    isHardwareLedger?: boolean,
    derivationPath?: string
  ) => Promise<{ ok: boolean; account?: WalletAccountPublic; status?: VaultStatus; error?: string }>;
  walletRemoveAccount: (walletId: string) => Promise<VaultStatus>;
  walletFetchPortfolio: (address: string) => Promise<WalletPortfolioSnapshot>;
  walletFundFaucet: (
    address: string,
    networkId: NetworkId
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  walletPreflightTx: (intent: WalletTxIntent) => Promise<TxPreflightPreview>;
  walletSignAndSubmitTx: (walletId: string, intent: WalletTxIntent) => Promise<TxSubmitResult>;
  walletSubmitSignedBlob: (txBlobHex: string) => Promise<TxSubmitResult>;
  walletSignMultisigPartial: (
    walletId: string,
    txJson: Record<string, unknown>
  ) => Promise<{ ok: boolean; txBlob?: string; signerAddress?: string; error?: string }>;
  walletCombineAndSubmitMultisig: (partialBlobs: string[]) => Promise<TxSubmitResult>;
  dexFindBestPath: (params: {
    sourceAccount: string;
    destinationAccount: string;
    destinationAsset: AssetSpec;
    slippagePct: number;
  }) => Promise<PathFindQuote>;

  // Track 4: Institutional Primitives Queries
  oracleQueryAggregate: (params: {
    baseAsset: string;
    quoteAsset: string;
    oracles: Array<{ account: string; oracleDocumentId: number }>;
  }) => Promise<OracleAggregateReport>;
  didResolveAccount: (address: string) => Promise<DidResolutionReport>;

  // Track 5: SQLite Analytics, CSV Export, Tray & Auto-Updater
  analyticsGetSummary: () => Promise<SqliteAnalyticsSummary>;
  analyticsExportCsv: (kind: 'transactions' | 'ledgers') => Promise<{ ok: boolean; filePath?: string; rowCount?: number; error?: string }>;
  systemGetTrayUpdaterState: () => Promise<TrayAndUpdaterSettings>;
  systemUpdateTraySettings: (patch: { minimizeToTray?: boolean; nodeWatchdogEnabled?: boolean }) => Promise<TrayAndUpdaterSettings>;
  systemCheckForUpdates: () => Promise<TrayAndUpdaterSettings>;

  // v0.1.0-beta: Live Prices, Amendment Voting, X-Address Codec & Encrypted Vault Backups
  fetchMarketPrices: () => Promise<MarketPriceSnapshot>;
  fetchMarketOhlc: (req: MarketOhlcRequest) => Promise<MarketOhlcResponse>;
  fetchAmendments: () => Promise<{ amendments: AmendmentVoteRecord[]; source: string; fetchedAt: number }>;
  decodeXAddress: (xAddress: string) => Promise<XAddressDecodeResult>;
  encodeXAddress: (classicAddress: string, tag?: number | null, isTestnet?: boolean) => Promise<XAddressEncodeResult>;
  walletExportBackup: () => Promise<VaultBackupResult>;
  walletImportBackup: () => Promise<VaultBackupResult>;
  walletSetAutoLockMinutes: (minutes: number) => Promise<{ ok: boolean; minutes: number }>;
  walletExportSecurityAudit: (payload: {
    defaultFilename: string;
    markdown: string;
  }) => Promise<{ ok: boolean; filePath?: string; cancelled?: boolean; error?: string }>;
  analyticsExportTaxCsv: () => Promise<{ ok: boolean; filePath?: string; rowCount?: number; error?: string }>;
  systemExportDiagnostics: () => Promise<{ ok: boolean; filePath?: string; cancelled?: boolean; error?: string }>;

  notifyDesktop: (payload: DesktopNotificationPayload) => Promise<void>;
  onStreamStatus: (cb: (status: StreamStatus) => void) => () => void;
  onLedgerClosed: (cb: (ledger: LedgerSnapshot) => void) => () => void;
  onTransaction: (cb: (tx: LiveTransaction) => void) => () => void;
  onValidation: (cb: (val: ValidationPulse) => void) => () => void;
  onConsensusPhase: (cb: (phase: ConsensusPhase) => void) => () => void;
}
