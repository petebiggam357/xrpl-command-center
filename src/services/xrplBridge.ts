import { NETWORK_PRESETS } from '../shared/networks';
import type {
  ConsensusPhase,
  DesktopNotificationPayload,
  DidResolutionReport,
  DockerNodeStatus,
  InspectorResult,
  LedgerSnapshot,
  LiveTransaction,
  NetworkId,
  NodeConfigBundle,
  NodeConnectionConfig,
  NodeOpsSnapshot,
  OracleAggregateReport,
  PathFindQuote,
  SqliteAnalyticsSummary,
  StreamStatus,
  TokenOnLedgerReport,
  TokenRecord,
  TopologyNode,
  TrayAndUpdaterSettings,
  TxPreflightPreview,
  TxSubmitResult,
  ValidationPulse,
  ValidatorRecord,
  VaultStatus,
  WalletAccountPublic,
  WalletPortfolioSnapshot,
  WalletTxIntent,
  XrplDesktopApi,
} from '../shared/types';
import {
  decodeCurrencyCode,
  decodeIssuerRiskFlags,
  detectQueryKind,
  dropsToXrpNumber,
  dropsToXrpString,
  parseLiveTransactionEvent,
  rippleTimeToUnixMs,
} from '../shared/xrplCodec';

type Listener<T> = (payload: T) => void;

class BrowserFallbackBridge {
  private ws: WebSocket | null = null;
  private statusListeners = new Set<Listener<StreamStatus>>();
  private ledgerListeners = new Set<Listener<LedgerSnapshot>>();
  private txListeners = new Set<Listener<LiveTransaction>>();
  private valListeners = new Set<Listener<ValidationPulse>>();
  private phaseListeners = new Set<Listener<ConsensusPhase>>();
  private pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  private seq = 1;
  private watchAccounts: WalletAccountPublic[] = [];
  private status: StreamStatus = {
    connected: false,
    connecting: false,
    networkId: 'mainnet',
    endpoint: NETWORK_PRESETS.mainnet.endpoints[0],
    latencyMs: null,
    serverLoadFactor: 1,
    consensusPhase: 'open',
  };

