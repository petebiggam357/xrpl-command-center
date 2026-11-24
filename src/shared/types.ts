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
  rpcUrl: string; // e.g. http://127.0.0.1:5005
  wsUrl?: string; // e.g. ws://127.0.0.1:6006
  logFilePath?: string; // e.g. /var/log/rippled/debug.log
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
  onStreamStatus: (cb: (status: StreamStatus) => void) => () => void;
  onLedgerClosed: (cb: (ledger: LedgerSnapshot) => void) => () => void;
  onTransaction: (cb: (tx: LiveTransaction) => void) => () => void;
  onValidation: (cb: (val: ValidationPulse) => void) => () => void;
  onConsensusPhase: (cb: (phase: ConsensusPhase) => void) => () => void;
}
