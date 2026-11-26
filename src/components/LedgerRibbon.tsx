import React, { useMemo } from 'react';
import { Box, Flame, Gauge } from 'lucide-react';
import { computeFeePressure, computeTrendingTokens } from '../shared/v020Utils';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

export const LedgerRibbon: React.FC = () => {
  const ledgers = useCommandStore((s) => s.ledgers);
  const transactions = useCommandStore((s) => s.transactions);
  const loadFactor = useCommandStore((s) => s.streamStatus.serverLoadFactor);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);

  const feePressure = useMemo(
    () => computeFeePressure(ledgers[0]?.feeBaseDrops ?? 10, loadFactor),
    [ledgers, loadFactor]
  );

  const trendingTokens = useMemo(() => computeTrendingTokens(transactions), [transactions]);

  return (
    <div className="hud-panel rounded-xl p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Box className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Validated Ledger Chain
          </span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            (Click any block to inspect)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
          {/* Live Fee Escalation & Load Gauge */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
              feePressure.level === 'high'
                ? 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                : feePressure.level === 'elevated'
                  ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                  : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
            }`}
            title="Live XRPL open-ledger fee pressure"
          >
            <Gauge className="w-3 h-3" />
            Fee: {feePressure.effectiveDrops}d ({feePressure.loadFactor}x • {feePressure.level.toUpperCase()})
          </span>

          {trendingTokens.length > 0 && (
            <div className="hidden md:flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-400" />
              <span className="text-slate-500">5m Hot:</span>
              {trendingTokens.slice(0, 3).map((tok) => (
                <button
                  key={tok.key}
                  type="button"
                  onClick={() => void inspectQuery(tok.issuer)}
                  className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-cyan-400/50 text-cyan-200"
                  title={`Inspect ${tok.currency} issuer (${tok.txCount} tx in 5m)`}
                >
                  {tok.currency} ({tok.txCount})
                </button>
              ))}
            </div>
          )}

          <span className="text-slate-400 tabular-nums">
            Buffer: {ledgers.length}
          </span>
        </div>
      </div>

      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {ledgers.length === 0 ? (
          <div className="text-xs font-mono text-slate-500 py-3 px-2">
            Awaiting next validated XRPL ledger close (~3.5s)...
          </div>
        ) : (
          ledgers.map((l, idx) => {
            const loadPct = Math.min(100, Math.round((l.txnCount / 160) * 100));
            return (
              <button
                key={l.ledgerIndex}
                type="button"
                onClick={() => void inspectQuery(String(l.ledgerIndex))}
                className={`shrink-0 w-[166px] text-left rounded-lg p-2.5 border transition-all hover:border-cyan-400/60 hover:bg-panelHi ${
                  idx === 0
                    ? 'bg-cyan-500/10 border-cyan-400/50 shadow-glowCyan'
                    : 'bg-slate-950/65 border-slate-800/90'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-white tabular-nums">
                    #{l.ledgerIndex.toLocaleString()}
                  </span>
                  <span className="font-mono text-[10px] text-emerald-300 tabular-nums">
                    {l.txnCount} tx
                  </span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                    style={{ width: `${Math.max(8, loadPct)}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>{shortenAddress(l.ledgerHash, 5, 4)}</span>
                  <span className="tabular-nums">
                    {l.closeDurationMs ? `${(l.closeDurationMs / 1000).toFixed(1)}s` : `${l.feeBaseDrops}d`}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
