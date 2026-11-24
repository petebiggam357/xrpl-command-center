import React from 'react';
import { Box } from 'lucide-react';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

export const LedgerRibbon: React.FC = () => {
  const ledgers = useCommandStore((s) => s.ledgers);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);

  return (
    <div className="hud-panel rounded-xl p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Box className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Validated Ledger Chain
          </span>
          <span className="text-[11px] text-slate-500">
            (Click any block to inspect full ledger contents)
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
          Buffer: {ledgers.length} ledgers
        </span>
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
