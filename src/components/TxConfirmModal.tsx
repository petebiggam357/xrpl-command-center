import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Code2,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import { useCommandStore } from '../store/useCommandStore';

export const TxConfirmModal: React.FC = () => {
  const pendingTxIntent = useCommandStore((s) => s.pendingTxIntent);
  const pendingTxPreview = useCommandStore((s) => s.pendingTxPreview);
  const pendingTxLoading = useCommandStore((s) => s.pendingTxLoading);
  const txSubmitting = useCommandStore((s) => s.txSubmitting);
  const lastTxResult = useCommandStore((s) => s.lastTxResult);
  const vaultStatus = useCommandStore((s) => s.vaultStatus);
  const confirmAndSignPendingTx = useCommandStore((s) => s.confirmAndSignPendingTx);
  const closeTxConfirmModal = useCommandStore((s) => s.closeTxConfirmModal);
  const refreshVaultStatus = useCommandStore((s) => s.refreshVaultStatus);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);

  const [showRawJson, setShowRawJson] = useState(false);
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  if (!pendingTxIntent) return null;

  const isMainnet = pendingTxPreview?.networkId === 'mainnet';

  const handleInlineUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    const res = await getXrplBridge().walletUnlockVault(unlockPassphrase);
    if (!res.ok) {
      setUnlockError(res.error ?? 'Incorrect passphrase');
    } else {
      setUnlockPassphrase('');
      await refreshVaultStatus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="hud-panel rounded-2xl max-w-lg w-full border border-cyan-400/40 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between ${
            isMainnet
              ? 'bg-rose-950/45 border-rose-500/40'
              : 'bg-slate-950/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isMainnet ? (
              <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            <div>
              <h3 className="text-sm font-bold text-white">
                Review &amp; Sign XRPL Transaction
              </h3>
              <div className="text-[11px] font-mono">
                <span className={isMainnet ? 'text-rose-300 font-semibold' : 'text-emerald-300'}>
                  {(pendingTxPreview?.networkId ?? 'NETWORK').toUpperCase()}
                </span>
                {pendingTxPreview?.endpoint && (
                  <span className="text-slate-400"> • {pendingTxPreview.endpoint}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowRawJson((v) => !v)}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
              title="Toggle unsigned tx_json preview"
            >
              <Code2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={closeTxConfirmModal}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {pendingTxLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 font-mono text-xs text-cyan-300">
              <Loader2 className="w-6 h-6 animate-spin" />
              Running pre-flight account, reserve &amp; Destination Tag safety checks...
            </div>
          ) : lastTxResult ? (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl border ${
                  lastTxResult.ok
                    ? 'bg-emerald-950/35 border-emerald-500/40'
                    : 'bg-rose-950/35 border-rose-500/40'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm">
                  {lastTxResult.ok ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertOctagon className="w-5 h-5 text-rose-400" />
                  )}
                  <span className={lastTxResult.ok ? 'text-emerald-200' : 'text-rose-200'}>
                    {lastTxResult.ok
                      ? lastTxResult.validated
                        ? 'Transaction Validated On-Ledger'
                        : 'Transaction Submitted to Open Ledger'
                      : 'Transaction Rejected'}
                  </span>
                </div>
                <div className="mt-2 space-y-1 font-mono text-xs text-slate-300">
                  {lastTxResult.engineResult && (
                    <div>
                      Engine Result:{' '}
                      <span className="text-cyan-300 font-semibold">{lastTxResult.engineResult}</span>
                    </div>
                  )}
                  {lastTxResult.ledgerIndex && (
                    <div>Ledger: #{lastTxResult.ledgerIndex.toLocaleString()}</div>
                  )}
                  {lastTxResult.error && <div className="text-rose-300">{lastTxResult.error}</div>}
                  {lastTxResult.hash && (
                    <div className="pt-2 break-all text-[11px] text-slate-400">
                      Hash: {lastTxResult.hash}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                {lastTxResult.hash && (
                  <button
                    type="button"
                    onClick={() => {
                      const h = lastTxResult.hash!;
                      closeTxConfirmModal();
                      void inspectQuery(h);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Inspect Tx On-Ledger
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeTxConfirmModal}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 text-xs font-mono text-white hover:bg-slate-700"
                >
                  Done
                </button>
              </div>
            </div>
          ) : pendingTxPreview ? (
            <>
              {/* Blocking Safety Error */}
              {pendingTxPreview.blockingError && (
                <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/50 flex items-start gap-2.5 text-xs text-rose-200">
                  <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold uppercase text-[11px] text-rose-300 mb-0.5">
                      Blocked by Pre-Flight Safety Check
                    </div>
                    {pendingTxPreview.blockingError}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {pendingTxPreview.warnings.map((w, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-amber-950/35 border border-amber-500/40 flex items-start gap-2 text-xs text-amber-100"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}

              {/* Summary Table */}
              <div className="rounded-xl bg-slate-950/85 border border-slate-800 divide-y divide-slate-800/80 font-mono text-xs">
                {pendingTxPreview.summaryLines.map((line, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2">
                    <span className="text-slate-400">{line.label}</span>
                    <span className="text-white font-semibold text-right break-all">{line.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <span className="text-slate-400">Network Fee (Burned)</span>
                  <span className="text-cyan-300 tabular-nums">
                    {pendingTxPreview.feeXrp} XRP ({pendingTxPreview.feeDrops} drops)
                  </span>
                </div>
              </div>

              {/* Raw tx_json preview */}
              {showRawJson && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
                    Unsigned Canonical tx_json
                  </div>
                  <pre className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-[11px] font-mono text-cyan-200 overflow-x-auto max-h-48">
                    {JSON.stringify(pendingTxPreview.txJson, null, 2)}
                  </pre>
                </div>
              )}

              {/* Inline Vault Unlock if currently locked */}
              {!vaultStatus.unlocked && !pendingTxPreview.blockingError && (
                <form
                  onSubmit={(e) => void handleInlineUnlock(e)}
                  className="p-3.5 rounded-xl bg-slate-950 border border-amber-400/40 space-y-2"
                >
                  <div className="flex items-center gap-1.5 text-xs font-mono text-amber-200">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    Unlock Encrypted Vault to Sign
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={unlockPassphrase}
                      onChange={(e) => setUnlockPassphrase(e.target.value)}
                      placeholder="Master vault passphrase"
                      className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/50 text-xs font-mono text-amber-200 hover:bg-amber-500/30"
                    >
                      Unlock
                    </button>
                  </div>
                  {unlockError && <div className="text-[11px] text-rose-400 font-mono">{unlockError}</div>}
                </form>
              )}

              {/* Action Footer */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={txSubmitting}
                  onClick={closeTxConfirmModal}
                  className="px-3.5 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    txSubmitting ||
                    !pendingTxPreview.ok ||
                    Boolean(pendingTxPreview.blockingError) ||
                    !vaultStatus.unlocked
                  }
                  onClick={() => void confirmAndSignPendingTx()}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold border transition-colors disabled:opacity-40 ${
                    isMainnet
                      ? 'bg-rose-500/25 border-rose-400 text-rose-100 hover:bg-rose-500/40'
                      : 'bg-emerald-500/25 border-emerald-400 text-emerald-100 hover:bg-emerald-500/40'
                  }`}
                >
                  {txSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {txSubmitting
                    ? 'Signing & Broadcasting…'
                    : isMainnet
                      ? 'Sign & Broadcast on MAINNET'
                      : 'Sign & Broadcast'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
