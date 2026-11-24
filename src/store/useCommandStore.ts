import { create } from 'zustand';
import type {
  ConsensusPhase,
  InspectorResult,
  LedgerSnapshot,
  LiveTransaction,
  NetworkId,
  NodeConnectionConfig,
  NodeOpsSnapshot,
  StreamStatus,
  TokenOnLedgerReport,
  TokenRecord,
  TopologyNode,
  TxCategory,
  ValidationPulse,
  ValidatorRecord,
  WatchlistEntry,
} from '../shared/types';
import { getXrplBridge } from '../services/xrplBridge';

export type NavTab = 'command' | 'globe' | 'validators' | 'tokens' | 'nodeops';

const MAX_LEDGERS = 36;
const MAX_TX_FEED = 180;
const MAX_PULSES = 90;

const WATCHLIST_STORAGE_KEY = 'xrpl-cc-watchlist-v1';
const NODE_CONFIG_STORAGE_KEY = 'xrpl-cc-nodeops-v1';

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

  // Actions
  setActiveTab: (tab: NavTab) => void;
  togglePaused: () => void;
  toggleReducedMotion: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  connectNetwork: (networkId: NetworkId, customEndpoint?: string) => Promise<void>;
  ingestStreamStatus: (status: StreamStatus) => void;
  ingestLedger: (ledger: LedgerSnapshot) => void;
  ingestTransaction: (tx: LiveTransaction) => void;
  ingestValidation: (pulse: ValidationPulse) => void;
  ingestConsensusPhase: (phase: ConsensusPhase) => void;
  refreshValidators: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  selectToken: (token: TokenRecord | null) => Promise<void>;
  inspectQuery: (query: string) => Promise<void>;
  inspectLiveTransaction: (tx: LiveTransaction) => void;
  closeInspector: () => void;
  updateNodeConfig: (patch: Partial<NodeConnectionConfig>) => void;
  setNodeAutoPoll: (enabled: boolean) => void;
  pollOwnNode: () => Promise<void>;
  refreshNodeLogs: () => Promise<void>;
  addWatchlistEntry: (entry: Omit<WatchlistEntry, 'id' | 'createdAt'>) => void;
  removeWatchlistEntry: (id: string) => void;
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

  nodeConfig: loadSavedNodeConfig(),
  nodeSnapshot: null,
  nodePolling: false,
  nodeAutoPoll: false,
  nodeLogs: [],
  nodeLogsError: undefined,

  watchlist: loadSavedWatchlist(),
  alerts: [],

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
    const state = get();
    const now = Date.now();
    const cutoff = now - 10_000;

    // Watchlist matching even when UI stream is paused
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
          set((s) => ({
            alerts: [{ id: `${tx.id}-${now}`, title, detail, timestamp: now }, ...s.alerts].slice(0, 25),
          }));
          if (item.notifyOs) {
            void getXrplBridge().notifyDesktop({ title, body: detail });
          }
        }
      }
    }

    set((s) => {
      const recentTs = [...s.txTimestamps10s.filter((t) => t >= cutoff), now];
      const tps = Number((recentTs.length / 10).toFixed(1));
      const nextCounts = {
        ...s.txCategoryCounts,
        [tx.category]: (s.txCategoryCounts[tx.category] ?? 0) + 1,
      };

      // Live discovery of non-XRP tokens seen on stream
      let nextTokens = s.tokens;
      if (tx.currency && tx.currency !== 'XRP' && tx.issuer) {
        const exists = s.tokens.some((t) => t.issuer === tx.issuer && t.currency === tx.currency);
        if (!exists && s.tokens.length < 240) {
          nextTokens = [
            {
              id: `${tx.currency}:${tx.issuer}`,
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
            },
            ...s.tokens,
          ];
        }
      }

      if (s.paused) {
        return {
          txTimestamps10s: recentTs,
          tpsEstimate: tps,
          txCategoryCounts: nextCounts,
          totalProcessedTxs: s.totalProcessedTxs + 1,
          tokens: nextTokens,
        };
      }

      return {
        transactions: [tx, ...s.transactions].slice(0, MAX_TX_FEED),
        txTimestamps10s: recentTs,
        tpsEstimate: tps,
        txCategoryCounts: nextCounts,
        totalProcessedTxs: s.totalProcessedTxs + 1,
        tokens: nextTokens,
      };
    });
  },

  ingestValidation: (pulse) =>
    set((s) => ({
      recentValidations: [pulse, ...s.recentValidations].slice(0, MAX_PULSES),
      validatorLastSeen: {
        ...s.validatorLastSeen,
        [pulse.validationPublicKey]: pulse.timestamp,
      },
      currentLedgerValidators: {
        ...s.currentLedgerValidators,
        [pulse.validationPublicKey]: true,
      },
    })),

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
}));