  private emitStatus(patch: Partial<StreamStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const cb of this.statusListeners) cb({ ...this.status });
  }

  public async connectNetwork(networkId: NetworkId, customEndpoint?: string): Promise<StreamStatus> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    const url = customEndpoint?.trim() || NETWORK_PRESETS[networkId].endpoints[0];
    this.emitStatus({ connected: false, connecting: true, networkId, endpoint: url, error: undefined });

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.emitStatus({ connected: true, connecting: false, endpoint: url });
      ws.send(JSON.stringify({ id: 'sub1', command: 'subscribe', streams: ['ledger', 'transactions', 'transactions_proposed'] }));
      ws.send(JSON.stringify({ id: 'sub2', command: 'subscribe', streams: ['validations'] }));
      ws.send(JSON.stringify({ id: 'sub3', command: 'subscribe', streams: ['consensus'] }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data)) as Record<string, unknown>;
        if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
          const item = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.status === 'error') item.reject(new Error(String(msg.error_message ?? msg.error)));
          else item.resolve(msg);
          return;
        }
        if (msg.type === 'ledgerClosed') {
          const snap: LedgerSnapshot = {
            ledgerIndex: Number(msg.ledger_index ?? 0),
            ledgerHash: String(msg.ledger_hash ?? ''),
            ledgerTime: rippleTimeToUnixMs(typeof msg.ledger_time === 'number' ? msg.ledger_time : undefined),
            txnCount: Number(msg.txn_count ?? 0),
            feeBaseDrops: Number(msg.fee_base ?? 10),
            reserveBaseXrp: dropsToXrpNumber(msg.reserve_base as number | string | undefined) || 1,
            reserveIncXrp: dropsToXrpNumber(msg.reserve_inc as number | string | undefined) || 0.2,
            validatedLedgers: String(msg.validated_ledgers ?? ''),
          };
          for (const cb of this.ledgerListeners) cb(snap);
        } else if (msg.type === 'transaction') {
          const parsed = parseLiveTransactionEvent(msg);
          if (parsed) {
            for (const cb of this.txListeners) cb(parsed);
          }
        } else if (msg.type === 'validationReceived') {
          const val: ValidationPulse = {
            validationPublicKey: String(msg.validation_public_key ?? ''),
            ledgerHash: String(msg.ledger_hash ?? ''),
            ledgerIndex: Number(msg.ledger_index ?? 0),
            full: Boolean(msg.full),
            timestamp: Date.now(),
          };
          if (val.validationPublicKey) {
            for (const cb of this.valListeners) cb(val);
          }
        } else if (msg.type === 'consensusPhase') {
          const raw = String(msg.consensus ?? '').toLowerCase();
          const phase: ConsensusPhase =
            raw === 'open' || raw === 'establish' || raw === 'accepted' ? raw : 'unknown';
          this.emitStatus({ consensusPhase: phase });
          for (const cb of this.phaseListeners) cb(phase);
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => this.emitStatus({ error: 'WebSocket connection error' });
    ws.onclose = () => this.emitStatus({ connected: false, connecting: false });

    return { ...this.status };
  }

  public async getStreamStatus(): Promise<StreamStatus> {
    return { ...this.status };
  }

  public rpcRequest(command: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket disconnected'));
        return;
      }
      const id = this.seq++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, command, ...params }));
    });
  }

  public async fetchValidators(): Promise<{
    validators: ValidatorRecord[];
    topology: TopologyNode[];
    fetchedAt: number;
    source: string;
  }> {
    return { validators: [], topology: [], fetchedAt: Date.now(), source: 'browser-preview' };
  }

  public async fetchTokens(): Promise<{ tokens: TokenRecord[]; fetchedAt: number; source: string }> {
    return { tokens: [], fetchedAt: Date.now(), source: 'browser-preview' };
  }

  public async inspectTokenOnLedger(currencyRaw: string, issuer: string): Promise<TokenOnLedgerReport> {
    const acct = await this.rpcRequest('account_info', { account: issuer, ledger_index: 'validated' });
    const data = ((acct.result as Record<string, unknown>)?.account_data ?? {}) as Record<string, unknown>;
    return {
      currency: decodeCurrencyCode(currencyRaw),
      currencyRaw,
      issuer,
      fetchedAt: Date.now(),
      xrpBalance: dropsToXrpString(String(data.Balance ?? '0'), 2),
      flags: decodeIssuerRiskFlags(Number(data.Flags ?? 0)),
      bids: [],
      asks: [],
      amm: null,
    };
  }

  public async inspectQuery(query: string): Promise<InspectorResult> {
    const kind = detectQueryKind(query);
    if (kind === 'account') {
      const res = await this.rpcRequest('account_info', { account: query.trim(), ledger_index: 'validated' });
      const acct = ((res.result as Record<string, unknown>)?.account_data ?? {}) as Record<string, unknown>;
      return {
        kind: 'account',
        query,
        title: query.trim(),
        subtitle: 'XRPL AccountRoot',
        summary: [
          { label: 'XRP Balance', value: `${dropsToXrpString(String(acct.Balance ?? '0'), 4)} XRP`, tone: 'cyan' },
          { label: 'Sequence', value: String(acct.Sequence ?? '—') },
        ],
        flags: decodeIssuerRiskFlags(Number(acct.Flags ?? 0)),
        raw: res.result,
      };
    }
    return {
      kind: 'error',
      query,
      title: 'Desktop Mode Required for Full Indexing',
      subtitle: 'Run via Electron desktop app for complete multi-query inspection.',
      summary: [],
      raw: { query },
    };
  }

  public async walletGetStatus(): Promise<VaultStatus> {
    return {
      initialized: false,
      unlocked: false,
      osKeychainAvailable: false,
      accounts: this.watchAccounts,
    };
  }

  public async walletAddWatchOnly(
    label: string,
    address: string,
    isHardwareLedger?: boolean,
    derivationPath?: string
  ) {
    const acct: WalletAccountPublic = {
      id: `watch-${Date.now()}`,
      label: label || address.slice(0, 8),
      address: address.trim(),
      kind: isHardwareLedger ? 'hardware-ledger' : 'watch-only',
      derivationPath,
      createdAt: Date.now(),
    };
    this.watchAccounts = [acct, ...this.watchAccounts];
    return { ok: true, account: acct, status: await this.walletGetStatus() };
  }

  public async walletRemoveAccount(id: string): Promise<VaultStatus> {
    this.watchAccounts = this.watchAccounts.filter((a) => a.id !== id);
    return this.walletGetStatus();
  }

  public async walletFetchPortfolio(address: string): Promise<WalletPortfolioSnapshot> {
    try {
      const res = await this.rpcRequest('account_info', { account: address, ledger_index: 'validated' });
      const acct = ((res.result as Record<string, unknown>)?.account_data ?? {}) as Record<string, unknown>;
      const xrp = dropsToXrpNumber(String(acct.Balance ?? '0'));
      return {
        address,
        funded: true,
        fetchedAt: Date.now(),
        totalXrp: xrp,
        totalXrpDisplay: dropsToXrpString(String(acct.Balance ?? '0'), 4),
        baseReserveXrp: 1,
        ownerReserveXrp: Number(acct.OwnerCount ?? 0) * 0.2,
        spendableXrp: Math.max(0, xrp - 1 - Number(acct.OwnerCount ?? 0) * 0.2),
        sequence: Number(acct.Sequence ?? 0),
        ownerCount: Number(acct.OwnerCount ?? 0),
        flags: decodeIssuerRiskFlags(Number(acct.Flags ?? 0)),
        tokens: [],
        offers: [],
        escrows: [],
        checks: [],
        nfts: [],
        recentTransactions: [],
      };
    } catch (err) {
      return {
        address,
        funded: false,
        fetchedAt: Date.now(),
        totalXrp: 0,
        totalXrpDisplay: '0',
        baseReserveXrp: 1,
        ownerReserveXrp: 0,
        spendableXrp: 0,
        sequence: 0,
        ownerCount: 0,
        flags: decodeIssuerRiskFlags(0),
        tokens: [],
        offers: [],
        escrows: [],
        checks: [],
        nfts: [],
        recentTransactions: [],
        error: err instanceof Error ? err.message : 'Unable to fetch portfolio',
      };
    }
  }

  public onStreamStatus(cb: Listener<StreamStatus>): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }
  public onLedgerClosed(cb: Listener<LedgerSnapshot>): () => void {
    this.ledgerListeners.add(cb);
    return () => this.ledgerListeners.delete(cb);
  }
  public onTransaction(cb: Listener<LiveTransaction>): () => void {
    this.txListeners.add(cb);
    return () => this.txListeners.delete(cb);
  }
  public onValidation(cb: Listener<ValidationPulse>): () => void {
    this.valListeners.add(cb);
    return () => this.valListeners.delete(cb);
  }
  public onConsensusPhase(cb: Listener<ConsensusPhase>): () => void {
    this.phaseListeners.add(cb);
    return () => this.phaseListeners.delete(cb);
  }
}

