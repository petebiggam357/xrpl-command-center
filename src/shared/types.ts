export type NetworkId = 'mainnet' | 'testnet' | 'devnet' | 'custom';

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
  ledgerTime: number; // Unix ms
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
  timestamp: number; // Unix ms
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
// Encrypted Local Wallet Vault & DeFi Transaction Suite Types
// ============================================================================

export type WalletAlgorithm = 'ed25519' | 'ecdsa-secp256k1';

export interface WalletAccountPublic {
  id: string;
  label: string;
  address: string;
  kind: 'custodial' | 'watch-only';
  algorithm?: WalletAlgorithm;
  createdAt: number;
}

export interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
  osKeychainAvailable: boolean;
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
  currency: string; // 'XRP' or 3-char or 40-hex currencyRaw
  issuer?: string;
  value: string;
}

export type WalletTxIntent =
  | {
      kind: 'Payment';
      account: string;
      destination: string;
      asset: AssetSpec;
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
    }
  | {
      kind: 'OfferCreate';
      account: string;
      takerGets: AssetSpec; // What the creator offers to give/sell
      takerPays: AssetSpec; // What the creator wants to receive/buy
      orderMode?: 'limit' | 'passive' | 'ioc' | 'fok';
    }
  | {
      kind: 'OfferCancel';
      account: string;
      offerSequence: number;
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
      kind: 'NFTokenMint';
      account: string;
      uriText: string;
      taxon: number;
      transferFeeBps: number;
      transferable: boolean;
      burnable: boolean;
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
    };

export interface TxPreflightPreview {
  ok: boolean;
  networkId: NetworkId;
  endpoint: string;
  txJson: Record<string, unknown>;
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
  nodeOpsPoll: (config: NodeConnectionConfig) => Promise<NodeOpsSnapshot>;
  nodeOpsAdminCommand: (
    config: NodeConnectionConfig,
    method: string,
    params?: Record<string, unknown>
  ) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
  nodeOpsReadLogTail: (filePath: string, maxLines?: number) => Promise<{ ok: boolean; lines: string[]; error?: string }>;
  notifyDesktop: (payload: DesktopNotificationPayload) => Promise<void>;

  // Wallet Vault & DeFi IPC
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
    address: string
  ) => Promise<{ ok: boolean; account?: WalletAccountPublic; status?: VaultStatus; error?: string }>;
  walletRemoveAccount: (walletId: string) => Promise<VaultStatus>;
  walletFetchPortfolio: (address: string) => Promise<WalletPortfolioSnapshot>;
  walletFundFaucet: (
    address: string,
    networkId: NetworkId
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  walletPreflightTx: (intent: WalletTxIntent) => Promise<TxPreflightPreview>;
  walletSignAndSubmitTx: (walletId: string, intent: WalletTxIntent) => Promise<TxSubmitResult>;

  onStreamStatus: (cb: (status: StreamStatus) => void) => () => void;
  onLedgerClosed: (cb: (ledger: LedgerSnapshot) => void) => () => void;
  onTransaction: (cb: (tx: LiveTransaction) => void) => () => void;
  onValidation: (cb: (val: ValidationPulse) => void) => () => void;
  onConsensusPhase: (cb: (phase: ConsensusPhase) => void) => () => void;
}
