import { create } from 'zustand';
import type {
  AddressBookContact,
  AmendmentVoteRecord,
  ConsensusPhase,
  InspectorResult,
  LedgerSnapshot,
  LiveTransaction,
  MarketPriceSnapshot,
  NetworkId,
  NodeConnectionConfig,
  NodeOpsSnapshot,
  SavedEndpointProfile,
  StreamStatus,
  TokenOnLedgerReport,
  TokenRecord,
  TopologyNode,
  TxCategory,
  TxPreflightPreview,
  TxSubmitResult,
  ValidationPulse,
  ValidatorRecord,
  VaultStatus,
  WalletPortfolioSnapshot,
  WalletTxIntent,
  WatchlistEntry,
} from '../shared/types';
import { DEFAULT_ADDRESS_BOOK_CONTACTS } from '../shared/betaUtils';
import { playAlertPing } from '../services/alertAudio';
import { getXrplBridge } from '../services/xrplBridge';

export type NavTab =
  | 'command'
  | 'globe'
  | 'validators'
  | 'tokens'
  | 'wallets'
  | 'primitives'
  | 'nodeops'
  | 'analytics';

const MAX_LEDGERS = 36;
const MAX_TX_FEED = 180;
const MAX_PULSES = 90;

const WATCHLIST_STORAGE_KEY = 'xrpl-cc-watchlist-v1';
const NODE_CONFIG_STORAGE_KEY = 'xrpl-cc-nodeops-v1';
const CONTACTS_STORAGE_KEY = 'xrpl-cc-contacts-v1';
const WHALE_THRESHOLD_STORAGE_KEY = 'xrpl-cc-whale-threshold-v1';
const QUICKSTART_SEEN_KEY = 'xrpl-cc-quickstart-seen-v1';
const SAVED_ENDPOINTS_KEY = 'xrpl-cc-endpoints-v1';

