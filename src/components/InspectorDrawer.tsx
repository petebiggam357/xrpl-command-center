import React, { useMemo, useState } from 'react';
import { BellPlus, BookPlus, Code2, Loader2, MessageSquareText, X } from 'lucide-react';
import { decodeXrplMemos, resolveAddressLabel } from '../shared/betaUtils';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

export const InspectorDrawer: React.FC = () => {
  const inspectorOpen = useCommandStore((s) => s.inspectorOpen);
  const inspectorLoading = useCommandStore((s) => s.inspectorLoading);
  const inspectorResult = useCommandStore((s) => s.inspectorResult);
  const closeInspector = useCommandStore((s) => s.closeInspector);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);
  const addWatchlistEntry = useCommandStore((s) => s.addWatchlistEntry);
  const addContact = useCommandStore((s) => s.addContact);
  const contacts = useCommandStore((s) => s.contacts);
  const vaultAccounts = useCommandStore((s) => s.vaultStatus.accounts);

  const [showRaw, setShowRaw] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const decodedMemos = useMemo(
    () => (inspectorResult?.kind === 'transaction' ? decodeXrplMemos(inspectorResult.raw) : []),
    [inspectorResult]
  );

  const resolvedLabel = useMemo(
    () =>
      inspectorResult?.kind === 'account'
        ? resolveAddressLabel(inspectorResult.query, contacts, vaultAccounts)
        : null,
    [inspectorResult, contacts, vaultAccounts]
  );

  if (!inspectorOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl bg-panel/98 backdrop-blur-xl border-l border-cyan-400/30 shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400">
            On-Ledger Deep Inspector
          </div>
          <h3 className="text-sm font-mono font-bold text-white truncate flex items-center gap-2">
            <span className="truncate">
              {inspectorLoading ? 'Querying XRPL Node…' : inspectorResult?.title ?? 'Inspector'}
            </span>
            {resolvedLabel && (
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-[10px] font-mono text-emerald-200">
                {resolvedLabel.label}
              </span>
            )}
          </h3>
          {inspectorResult?.subtitle && (
            <div className="text-[11px] font-mono text-slate-400 truncate">
              {inspectorResult.subtitle}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {inspectorResult?.kind === 'account' && (
            <>
              <button
                type="button"
                onClick={() => {
                  addContact({
                    label: inspectorResult.flags?.domain ?? shortenAddress(inspectorResult.query),
                    address: inspectorResult.query,
                    category: 'other',
                    requireTag: Boolean(inspectorResult.flags?.requireDestTag),
                  });
                  setSavedNotice('Saved to Address Book');
                  setTimeout(() => setSavedNotice(null), 2200);
                }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-xs font-mono text-emerald-200 hover:bg-emerald-500/25"
                title="Save account to Address Book"
              >
                <BookPlus className="w-3.5 h-3.5" />
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  addWatchlistEntry({
                    label: inspectorResult.flags?.domain ?? shortenAddress(inspectorResult.query),
                    type: 'account',
                    target: inspectorResult.query,
                    notifyOs: true,
                  });
                  setSavedNotice('Added to Watchlist');
                  setTimeout(() => setSavedNotice(null), 2200);
                }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-xs font-mono text-cyan-200 hover:bg-cyan-500/25"
              >
                <BellPlus className="w-3.5 h-3.5" />
                Watch
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className={`p-1.5 rounded-lg border ${
              showRaw
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle raw JSON"
          >
            <Code2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={closeInspector}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {savedNotice && (
          <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/40 px-3 py-1.5 text-xs font-mono text-emerald-200">
            {savedNotice}
          </div>
        )}
        {inspectorLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-cyan-300 font-mono text-xs gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            Fetching validated ledger state...
          </div>
        ) : inspectorResult ? (
          <>
            {inspectorResult.summary.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5">
                {inspectorResult.summary.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl bg-slate-950/80 border border-slate-800 p-2.5 font-mono"
                  >
                    <div className="text-[10px] uppercase text-slate-500">{item.label}</div>
                    <div
                      className={`text-xs font-semibold mt-0.5 break-all ${
                        item.tone === 'cyan'
                          ? 'text-cyan-300'
                          : item.tone === 'mint'
                            ? 'text-emerald-300'
                            : item.tone === 'amber'
                              ? 'text-amber-300'
                              : item.tone === 'rose'
                                ? 'text-rose-300'
                                : 'text-slate-200'
                      }`}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {decodedMemos.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-cyan-300">
                  <MessageSquareText className="w-3.5 h-3.5" />
                  Decoded UTF-8 Transaction Memos ({decodedMemos.length})
                </div>
                <div className="space-y-1.5">
                  {decodedMemos.map((m, i) => (
                    <div
                      key={i}
                      className="rounded-xl bg-cyan-500/5 border border-cyan-400/25 p-2.5 font-mono text-xs space-y-0.5"
                    >
                      {m.type && <div className="text-[10px] text-cyan-300">Type: {m.type}</div>}
                      {m.data && <div className="text-slate-100 break-words">{m.data}</div>}
                      {m.format && <div className="text-[10px] text-slate-500">Format: {m.format}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inspectorResult.flags && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase text-slate-400">AccountRoot Flags</div>
                <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
                    Blackholed: {inspectorResult.flags.blackholed ? 'YES' : 'NO'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
                    GlobalFreeze: {inspectorResult.flags.globalFreeze ? 'ON' : 'OFF'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
                    NoFreeze: {inspectorResult.flags.noFreeze ? 'ON' : 'OFF'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
                    Clawback: {inspectorResult.flags.allowClawback ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            )}

            {inspectorResult.trustlines && inspectorResult.trustlines.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">
                  TrustLines ({inspectorResult.trustlines.length})
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {inspectorResult.trustlines.map((tl, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-950/75 border border-slate-800 font-mono text-xs"
                    >
                      <div>
                        <span className="text-emerald-300 font-bold">{tl.currency}</span>
                        <button
                          type="button"
                          onClick={() => void inspectQuery(tl.account)}
                          className="ml-2 text-[10px] text-slate-400 hover:text-cyan-300"
                        >
                          {shortenAddress(tl.account, 6, 4)}
                        </button>
                      </div>
                      <span className="text-slate-200 tabular-nums">{tl.balance}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inspectorResult.transactions && inspectorResult.transactions.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">
                  Transactions ({inspectorResult.transactions.length})
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {inspectorResult.transactions.map((tx) => (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => void inspectQuery(tx.hash)}
                      className="w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-950/75 border border-slate-800 hover:border-cyan-400/50 font-mono text-xs"
                    >
                      <span className="text-slate-200">{tx.txType}</span>
                      <span className="text-cyan-300 tabular-nums">{tx.amountDisplay}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showRaw && (
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">Raw JSON</div>
                <pre className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-[11px] font-mono text-cyan-100 overflow-x-auto max-h-80">
                  {JSON.stringify(inspectorResult.raw, null, 2)}
                </pre>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};
