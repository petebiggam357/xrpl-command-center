import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Layers, Radio } from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import {
  computeMempoolSummary,
  type FeeRpcMetrics,
  parseFeeRpcResponse,
} from '../shared/v024Utils';
import { formatCompactNumber, shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

export const MempoolRadarPanel: React.FC = () => {
  const transactions = useCommandStore((s) => s.transactions);
  const connected = useCommandStore((s) => s.streamStatus.connected);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);

  const [feeMetrics, setFeeMetrics] = useState<FeeRpcMetrics | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let alive = true;

    const pollFee = async () => {
      try {
        const res = await getXrplBridge().rpcRequest('fee', {});
        if (!alive) return;
        const parsed = parseFeeRpcResponse(res);
        if (parsed) setFeeMetrics(parsed);
      } catch {
        // ignore transient RPC errors
      }
    };

    void pollFee();
    const timer = setInterval(() => void pollFee(), 8_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [connected]);

  const summary = useMemo(
    () => computeMempoolSummary(transactions, feeMetrics),
    [transactions, feeMetrics]
  );

  const badgeClass =
    summary.pressureLevel === 'congested'
      ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
      : summary.pressureLevel === 'busy'
        ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
        : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300';

  return (
    <div className="hud-panel rounded-xl p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">
            Live Mempool &amp; Open-Ledger Fee Radar
          </span>
          <span className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase ${badgeClass}`}>
            {summary.pressureLevel}
          </span>
          {summary.pendingWhaleCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 border border-rose-400/50 text-[10px] font-mono text-rose-200">
              <AlertTriangle className="w-3 h-3" />
              {summary.pendingWhaleCount} Pending Whale{summary.pendingWhaleCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
          <span className="text-slate-300">
            Open Fee: <strong className="text-cyan-300 tabular-nums">{summary.openLedgerFeeDrops}d</strong>
          </span>
          <span className="text-slate-400 hidden sm:inline">
            Median: <strong className="text-slate-200 tabular-nums">{summary.medianFeeDrops}d</strong>
          </span>
          <span className="text-slate-400">
            Queue: <strong className="text-amber-300 tabular-nums">{summary.queueFillPct}%</strong>
          </span>
          <span className="text-slate-400">
            Pending: <strong className="text-white tabular-nums">{summary.pendingCount}</strong>
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-[10px] text-cyan-200 hover:border-cyan-400/50"
          >
            {expanded ? 'Hide Queue' : 'Inspect Pending'}
          </button>
        </div>
      </div>

      {/* Dual Progress Bars: Open Ledger Fill & Escalation Queue Fill */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 px-1 font-mono text-[10px]">
        <div className="space-y-1">
          <div className="flex justify-between text-slate-400">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-cyan-400" />
              Open Ledger Load ({feeMetrics ? `${feeMetrics.currentLedgerSize}/${feeMetrics.expectedLedgerSize}` : `${summary.pendingCount} tx`})
            </span>
            <span className="text-cyan-300 tabular-nums">{summary.ledgerFillPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
              style={{ width: `${Math.max(4, summary.ledgerFillPct)}%` }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-slate-400">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-amber-400" />
              Escalation Queue ({feeMetrics ? `${feeMetrics.currentQueueSize}/${feeMetrics.maxQueueSize}` : '0/0'})
            </span>
            <span className="text-amber-300 tabular-nums">
              {summary.pendingXrpVolume > 0 ? `${formatCompactNumber(summary.pendingXrpVolume)} XRP queued` : '0%'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                summary.queueFillPct >= 50
                  ? 'bg-rose-400'
                  : summary.queueFillPct >= 15
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.max(2, summary.queueFillPct)}%` }}
            />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="pt-2 border-t border-slate-800/80">
          {summary.topPending.length === 0 ? (
            <div className="text-[11px] font-mono text-slate-500 text-center py-2">
              No unvalidated transactions in local buffer right now (ledgers close every ~3.5s).
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
              {summary.topPending.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => void inspectQuery(tx.hash)}
                  className={`text-left p-2 rounded-lg border font-mono text-[11px] transition-colors ${
                    tx.isWhale
                      ? 'bg-rose-500/10 border-rose-400/40 hover:border-rose-300'
                      : 'bg-slate-950/75 border-slate-800 hover:border-cyan-400/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-amber-300 font-semibold truncate">{tx.txType}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{tx.feeDrops}d</span>
                  </div>
                  <div className="text-white font-bold truncate mt-0.5">{tx.amountDisplay}</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {shortenAddress(tx.account, 6, 4)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