let fallbackInstance: BrowserFallbackBridge | null = null;

export function getXrplBridge(): Omit<XrplDesktopApi, 'isElectron' | 'platform' | 'version'> & {
  isElectron: boolean;
  platform: string;
  version: string;
} {
  if (typeof window !== 'undefined' && window.xrplApi) {
    return window.xrplApi;
  }
  if (!fallbackInstance) {
    fallbackInstance = new BrowserFallbackBridge();
  }
  const fb = fallbackInstance;
  const desktopOnlyErr = async () => ({
    ok: false,
    error: 'This capability requires the desktop Electron app (.AppImage / .exe / .dmg).',
  });
  return {
    isElectron: false,
    platform: 'web-preview',
    version: '0.0.3-alpha',
    connectNetwork: (n, c) => fb.connectNetwork(n, c),
    getStreamStatus: () => fb.getStreamStatus(),
    rpcRequest: (cmd, params) => fb.rpcRequest(cmd, params),
    fetchValidators: () => fb.fetchValidators(),
    fetchTokens: () => fb.fetchTokens(),
    inspectTokenOnLedger: (c, i) => fb.inspectTokenOnLedger(c, i),
    inspectQuery: (q) => fb.inspectQuery(q),

    nodeOpsPoll: async (cfg: NodeConnectionConfig): Promise<NodeOpsSnapshot> => ({
      connected: false,
      endpoint: cfg.rpcUrl,
      checkedAt: Date.now(),
      error: 'Desktop Electron mode required.',
      peers: [],
      amendments: [],
      adminAvailable: false,
    }),
    nodeOpsAdminCommand: desktopOnlyErr,
    nodeOpsReadLogTail: async () => ({ ok: false, lines: [], error: 'Desktop Electron mode required.' }),
    dockerGetStatus: async (): Promise<DockerNodeStatus> => ({
      dockerInstalled: false,
      daemonRunning: false,
      containerExists: false,
      containerRunning: false,
      containerName: 'xrpl-command-node',
      storageRoot: '',
      configDir: '',
      dataDir: '',
      error: 'Desktop Electron mode required.',
    }),
    dockerChooseStorageFolder: desktopOnlyErr,
    dockerSetStorageFolder: desktopOnlyErr,
    dockerInspectStorage: async () => ({
      storageRoot: '',
      configDir: '',
      dataDir: '',
      isDefault: true,
      exists: false,
      writable: false,
      freeBytes: null,
      totalBytes: null,
      freeGb: null,
      totalGb: null,
      error: 'Desktop Electron mode required.',
    }),
    dockerProvisionNode: desktopOnlyErr,
    dockerLifecycleAction: desktopOnlyErr,
    dockerReadLogs: async () => ({ ok: false, lines: [], error: 'Desktop Electron mode required.' }),
    nodeConfigLoad: async (): Promise<NodeConfigBundle> => ({
      configDir: '',
      rippledCfgPath: '',
      validatorsTxtPath: '',
      rippledCfg: '',
      validatorsTxt: '',
      existsOnDisk: false,
    }),
    nodeConfigSaveWithBackup: desktopOnlyErr,

    walletGetStatus: () => fb.walletGetStatus(),
    walletSetupVault: desktopOnlyErr,
    walletUnlockVault: desktopOnlyErr,
    walletLockVault: () => fb.walletGetStatus(),
    walletCreate: desktopOnlyErr,
    walletImportSeed: desktopOnlyErr,
    walletAddWatchOnly: (l, a, hw, p) => fb.walletAddWatchOnly(l, a, hw, p),
    walletRemoveAccount: (id) => fb.walletRemoveAccount(id),
    walletFetchPortfolio: (a) => fb.walletFetchPortfolio(a),
    walletFundFaucet: desktopOnlyErr,
    walletPreflightTx: async (intent: WalletTxIntent): Promise<TxPreflightPreview> => ({
      ok: false,
      networkId: 'mainnet',
      endpoint: '',
      txJson: intent as unknown as Record<string, unknown>,
      feeDrops: '12',
      feeXrp: '0.000012',
      summaryLines: [],
      warnings: [],
      blockingError: 'Desktop Electron mode required.',
    }),
    walletSignAndSubmitTx: async (): Promise<TxSubmitResult> => ({
      ok: false,
      error: 'Desktop Electron mode required.',
    }),
    walletSubmitSignedBlob: desktopOnlyErr,
    walletSignMultisigPartial: desktopOnlyErr,
    walletCombineAndSubmitMultisig: desktopOnlyErr,
    dexFindBestPath: async (p): Promise<PathFindQuote> => ({
      ok: false,
      sourceAmountDisplay: '—',
      sendMaxSpec: p.destinationAsset,
      deliverMinSpec: p.destinationAsset,
      destinationAmountSpec: p.destinationAsset,
      hopsSummary: '',
      error: 'Desktop Electron mode required.',
    }),

    oracleQueryAggregate: async (p): Promise<OracleAggregateReport> => ({
      ok: false,
      baseAsset: p.baseAsset,
      quoteAsset: p.quoteAsset,
      error: 'Desktop Electron mode required.',
    }),
    didResolveAccount: async (address): Promise<DidResolutionReport> => ({
      ok: false,
      did: `did:xrpl:1:${address}`,
      address,
      error: 'Desktop Electron mode required.',
    }),

    analyticsGetSummary: async (): Promise<SqliteAnalyticsSummary> => ({
      dbPath: '',
      dbSizeBytes: 0,
      recordedLedgers: 0,
      recordedTxJournal: 0,
      avgTpsRecent: 0,
      avgFeeDropsRecent: 10,
      peakTxnLedger: null,
      recentJournal: [],
      ledgerSeries: [],
    }),
    analyticsExportCsv: desktopOnlyErr,
    systemGetTrayUpdaterState: async (): Promise<TrayAndUpdaterSettings> => ({
      minimizeToTray: false,
      nodeWatchdogEnabled: false,
      currentVersion: '0.1.1-beta',
      updateState: 'idle',
    }),
    systemUpdateTraySettings: async () => ({
      minimizeToTray: false,
      nodeWatchdogEnabled: false,
      currentVersion: '0.1.1-beta',
      updateState: 'idle',
    }),
    systemCheckForUpdates: async () => ({
      minimizeToTray: false,
      nodeWatchdogEnabled: false,
      currentVersion: '0.1.1-beta',
      updateState: 'idle',
    }),

    fetchMarketPrices: async () => ({
      xrpUsd: null,
      change24hPct: null,
      source: 'browser-preview',
      fetchedAt: Date.now(),
    }),
    fetchAmendments: async () => ({
      amendments: [],
      source: 'browser-preview',
      fetchedAt: Date.now(),
    }),
    decodeXAddress: async () => ({ ok: false, error: 'Desktop Electron mode required.' }),
    encodeXAddress: async () => ({ ok: false, error: 'Desktop Electron mode required.' }),
    walletExportBackup: desktopOnlyErr,
    walletImportBackup: desktopOnlyErr,

    notifyDesktop: (_p: DesktopNotificationPayload) => Promise.resolve(),
    onStreamStatus: (cb) => fb.onStreamStatus(cb),
    onLedgerClosed: (cb) => fb.onLedgerClosed(cb),
    onTransaction: (cb) => fb.onTransaction(cb),
    onValidation: (cb) => fb.onValidation(cb),
    onConsensusPhase: (cb) => fb.onConsensusPhase(cb),
  };
}
