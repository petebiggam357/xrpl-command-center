import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  History,
  Play,
  RefreshCw,
  Rewind,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import { RPC_PLAYGROUND_PRESETS, validateRpcJsonParams } from '../shared/v023Utils';
import {
  dropsToXrpString,
  rippleTimeToUnixMs,
  shortenAddress,
} from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

interface RpcHistoryEntry {
  id: string;
  command: string;
  paramsJson: string;
  ok: boolean;
  latencyMs: number;
  executedAt: number;
}

interface HistoricalLedgerTx {
  hash: string;
  txType: string;
  account: string;
  destination?: string;
  feeDrops: string;
  result: string;
}

interface HistoricalLedgerView {
  ledgerIndex: number;
  ledgerHash: string;
  parentHash: string;
  closeTimeIso: string;
  totalCoinsXrp: string;
  txnCount: number;
  validated: boolean;
  transactions: HistoricalLedgerTx[];
}

const RPC_HISTORY_STORAGE_KEY = 'xrpl-cc-rpc-history-v1';

function loadRpcHistory(): RpcHistoryEntry[] {
  try {
    const raw = localStorage.getItem(RPC_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RpcHistoryEntry[]).slice(0, 15) : [];
  } catch {
    return [];
  }
}

export const DevRpcDeck: React.FC = () => {
  const streamStatus = useCommandStore((s) => s.streamStatus);
  const latestLedger = useCommandStore((s) => s.ledgers[0]);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);
  const vaultAccounts = useCommandStore((s) => s.vaultStatus.accounts);
  const selectedWalletId = useCommandStore((s) => s.selectedWalletId);
  const activeWallet = vaultAccounts.find((a) => a.id === selectedWalletId) ?? vaultAccounts[0] ?? null;

  const [mode, setMode] = useState<'rpc' | 'timemachine'>('rpc');

  // JSON-RPC Playground state
  const [command, setCommand] = useState<string>(RPC_PLAYGROUND_PRESETS[0].command);
  const [paramsText, setParamsText] = useState<string>(
    JSON.stringify(RPC_PLAYGROUND_PRESETS[0].params, null, 2)
  );
  const [rpcLoading, setRpcLoading] = useState(false);
  const [rpcOutput, setRpcOutput] = useState<string>('');
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [rpcLatencyMs, setRpcLatencyMs] = useState<number | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [history, setHistory] = useState<RpcHistoryEntry[]>(() => loadRpcHistory());

  // Ledger Time Machine state
  const [targetLedgerInput, setTargetLedgerInput] = useState<string>(
    latestLedger?.ledgerIndex ? String(latestLedger.ledgerIndex) : ''
  );
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerView, setLedgerView] = useState<HistoricalLedgerView | null>(null);
  const [ledgerTxFilter, setLedgerTxFilter] = useState('');

  useEffect(() => {
    if (!targetLedgerInput && latestLedger?.ledgerIndex) {
      setTargetLedgerInput(String(latestLedger.ledgerIndex));
    }
  }, [latestLedger?.ledgerIndex, targetLedgerInput]);

  const saveHistory = (next: RpcHistoryEntry[]) => {
    const trimmed = next.slice(0, 15);
    setHistory(trimmed);
    try {
      localStorage.setItem(RPC_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore storage quota
    }
  };

  const applyPreset = (presetId: string) => {
    const found = RPC_PLAYGROUND_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setCommand(found.command);
    setParamsText(JSON.stringify(found.params, null, 2));
    setRpcError(null);
  };

  const executeRpc = async (overrideCmd?: string, overrideParamsText?: string) => {
    const cmd = (overrideCmd ?? command).trim();
    const rawJson = overrideParamsText ?? paramsText;
    if (!cmd) {
      setRpcError('Enter an XRPL WebSocket / JSON-RPC command (e.g. server_info, fee, account_info).');
      return;
    }
    const validated = validateRpcJsonParams(rawJson);
    if (!validated.ok) {
      setRpcError(validated.error);
      return;
    }

    setRpcLoading(true);
    setRpcError(null);
    const t0 = performance.now();
    try {
      const res = await getXrplBridge().rpcRequest(cmd, validated.params);
      const elapsed = Math.round(performance.now() - t0);
      setRpcLatencyMs(elapsed);
      if (res.status === 'error') {
        const msg = String(res.error_message ?? res.error ?? 'XRPL RPC error');
        setRpcError(msg);
        setRpcOutput('');
        saveHistory([
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            command: cmd,
            paramsJson: rawJson,
            ok: false,
            latencyMs: elapsed,
            executedAt: Date.now(),
          },
          ...history,
        ]);
        return;
      }
      setRpcOutput(JSON.stringify(res, null, 2));
      saveHistory([
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          command: cmd,
          paramsJson: JSON.stringify(validated.params, null, 2),
          ok: true,
          latencyMs: elapsed,
          executedAt: Date.now(),
        },
        ...history,
      ]);
    } catch (err) {
      const elapsed = Math.round(performance.now() - t0);
      setRpcLatencyMs(elapsed);
      const msg = err instanceof Error ? err.message : String(err);
      setRpcError(msg);
      setRpcOutput('');
      saveHistory([
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          command: cmd,
          paramsJson: rawJson,
          ok: false,
          latencyMs: elapsed,
          executedAt: Date.now(),
        },
        ...history,
      ]);
    } finally {
      setRpcLoading(false);
    }
  };

  const fetchHistoricalLedger = async (seqOverride?: number) => {
    const seq = seqOverride ?? Number(targetLedgerInput.trim());
    if (!Number.isInteger(seq) || seq < 1) {
      setLedgerError('Enter a valid positive ledger index (e.g. 92000000).');
      return;
    }
    setTargetLedgerInput(String(seq));
    setLedgerLoading(true);
    setLedgerError(null);

    try {
      const res = await getXrplBridge().rpcRequest('ledger', {
        ledger_index: seq,
        transactions: true,
        expand: true,
      });
      if (res.status === 'error') {
        setLedgerError(String(res.error_message ?? res.error ?? 'Unable to load historical ledger'));
        setLedgerView(null);
        return;
      }
      const result = (res.result ?? res) as Record<string, unknown>;
      const ledger = (result.ledger ?? {}) as Record<string, unknown>;
      const rawTxs = Array.isArray(ledger.transactions) ? ledger.transactions : [];

      const transactions: HistoricalLedgerTx[] = rawTxs.map((item) => {
        const obj = (item ?? {}) as Record<string, unknown>;
        const meta = (obj.metaData ?? obj.meta ?? {}) as Record<string, unknown>;
        return {
          hash: String(obj.hash ?? ''),
          txType: String(obj.TransactionType ?? 'Unknown'),
          account: String(obj.Account ?? '—'),
          destination: typeof obj.Destination === 'string' ? obj.Destination : undefined,
          feeDrops: String(obj.Fee ?? '0'),
          result: String(meta.TransactionResult ?? 'tesSUCCESS'),
        };
      });

      const closeUnixMs = rippleTimeToUnixMs(
        typeof ledger.close_time === 'number' ? ledger.close_time : undefined
      );

      setLedgerView({
        ledgerIndex: Number(ledger.ledger_index ?? result.ledger_index ?? seq),
        ledgerHash: String(ledger.ledger_hash ?? result.ledger_hash ?? '—'),
        parentHash: String(ledger.parent_hash ?? '—'),
        closeTimeIso: new Date(closeUnixMs).toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
        totalCoinsXrp: dropsToXrpString(String(ledger.total_coins ?? '0'), 2),
        txnCount: transactions.length,
        validated: Boolean(result.validated ?? true),
        transactions,
      });
    } catch (err) {
      setLedgerError(err instanceof Error ? err.message : String(err));
      setLedgerView(null);
    } finally {
      setLedgerLoading(false);
    }
  };

  const stepLedger = (delta: number) => {
    const base = Number(targetLedgerInput) || latestLedger?.ledgerIndex || 0;
    if (base <= 0) return;
    const next = Math.max(1, base + delta);
    void fetchHistoricalLedger(next);
  };

  const handleCopyJson = () => {
    if (!rpcOutput) return;
    void navigator.clipboard.writeText(rpcOutput);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1500);
  };

  const filteredLedgerTxs = (ledgerView?.transactions ?? []).filter((tx) => {
    const q = ledgerTxFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      tx.txType.toLowerCase().includes(q) ||
      tx.account.toLowerCase().includes(q) ||
      (tx.destination ?? '').toLowerCase().includes(q) ||
      tx.hash.toLowerCase().includes(q) ||
      tx.result.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="hud-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">
              XRPL Developer RPC Console &amp; Ledger Time Machine
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Execute raw rippled WebSocket JSON-RPC commands on{' '}
            <span className="font-mono text-cyan-300">{streamStatus.endpoint}</span> or step backward through validated
            historical ledgers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('rpc')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
              mode === 'rpc'
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            JSON-RPC Playground
          </button>
          <button
            type="button"
            onClick={() => setMode('timemachine')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
              mode === 'timemachine'
                ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Rewind className="w-3.5 h-3.5" />
            Ledger Time Machine
          </button>
        </div>
      </div>

      {mode === 'rpc' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Left: Presets + Request Editor + History */}
          <div className="xl:col-span-5 space-y-4">
            <div className="hud-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-slate-400">
                  1-Click XRPL RPC Presets
                </div>
                {activeWallet && (
                  <button
                    type="button"
                    onClick={() => {
                      const validated = validateRpcJsonParams(paramsText);
                      const cur = validated.ok ? { ...validated.params } : {};
                      if ('account_root' in cur) cur.account_root = activeWallet.address;
                      else cur.account = activeWallet.address;
                      setParamsText(JSON.stringify(cur, null, 2));
                    }}
                    className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-[10px] font-mono text-emerald-200 hover:bg-emerald-500/25"
                    title={`Inject ${activeWallet.label} (${activeWallet.address}) into JSON params`}
                  >
                    Use Active Wallet
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {RPC_PLAYGROUND_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    title={p.description}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors ${
                      command === p.command
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-cyan-400/40'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="block text-[10px] font-mono uppercase text-slate-400">
                  RPC Command
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="e.g. account_objects, amm_info, book_offers"
                    className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    disabled={rpcLoading}
                    onClick={() => void executeRpc()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50"
                  >
                    {rpcLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Run
                  </button>
                </div>

                <label className="block text-[10px] font-mono uppercase text-slate-400 pt-1">
                  JSON Parameters (Ctrl+Enter to execute)
                </label>
                <textarea
                  rows={9}
                  value={paramsText}
                  onChange={(e) => setParamsText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void executeRpc();
                    }
                  }}
                  spellCheck={false}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 p-3 text-xs font-mono text-emerald-200 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {rpcError && (
                <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-400/40 text-xs font-mono text-rose-200">
                  {rpcError}
                </div>
              )}
            </div>

            {/* Saved Query History */}
            <div className="hud-panel rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.15em] text-slate-400">
                  <History className="w-3.5 h-3.5 text-cyan-400" />
                  Query History ({history.length})
                </div>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => saveHistory([])}
                    className="flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-rose-300"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="text-xs font-mono text-slate-500 py-4 text-center">
                  Run any RPC query above to save it to local history.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setCommand(item.command);
                        setParamsText(item.paramsJson);
                        void executeRpc(item.command, item.paramsJson);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-950/75 border border-slate-800 hover:border-cyan-400/40 text-left font-mono text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              item.ok ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                          <span className="text-white font-semibold truncate">{item.command}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">
                          {new Date(item.executedAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <span className="text-[10px] text-cyan-300 shrink-0">{item.latencyMs} ms</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Formatted JSON Response */}
          <div className="xl:col-span-7 hud-panel rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="uppercase tracking-[0.15em] text-cyan-300">Response Payload</span>
                {rpcLatencyMs !== null && (
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-emerald-300">
                    {rpcLatencyMs} ms
                  </span>
                )}
              </div>
              {rpcOutput && (
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-200 hover:border-cyan-400/50"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy JSON
                    </>
                  )}
                </button>
              )}
            </div>

            {rpcOutput ? (
              <pre className="flex-1 overflow-auto max-h-[640px] rounded-lg bg-slate-950 border border-slate-800 p-3 text-[11px] font-mono text-cyan-100 leading-relaxed whitespace-pre-wrap break-all">
                {rpcOutput}
              </pre>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-24 text-center text-slate-500 font-mono text-xs">
                <Terminal className="w-8 h-8 mb-2 opacity-40" />
                Select a preset or type any XRPL rippled command and click Run.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* LEDGER TIME MACHINE */
        <div className="space-y-4">
          <div className="hud-panel rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <Clock className="w-4 h-4 text-violet-400 shrink-0" />
                <input
                  type="number"
                  min={1}
                  value={targetLedgerInput}
                  onChange={(e) => setTargetLedgerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void fetchHistoricalLedger();
                  }}
                  placeholder="Enter Ledger Index (e.g. 92000000)"
                  className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-violet-400"
                />
                <button
                  type="button"
                  disabled={ledgerLoading}
                  onClick={() => void fetchHistoricalLedger()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-violet-500/20 border border-violet-400/50 text-xs font-mono font-semibold text-violet-200 hover:bg-violet-500/30"
                >
                  {ledgerLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Load Ledger'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                {[-1000, -100, -10, -1, 1, 10].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => stepLedger(delta)}
                    className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:border-violet-400/50 hover:text-violet-200"
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
                {latestLedger?.ledgerIndex && (
                  <button
                    type="button"
                    onClick={() => void fetchHistoricalLedger(latestLedger.ledgerIndex)}
                    className="px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-400/40 text-cyan-200"
                  >
                    Latest #{latestLedger.ledgerIndex.toLocaleString()}
                  </button>
                )}
              </div>
            </div>

            {ledgerError && (
              <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-400/40 text-xs font-mono text-rose-200">
                {ledgerError}
              </div>
            )}
          </div>

          {ledgerView ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
                <div className="hud-panel rounded-xl p-3">
                  <div className="text-[10px] uppercase text-slate-500">Ledger Index</div>
                  <div className="text-base font-bold text-violet-300 tabular-nums mt-0.5">
                    #{ledgerView.ledgerIndex.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-300">
                    {ledgerView.validated ? 'Validated' : 'Closed'}
                  </div>
                </div>
                <div className="hud-panel rounded-xl p-3">
                  <div className="text-[10px] uppercase text-slate-500">Close Time</div>
                  <div className="text-xs font-bold text-white mt-1">{ledgerView.closeTimeIso}</div>
                  <div className="text-[10px] text-slate-500 truncate" title={ledgerView.ledgerHash}>
                    Hash: {shortenAddress(ledgerView.ledgerHash, 10, 8)}
                  </div>
                </div>
                <div className="hud-panel rounded-xl p-3">
                  <div className="text-[10px] uppercase text-slate-500">Transactions</div>
                  <div className="text-base font-bold text-cyan-300 tabular-nums mt-0.5">
                    {ledgerView.txnCount}
                  </div>
                  <div className="text-[10px] text-slate-500">Click any row to inspect</div>
                </div>
                <div className="hud-panel rounded-xl p-3">
                  <div className="text-[10px] uppercase text-slate-500">Total XRP Supply</div>
                  <div className="text-sm font-bold text-emerald-300 tabular-nums mt-1">
                    {ledgerView.totalCoinsXrp} XRP
                  </div>
                  <div className="text-[10px] text-slate-500">After historical fee burn</div>
                </div>
              </div>

              <div className="hud-panel rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-300">
                    Historical Ledger Transactions ({filteredLedgerTxs.length})
                  </div>
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      value={ledgerTxFilter}
                      onChange={(e) => setLedgerTxFilter(e.target.value)}
                      placeholder="Filter tx type, address, hash…"
                      className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-violet-400"
                    />
                  </div>
                </div>

                <div className="overflow-auto max-h-[460px]">
                  <table className="w-full text-left border-collapse font-mono text-xs">
                    <thead className="sticky top-0 bg-panel text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-2">Type</th>
                        <th className="py-2 px-2">Account</th>
                        <th className="py-2 px-2">Destination</th>
                        <th className="py-2 px-2 text-right">Fee (drops)</th>
                        <th className="py-2 px-2 text-right">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredLedgerTxs.map((tx) => (
                        <tr
                          key={tx.hash || `${tx.account}-${tx.txType}`}
                          onClick={() => tx.hash && void inspectQuery(tx.hash)}
                          className="cursor-pointer hover:bg-violet-500/10 transition-colors"
                        >
                          <td className="py-2 px-2 text-cyan-300 font-semibold">{tx.txType}</td>
                          <td className="py-2 px-2 text-slate-200">{shortenAddress(tx.account, 8, 6)}</td>
                          <td className="py-2 px-2 text-slate-400">
                            {tx.destination ? shortenAddress(tx.destination, 8, 6) : '—'}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-slate-300">{tx.feeDrops}</td>
                          <td
                            className={`py-2 px-2 text-right ${
                              tx.result === 'tesSUCCESS' ? 'text-emerald-300' : 'text-amber-300'
                            }`}
                          >
                            {tx.result}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="hud-panel rounded-xl p-12 text-center font-mono text-xs text-slate-500">
              Enter any validated ledger index above (or click Latest) to inspect historical transactions and fee burn.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
