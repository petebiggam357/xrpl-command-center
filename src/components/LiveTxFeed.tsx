import React, { useMemo, useState } from 'react';
import { Flame, Waves } from 'lucide-react';
import { TX_CATEGORY_META } from '../shared/networks';
import type { TxCategory } from '../shared/types';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

const FILTER_OPTIONS: Array<{ id: 'all' | TxCategory; label: string }> = [
  { id: 'all', label: 'All Flow' },
  { id: 'payment', label: 'XRP' },
  { id: 'token', label: 'Tokens' },
  { id: 'dex', label: 'DEX' },
  { id: 'amm', label: 'AMM' },
  { id: 'nft', label: 'NFT' },
  { id: 'trust', label: 'Trust' },
];

export const LiveTxFeed: React.FC = React.memo(() => {
  const transactions = useCommandStore((s) => s.transactions);
  const txCategoryCounts = useCommandStore((s) => s.txCategoryCounts);
  const inspectLiveTransaction = useCommandStore((s) => s.inspectLiveTransaction);
  const [filter, setFilter] = useState<'all' | TxCategory>('all');

  const visible = useMemo(() => {
    if (filter === 'all') return transactions.slice(0, 45);
    return transactions.filter((t) => t.category === filter).slice(0, 45);
  }, [transactions, filter]);

  return (
    <div className="hud-panel rounded-xl p-4 flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Waves className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Live Decoded Transaction Tape
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_OPTIONS.map((opt) => {
            const count = opt.id === 'all' ? undefined : txCategoryCounts[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono border transition-colors ${
                  filter === opt.id
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
                {count !== undefined && count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-auto max-h-[300px]">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead className="sticky top-0 bg-panel text-[10px] uppercase text-slate-500 border-b border-slate-800">
            <tr>
              <th className="py-1.5 px-2">Type</th>
              <th className="py-1.5 px-2">Amount / Asset</th>
              <th className="py-1.5 px-2">Account → Destination</th>
              <th className="py-1.5 px-2 text-right">Fee</th>
              <th className="py-1.5 px-2 text-right">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  Listening to live XRPL transaction streams...
                </td>
              </tr>
            ) : (
              visible.map((tx) => {
                const meta = TX_CATEGORY_META[tx.category] ?? TX_CATEGORY_META.system;
                return (
                  <tr
                    key={tx.id}
                    onClick={() => inspectLiveTransaction(tx)}
                    className="cursor-pointer hover:bg-slate-900/70 transition-colors"
                  >
                    <td className="py-1.5 px-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="text-slate-200">{tx.txType}</span>
                        {tx.isWhale && (
                          <Flame className="w-3.5 h-3.5 text-amber-400" aria-label="Whale transfer" />
                        )}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-cyan-200 font-semibold tabular-nums">
                      {tx.amountDisplay}
                    </td>
                    <td className="py-1.5 px-2 text-slate-400">
                      {shortenAddress(tx.account, 6, 4)}
                      {tx.destination ? ` → ${shortenAddress(tx.destination, 6, 4)}` : ''}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-400 tabular-nums">
                      {tx.feeDrops}d
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          tx.validated
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-cyan-500/15 text-cyan-300'
                        }`}
                      >
                        {tx.validated ? tx.engineResult ?? 'VALIDATED' : 'PROPOSED'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