function loadSavedEndpoints(): SavedEndpointProfile[] {
  try {
    const raw = localStorage.getItem(SAVED_ENDPOINTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedEndpointProfile[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [
    {
      id: 'ep-local-rippled',
      label: 'Local rippled (127.0.0.1:6006)',
      wsUrl: 'ws://127.0.0.1:6006/',
      createdAt: 1735689600000,
    },
  ];
}

function loadSavedContacts(): AddressBookContact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AddressBookContact[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_ADDRESS_BOOK_CONTACTS;
}

function loadWhaleThreshold(): number {
  try {
    const raw = Number(localStorage.getItem(WHALE_THRESHOLD_STORAGE_KEY));
    if (Number.isFinite(raw) && raw >= 100) return raw;
  } catch {
    // ignore
  }
  return 100_000;
}

function loadQuickStartInitialOpen(): boolean {
  try {
    return localStorage.getItem(QUICKSTART_SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

function loadSavedWatchlist(): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WatchlistEntry[];
  } catch {
    // ignore
  }
  return [
    {
      id: 'watch-rlusd',
      label: 'Ripple USD (RLUSD) Issuer',
      type: 'account',
      target: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      minXrpAlert: 50_000,
      notifyOs: true,
      createdAt: Date.now(),
    },
  ];
}

function loadSavedNodeConfig(): NodeConnectionConfig {
  try {
    const raw = localStorage.getItem(NODE_CONFIG_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as NodeConnectionConfig;
  } catch {
    // ignore
  }
  return {
    label: 'Local rippled Admin Node',
    rpcUrl: 'http://127.0.0.1:5005',
    wsUrl: 'ws://127.0.0.1:6006',
    logFilePath: '/var/log/rippled/debug.log',
  };
}

interface CommandState {
  activeTab: NavTab;
  paused: boolean;
  reducedMotion: boolean;
  commandPaletteOpen: boolean;

  // Live XRPL stream telemetry
  streamStatus: StreamStatus;
  ledgers: LedgerSnapshot[];
  transactions: LiveTransaction[];
  recentValidations: ValidationPulse[];
  validatorLastSeen: Record<string, number>;
  currentLedgerValidators: Record<string, boolean>;
  txCategoryCounts: Record<TxCategory, number>;
  txTimestamps10s: number[];
  tpsEstimate: number;
  totalProcessedTxs: number;
  lastLedgerPulseAt: number;

  // Validators & Topology
  validators: ValidatorRecord[];
  topologyNodes: TopologyNode[];
  validatorsLoading: boolean;
  validatorsSource: string;

  // Tokens & Live Discovery
  tokens: TokenRecord[];
  tokensLoading: boolean;
  tokensSource: string;
  selectedToken: TokenRecord | null;
  tokenOnLedgerReport: TokenOnLedgerReport | null;
  tokenReportLoading: boolean;

  // Universal Inspector Drawer
  inspectorOpen: boolean;
  inspectorLoading: boolean;
  inspectorResult: InspectorResult | null;

  // Wallet Vault & DeFi State
  vaultStatus: VaultStatus;
  selectedWalletId: string | null;
  walletPortfolio: WalletPortfolioSnapshot | null;
  walletPortfolioLoading: boolean;
  pendingTxWalletId: string | null;
  pendingTxIntent: WalletTxIntent | null;
  pendingTxPreview: TxPreflightPreview | null;
  pendingTxLoading: boolean;
  txSubmitting: boolean;
  lastTxResult: TxSubmitResult | null;

  // Node Ops
  nodeConfig: NodeConnectionConfig;
  nodeSnapshot: NodeOpsSnapshot | null;
  nodePolling: boolean;
  nodeAutoPoll: boolean;
  nodeLogs: string[];
  nodeLogsError?: string;

  // Watchlist & Alert Feed
  watchlist: WatchlistEntry[];
  alerts: Array<{ id: string; title: string; detail: string; timestamp: number }>;

  // v0.1.0-beta: Address Book, Market Prices, Amendments, Whale Radar & Quick-Start
  contacts: AddressBookContact[];
  marketPrice: MarketPriceSnapshot;
  amendments: AmendmentVoteRecord[];
  amendmentsSource: string;
  amendmentsLoading: boolean;
  whaleThresholdXrp: number;
  quickStartOpen: boolean;

  // v0.1.2-beta: Multi-Wallet Aggregate Net Worth, Saved Endpoints, Audio Ping & Perf HUD
  walletBalancesMap: Record<string, number>;
  savedEndpoints: SavedEndpointProfile[];
  soundAlertsEnabled: boolean;
  showPerfHud: boolean;

  // Actions
  setActiveTab: (tab: NavTab) => void;
  togglePaused: () => void;
  toggleReducedMotion: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  connectNetwork: (networkId: NetworkId, customEndpoint?: string) => Promise<void>;
  ingestStreamStatus: (status: StreamStatus) => void;
  ingestLedger: (ledger: LedgerSnapshot) => void;
  ingestTransaction: (tx: LiveTransaction) => void;
  ingestTransactionBatch: (txs: LiveTransaction[]) => void;
  ingestValidation: (pulse: ValidationPulse) => void;
  ingestValidationBatch: (pulses: ValidationPulse[]) => void;
  ingestConsensusPhase: (phase: ConsensusPhase) => void;
  refreshValidators: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  selectToken: (token: TokenRecord | null) => Promise<void>;
  inspectQuery: (query: string) => Promise<void>;
  inspectLiveTransaction: (tx: LiveTransaction) => void;
  closeInspector: () => void;

  // Wallet Vault Actions
  refreshVaultStatus: () => Promise<void>;
  selectWallet: (walletId: string | null) => Promise<void>;
  refreshWalletPortfolio: () => Promise<void>;
  openTxConfirmModal: (walletId: string, intent: WalletTxIntent) => Promise<void>;
  confirmAndSignPendingTx: () => Promise<void>;
  closeTxConfirmModal: () => void;

  // Node Ops Actions
  updateNodeConfig: (patch: Partial<NodeConnectionConfig>) => void;
  setNodeAutoPoll: (enabled: boolean) => void;
  pollOwnNode: () => Promise<void>;
  refreshNodeLogs: () => Promise<void>;
  addWatchlistEntry: (entry: Omit<WatchlistEntry, 'id' | 'createdAt'>) => void;
  removeWatchlistEntry: (id: string) => void;

  // v0.1.0-beta Actions
  addContact: (contact: Omit<AddressBookContact, 'id' | 'createdAt'>) => void;
  removeContact: (id: string) => void;
  refreshMarketPrice: () => Promise<void>;
  refreshAmendments: () => Promise<void>;
  setWhaleThresholdXrp: (threshold: number) => void;
  setQuickStartOpen: (open: boolean) => void;
  dismissQuickStart: () => void;

  // v0.1.2-beta Actions
  refreshAllWalletBalances: () => Promise<void>;
  addSavedEndpoint: (label: string, wsUrl: string) => void;
  removeSavedEndpoint: (id: string) => void;
  toggleSoundAlerts: () => void;
  togglePerfHud: () => void;
}

const initialCounts: Record<TxCategory, number> = {
  payment: 0,
  token: 0,
  dex: 0,
  amm: 0,
  nft: 0,
  mpt: 0,
  trust: 0,
  escrow: 0,
  system: 0,
};

export const useCommandStore = create<CommandState>((set, get) => ({
  activeTab: 'command',
  paused: false,
  reducedMotion: false,
  commandPaletteOpen: false,

  streamStatus: {
    connected: false,
    connecting: true,
    networkId: 'mainnet',
    endpoint: 'wss://xrplcluster.com/',
    latencyMs: null,
    serverLoadFactor: 1,
    consensusPhase: 'open',
  },
  ledgers: [],
  transactions: [],
  recentValidations: [],
  validatorLastSeen: {},
  currentLedgerValidators: {},
  txCategoryCounts: { ...initialCounts },
  txTimestamps10s: [],
  tpsEstimate: 0,
  totalProcessedTxs: 0,
  lastLedgerPulseAt: 0,

  validators: [],
  topologyNodes: [],
  validatorsLoading: false,
  validatorsSource: '',

  tokens: [],
  tokensLoading: false,
  tokensSource: '',
  selectedToken: null,
  tokenOnLedgerReport: null,
  tokenReportLoading: false,

  inspectorOpen: false,
  inspectorLoading: false,
  inspectorResult: null,

  vaultStatus: {
    initialized: false,
    unlocked: false,
    osKeychainAvailable: false,
    accounts: [],
  },
  selectedWalletId: null,
  walletPortfolio: null,
  walletPortfolioLoading: false,
  pendingTxWalletId: null,
  pendingTxIntent: null,
  pendingTxPreview: null,
  pendingTxLoading: false,
  txSubmitting: false,
  lastTxResult: null,

  nodeConfig: loadSavedNodeConfig(),
  nodeSnapshot: null,
  nodePolling: false,
  nodeAutoPoll: false,
  nodeLogs: [],
  nodeLogsError: undefined,

  watchlist: loadSavedWatchlist(),
  alerts: [],

  contacts: loadSavedContacts(),
  marketPrice: {
    xrpUsd: null,
    change24hPct: null,
    source: '',
    fetchedAt: 0,
  },
  amendments: [],
  amendmentsSource: '',
  amendmentsLoading: false,
  whaleThresholdXrp: loadWhaleThreshold(),
  quickStartOpen: loadQuickStartInitialOpen(),

  walletBalancesMap: {},
  savedEndpoints: loadSavedEndpoints(),
  soundAlertsEnabled: false,
  showPerfHud: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleReducedMotion: () => set((s) => ({ reducedMotion: !s.reducedMotion })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  connectNetwork: async (networkId, customEndpoint) => {
    const bridge = getXrplBridge();
    set({
      ledgers: [],
      transactions: [],
      recentValidations: [],
      currentLedgerValidators: {},
      txCategoryCounts: { ...initialCounts },
      txTimestamps10s: [],
      tpsEstimate: 0,
      totalProcessedTxs: 0,
    });
    const status = await bridge.connectNetwork(networkId, customEndpoint);
    set({ streamStatus: status });
    void get().refreshValidators();
    void get().refreshTokens();
    // Refresh active wallet portfolio on network switch after brief connection settle
    setTimeout(() => {
      void get().refreshWalletPortfolio();
    }, 1200);
  },

  ingestStreamStatus: (status) => set({ streamStatus: status }),

  ingestLedger: (ledger) =>
    set((s) => {
      if (s.ledgers[0]?.ledgerIndex === ledger.ledgerIndex) {
        return s;
      }
      const nextLedgers = [ledger, ...s.ledgers].slice(0, MAX_LEDGERS);
      return {
        ledgers: nextLedgers,
        currentLedgerValidators: {},
        lastLedgerPulseAt: Date.now(),
      };
    }),

  ingestTransaction: (tx) => {
    get().ingestTransactionBatch([tx]);
  },

  ingestTransactionBatch: (txs) => {
    if (txs.length === 0) return;
    const state = get();
    const now = Date.now();
    const cutoff = now - 10_000;

    const selectedAddr = state.vaultStatus.accounts.find((a) => a.id === state.selectedWalletId)?.address;
    let shouldRefreshPortfolio = false;
    const newAlerts: Array<{ id: string; title: string; detail: string; timestamp: number }> = [];

    for (const tx of txs) {
      if (tx.validated && selectedAddr && (tx.account === selectedAddr || tx.destination === selectedAddr)) {
        shouldRefreshPortfolio = true;
      }

      if (state.watchlist.length > 0) {
        for (const item of state.watchlist) {
          const target = item.target.trim();
          const matchedAccount =
            item.type === 'account' && (tx.account === target || tx.destination === target || tx.issuer === target);
          const matchedToken =
            item.type === 'token' &&
            (tx.currency?.toUpperCase() === target.toUpperCase() || tx.issuer === target);

          if (matchedAccount || matchedToken) {
            const meetsMin = !item.minXrpAlert || tx.amountXrpEstimate >= item.minXrpAlert || item.type === 'token';
            if (meetsMin) {
              const title = `Watchlist Hit: ${item.label}`;
              const detail = `${tx.txType} • ${tx.amountDisplay}`;
              newAlerts.push({ id: `${tx.id}-${now}`, title, detail, timestamp: now });
              if (item.notifyOs) {
                void getXrplBridge().notifyDesktop({ title, body: detail });
              }
            }
          }
        }
      }
    }

    if (shouldRefreshPortfolio) {
      void get().refreshWalletPortfolio();
    }

    if (state.soundAlertsEnabled) {
      if (newAlerts.length > 0) {
        playAlertPing('watchlist');
      } else if (txs.some((t) => t.isWhale || t.amountXrpEstimate >= state.whaleThresholdXrp)) {
        playAlertPing('whale');
      }
    }

    set((s) => {
      const recentTs = s.txTimestamps10s.filter((t) => t >= cutoff);
      for (let i = 0; i < txs.length; i++) {
        recentTs.push(now);
      }
      const tps = Number((recentTs.length / 10).toFixed(1));
      const nextCounts = { ...s.txCategoryCounts };
      let nextTokens = s.tokens;
      let tokenSet: Set<string> | null = null;

      for (const tx of txs) {
        nextCounts[tx.category] = (nextCounts[tx.category] ?? 0) + 1;
        if (tx.currency && tx.currency !== 'XRP' && tx.issuer && nextTokens.length < 240) {
          if (!tokenSet) {
            tokenSet = new Set(nextTokens.map((t) => `${t.currency}:${t.issuer}`));
          }
          const key = `${tx.currency}:${tx.issuer}`;
          if (!tokenSet.has(key)) {
            tokenSet.add(key);
            if (nextTokens === s.tokens) nextTokens = [...s.tokens];
            nextTokens.unshift({
              id: key,
              currency: tx.currency,
              currencyRaw: tx.currency,
              issuer: tx.issuer,
              holders: 0,
              trustlines: 0,
              supply: 0,
              volume24hUsd: 0,
              marketcapUsd: 0,
              priceUsd: 0,
              source: 'live-stream',
              lastSeenAt: now,
            });
          }
        }
      }

      const nextAlerts =
        newAlerts.length > 0 ? [...newAlerts.reverse(), ...s.alerts].slice(0, 25) : s.alerts;

      if (s.paused) {
        return {
          txTimestamps10s: recentTs,
          tpsEstimate: tps,
          txCategoryCounts: nextCounts,
          totalProcessedTxs: s.totalProcessedTxs + txs.length,
          tokens: nextTokens,
          alerts: nextAlerts,
        };
      }

      // Newest transactions first
      const newestFirst = txs.length === 1 ? txs : [...txs].reverse();
      return {
        transactions: [...newestFirst, ...s.transactions].slice(0, MAX_TX_FEED),
        txTimestamps10s: recentTs,
        tpsEstimate: tps,
        txCategoryCounts: nextCounts,
        totalProcessedTxs: s.totalProcessedTxs + txs.length,
        tokens: nextTokens,
        alerts: nextAlerts,
      };
    });
  },

  ingestValidation: (pulse) => {
    get().ingestValidationBatch([pulse]);
  },

  ingestValidationBatch: (pulses) => {
    if (pulses.length === 0) return;
    set((s) => {
      const nextLastSeen = { ...s.validatorLastSeen };
      const nextCurrent = { ...s.currentLedgerValidators };
      for (const p of pulses) {
        nextLastSeen[p.validationPublicKey] = p.timestamp;
        nextCurrent[p.validationPublicKey] = true;
      }
      const newestFirst = pulses.length === 1 ? pulses : [...pulses].reverse();
      return {
        recentValidations: [...newestFirst, ...s.recentValidations].slice(0, MAX_PULSES),
        validatorLastSeen: nextLastSeen,
        currentLedgerValidators: nextCurrent,
      };
    });
  },

  ingestConsensusPhase: (phase) =>
    set((s) => ({
      streamStatus: { ...s.streamStatus, consensusPhase: phase },
    })),

  refreshValidators: async () => {
    const networkId = get().streamStatus.networkId;
    set({ validatorsLoading: true });
    try {
      const res = await getXrplBridge().fetchValidators(networkId);
      set({
        validators: res.validators,
        topologyNodes: res.topology,
        validatorsSource: res.source,
        validatorsLoading: false,
      });
    } catch {
      set({ validatorsLoading: false });
    }
  },

  refreshTokens: async () => {
    const networkId = get().streamStatus.networkId;
    set({ tokensLoading: true });
    try {
      const res = await getXrplBridge().fetchTokens(networkId);
      set({
        tokens: res.tokens,
        tokensSource: res.source,
        tokensLoading: false,
      });
    } catch {
      set({ tokensLoading: false });
    }
  },

  selectToken: async (token) => {
    set({ selectedToken: token, tokenOnLedgerReport: null, tokenReportLoading: Boolean(token) });
    if (!token) return;
    try {
      const report = await getXrplBridge().inspectTokenOnLedger(token.currencyRaw, token.issuer);
      if (get().selectedToken?.id === token.id) {
        set({ tokenOnLedgerReport: report, tokenReportLoading: false });
      }
    } catch {
      set({ tokenReportLoading: false });
    }
  },

  inspectQuery: async (query) => {
    if (!query.trim()) return;
    set({ inspectorOpen: true, inspectorLoading: true, commandPaletteOpen: false });
    try {
      const result = await getXrplBridge().inspectQuery(query.trim());
      set({ inspectorResult: result, inspectorLoading: false });
    } catch (err) {
      set({
        inspectorResult: {
          kind: 'error',
          query,
          title: 'Lookup Error',
          subtitle: err instanceof Error ? err.message : 'Unable to query XRPL node',
          summary: [],
          raw: { query },
        },
        inspectorLoading: false,
      });
    }
  },

  inspectLiveTransaction: (tx) => {
    set({
      inspectorOpen: true,
      inspectorLoading: false,
      inspectorResult: {
        kind: 'transaction',
        query: tx.hash,
        title: tx.txType,
        subtitle: tx.hash,
        summary: [
          { label: 'Status', value: tx.validated ? tx.engineResult ?? 'Validated' : 'Proposed (Open Ledger)', tone: tx.validated ? 'mint' : 'amber' },
          { label: 'Amount', value: tx.amountDisplay, tone: 'cyan' },
          { label: 'Fee', value: `${tx.feeDrops} drops`, tone: 'slate' },
          { label: 'Ledger', value: tx.ledgerIndex ? `#${tx.ledgerIndex.toLocaleString()}` : 'Open', tone: 'cyan' },
          { label: 'Account', value: tx.account, tone: 'slate' },
          ...(tx.destination ? [{ label: 'Destination', value: tx.destination, tone: 'slate' as const }] : []),
        ],
        raw: tx.raw ?? tx,
      },
    });
  },

  closeInspector: () => set({ inspectorOpen: false }),

  // Wallet Vault Actions
  refreshVaultStatus: async () => {
    const status = await getXrplBridge().walletGetStatus();
    const curSelected = get().selectedWalletId;
    const validSelected =
      curSelected && status.accounts.some((a) => a.id === curSelected)
        ? curSelected
        : status.accounts[0]?.id ?? null;

    set({ vaultStatus: status, selectedWalletId: validSelected });
    if (validSelected && (!get().walletPortfolio || get().walletPortfolio?.address !== status.accounts.find((a) => a.id === validSelected)?.address)) {
      void get().refreshWalletPortfolio();
    }
  },

  selectWallet: async (walletId) => {
    set({ selectedWalletId: walletId, walletPortfolio: null });
    if (walletId) {
      await get().refreshWalletPortfolio();
    }
  },

  refreshWalletPortfolio: async () => {
    const { selectedWalletId, vaultStatus } = get();
    const acct = vaultStatus.accounts.find((a) => a.id === selectedWalletId);
    if (!acct) {
      set({ walletPortfolio: null, walletPortfolioLoading: false });
      return;
    }
    set({ walletPortfolioLoading: true });
    try {
      const snap = await getXrplBridge().walletFetchPortfolio(acct.address);
      if (get().selectedWalletId === acct.id) {
        set((s) => ({
          walletPortfolio: snap,
          walletPortfolioLoading: false,
          walletBalancesMap: {
            ...s.walletBalancesMap,
            [acct.address]: snap.totalXrp,
          },
        }));
      }
    } catch {
      set({ walletPortfolioLoading: false });
    }
  },

  openTxConfirmModal: async (walletId, intent) => {
    set({
      pendingTxWalletId: walletId,
      pendingTxIntent: intent,
      pendingTxPreview: null,
      pendingTxLoading: true,
      lastTxResult: null,
    });
    const preview = await getXrplBridge().walletPreflightTx(intent);
    set({ pendingTxPreview: preview, pendingTxLoading: false });
  },

  confirmAndSignPendingTx: async () => {
    const { pendingTxWalletId, pendingTxIntent } = get();
    if (!pendingTxWalletId || !pendingTxIntent) return;
    set({ txSubmitting: true });
    const res = await getXrplBridge().walletSignAndSubmitTx(pendingTxWalletId, pendingTxIntent);
    set({ txSubmitting: false, lastTxResult: res });
    if (res.ok) {
      void get().refreshWalletPortfolio();
    }
  },

  closeTxConfirmModal: () =>
    set({
      pendingTxWalletId: null,
      pendingTxIntent: null,
      pendingTxPreview: null,
      pendingTxLoading: false,
      txSubmitting: false,
      lastTxResult: null,
    }),

  updateNodeConfig: (patch) =>
    set((s) => {
      const next = { ...s.nodeConfig, ...patch };
      try {
        localStorage.setItem(NODE_CONFIG_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return { nodeConfig: next };
    }),

  setNodeAutoPoll: (enabled) => set({ nodeAutoPoll: enabled }),

  pollOwnNode: async () => {
    const cfg = get().nodeConfig;
    set({ nodePolling: true });
    try {
      const snap = await getXrplBridge().nodeOpsPoll(cfg);
      set({ nodeSnapshot: snap, nodePolling: false });
    } catch {
      set({ nodePolling: false });
    }
  },

  refreshNodeLogs: async () => {
    const logPath = get().nodeConfig.logFilePath ?? '';
    const res = await getXrplBridge().nodeOpsReadLogTail(logPath, 140);
    set({
      nodeLogs: res.ok ? res.lines : [],
      nodeLogsError: res.ok ? undefined : res.error,
    });
  },

  addWatchlistEntry: (entry) =>
    set((s) => {
      const next: WatchlistEntry[] = [
        { ...entry, id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() },
        ...s.watchlist,
      ];
      try {
        localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return { watchlist: next };
    }),

  removeWatchlistEntry: (id) =>
    set((s) => {
      const next = s.watchlist.filter((w) => w.id !== id);
      try {
        localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return { watchlist: next };
    }),

  addContact: (contact) =>
    set((s) => {
      const cleanAddr = contact.address.trim();
      const filtered = s.contacts.filter((c) => c.address !== cleanAddr);
      const next: AddressBookContact[] = [
        {
          ...contact,
          address: cleanAddr,
          label: contact.label.trim() || cleanAddr.slice(0, 10),
          id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: Date.now(),
        },
        ...filtered,
      ];
      try {
        localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return { contacts: next };
    }),

  removeContact: (id) =>
    set((s) => {
      const next = s.contacts.filter((c) => c.id !== id);
      try {
        localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return { contacts: next };
    }),

  refreshMarketPrice: async () => {
    try {
      const snap = await getXrplBridge().fetchMarketPrices();
      set({ marketPrice: snap });
    } catch {
      // non-fatal
    }
  },

  refreshAmendments: async () => {
    set({ amendmentsLoading: true });
    try {
      const res = await getXrplBridge().fetchAmendments();
      set({
        amendments: res.amendments,
        amendmentsSource: res.source,
        amendmentsLoading: false,
      });
    } catch {
      set({ amendmentsLoading: false });
    }
  },

  setWhaleThresholdXrp: (threshold) => {
    const clean = Math.max(100, Math.round(Number(threshold) || 100_000));
    try {
      localStorage.setItem(WHALE_THRESHOLD_STORAGE_KEY, String(clean));
    } catch {
      // ignore
    }
    set({ whaleThresholdXrp: clean });
  },

  setQuickStartOpen: (open) => set({ quickStartOpen: open }),

  dismissQuickStart: () => {
    try {
      localStorage.setItem(QUICKSTART_SEEN_KEY, '1');
    } catch {
      // ignore
    }
    set({ quickStartOpen: false });
  },

  refreshAllWalletBalances: async () => {
    const accounts = get().vaultStatus.accounts;
    if (accounts.length === 0) return;
    const bridge = getXrplBridge();
    const updates: Record<string, number> = {};
    await Promise.all(
      accounts.slice(0, 16).map(async (acct) => {
        try {
          const res = await bridge.rpcRequest('account_info', {
            account: acct.address,
            ledger_index: 'validated',
          });
          const data = (res.result as { account_data?: { Balance?: string } } | undefined)?.account_data;
          const drops = Number(data?.Balance ?? 0);
          updates[acct.address] = Number.isFinite(drops) ? Number((drops / 1_000_000).toFixed(6)) : 0;
        } catch {
          updates[acct.address] = 0;
        }
      })
    );
    set((s) => ({ walletBalancesMap: { ...s.walletBalancesMap, ...updates } }));
  },

  addSavedEndpoint: (label, wsUrl) =>
    set((s) => {
      const cleanUrl = wsUrl.trim();
      if (!cleanUrl) return s;
      const filtered = s.savedEndpoints.filter((e) => e.wsUrl !== cleanUrl);
      const next: SavedEndpointProfile[] = [
        {
          id: `ep-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          label: label.trim() || cleanUrl,
          wsUrl: cleanUrl,
          createdAt: Date.now(),
        },
        ...filtered,
      ];
      try {
        localStorage.setItem(SAVED_ENDPOINTS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return { savedEndpoints: next };
    }),

  removeSavedEndpoint: (id) =>
    set((s) => {
      const next = s.savedEndpoints.filter((e) => e.id !== id);
      try {
        localStorage.setItem(SAVED_ENDPOINTS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return { savedEndpoints: next };
    }),

  toggleSoundAlerts: () => set((s) => ({ soundAlertsEnabled: !s.soundAlertsEnabled })),
  togglePerfHud: () => set((s) => ({ showPerfHud: !s.showPerfHud })),
}));
