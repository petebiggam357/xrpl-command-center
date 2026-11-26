import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  Send,
  Square,
  Upload,
  XCircle,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import {
  type BatchPayoutReceiptRow,
  buildPayoutReceiptCsv,
  parseBatchPayoutCsv,
} from '../shared/v022Utils';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

const SAMPLE_CSV = `destination,amount,destination_tag
rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe,10,1001
rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh,25
`;

export const BatchAirdropPanel: React.FC = () => {
  const vaultStatus = useCommandStore((s) => s.vaultStatus);
  const streamStatus = useCommandStore((s) => s.streamStatus);
  const custodialAccounts = useMemo(
    () => vaultStatus.accounts.filter((a) => a.kind === 'custodial'),
    [vaultStatus.accounts]
  );

  const [walletId, setWalletId] = useState<string>(() => custodialAccounts[0]?.id ?? '');
  const [assetMode, setAssetMode] = useState<'XRP' | 'IOU'>('XRP');
  const [currency, setCurrency] = useState('USD');
  const [issuer, setIssuer] = useState('');
  const [memo, setMemo] = useState('XRPL Batch Airdrop');
  const [csvInput, setCsvInput] = useState('');

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [receipts, setReceipts] = useState<BatchPayoutReceiptRow[]>([]);
  const abortRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeAccount =
    custodialAccounts.find((a) => a.id === walletId) ?? custodialAccounts[0] ?? null;
  const activeWalletId = activeAccount?.id ?? '';
  const parsed = useMemo(() => parseBatchPayoutCsv(csvInput), [csvInput]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvInput(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRunBatch = async () => {
    if (!activeAccount || parsed.validRows.length === 0) return;
    if (assetMode === 'IOU' && (!currency.trim() || !issuer.trim())) return;

    abortRef.current = false;
    setRunning(true);
    setReceipts([]);
    setProgress({ done: 0, total: parsed.validRows.length });

    const bridge = getXrplBridge();
    const out: BatchPayoutReceiptRow[] = [];

    try {
      for (let i = 0; i < parsed.validRows.length; i++) {
        const row = parsed.validRows[i];
        if (abortRef.current) {
          out.push({
            destination: row.destination,
            amount: row.amount,
            currency: assetMode === 'XRP' ? 'XRP' : currency.trim().toUpperCase(),
            destinationTag: row.destinationTag,
            status: 'skipped',
            error: 'Aborted by operator',
          });
          continue;
        }

        try {
          const res = await bridge.walletSignAndSubmitTx(activeAccount.id, {
            kind: 'Payment',
            account: activeAccount.address,
            destination: row.destination,
            destinationTag: row.destinationTag,
            memoText: memo.trim() || undefined,
            asset:
              assetMode === 'XRP'
                ? { currency: 'XRP', value: row.amount }
                : {
                    currency: currency.trim().toUpperCase(),
                    issuer: issuer.trim(),
                    value: row.amount,
                  },
          });
          out.push({
            destination: row.destination,
            amount: row.amount,
            currency: assetMode === 'XRP' ? 'XRP' : currency.trim().toUpperCase(),
            destinationTag: row.destinationTag,
            status: res.ok ? 'success' : 'failed',
            hash: res.hash,
            error: res.ok ? undefined : res.error ?? res.engineResult ?? 'Submission failed',
          });
        } catch (err) {
          out.push({
            destination: row.destination,
            amount: row.amount,
            currency: assetMode === 'XRP' ? 'XRP' : currency.trim().toUpperCase(),
            destinationTag: row.destinationTag,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unexpected error',
          });
        }

        setReceipts([...out]);
        setProgress({ done: i + 1, total: parsed.validRows.length });
      }
    } finally {
      setReceipts([...out]);
      setRunning(false);
    }
  };

  const handleDownloadReceipts = () => {
    if (receipts.length === 0) return;
    const csv = buildPayoutReceiptCsv(receipts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xrpl-batch-payout-receipts-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canStart =
    !running &&
    vaultStatus.unlocked &&
    Boolean(activeWalletId) &&
    parsed.validRows.length > 0 &&
    (assetMode === 'XRP' || (currency.trim().length > 0 && issuer.trim().length > 0));

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="hud-panel rounded-xl p-5 space-y-4 border border-cyan-500/25">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-cyan-400" />
            Batch Airdrop &amp; Multi-Recipient Payout Studio
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Parse CSV recipients (`r-address,amount[,destination_tag]`), validate pre-flight, sign
            sequentially on <span className="font-mono text-cyan-300">{streamStatus.networkId.toUpperCase()}</span>, and export signed receipts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-200 hover:border-cyan-400/50"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => setCsvInput(SAMPLE_CSV)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-300 hover:text-white"
          >
            Load Sample
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
            Source Custodial Wallet
          </label>
          <select
            value={activeWalletId}
            onChange={(e) => setWalletId(e.target.value)}
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs font-mono text-white"
          >
            {custodialAccounts.length === 0 ? (
              <option value="">No custodial wallet in vault</option>
            ) : (
              custodialAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({shortenAddress(a.address)})
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
            Payout Asset
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setAssetMode('XRP')}
              className={`py-2 rounded-lg border text-xs font-mono ${
                assetMode === 'XRP'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              Native XRP
            </button>
            <button
              type="button"
              onClick={() => setAssetMode('IOU')}
              className={`py-2 rounded-lg border text-xs font-mono ${
                assetMode === 'IOU'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              Issued IOU
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
            Batch Memo (Optional)
          </label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="XRPL Batch Airdrop"
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs font-mono text-white"
          />
        </div>
      </div>

      {assetMode === 'IOU' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
              Currency Code (3-char or 40-char Hex)
            </label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="USD"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
              Issuer Classic Address
            </label>
            <input
              type="text"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="r..."
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs font-mono text-white"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
          Recipients CSV (`r-address,amount[,destination_tag]`)
        </label>
        <textarea
          rows={5}
          value={csvInput}
          onChange={(e) => setCsvInput(e.target.value)}
          placeholder="rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe,10,1001"
          className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
        />
      </div>

      {/* Pre-flight metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 font-mono text-xs">
        <div className="rounded-lg bg-slate-950/90 border border-slate-800 px-3 py-2">
          <div className="text-[10px] text-slate-400">Valid Rows</div>
          <div className="text-emerald-300 font-semibold tabular-nums">{parsed.validRows.length}</div>
        </div>
        <div className="rounded-lg bg-slate-950/90 border border-slate-800 px-3 py-2">
          <div className="text-[10px] text-slate-400">Invalid Rows</div>
          <div className={parsed.invalidRows.length > 0 ? 'text-rose-300 font-semibold' : 'text-slate-300 font-semibold'}>
            {parsed.invalidRows.length}
          </div>
        </div>
        <div className="rounded-lg bg-slate-950/90 border border-slate-800 px-3 py-2">
          <div className="text-[10px] text-slate-400">Total Payout</div>
          <div className="text-cyan-300 font-semibold tabular-nums">
            {parsed.totalAmount.toLocaleString()} {assetMode === 'XRP' ? 'XRP' : currency.toUpperCase()}
          </div>
        </div>
        <div className="rounded-lg bg-slate-950/90 border border-slate-800 px-3 py-2">
          <div className="text-[10px] text-slate-400">Est. Network Fees</div>
          <div className="text-slate-200 font-semibold tabular-nums">{parsed.estimatedFeesXrp} XRP</div>
        </div>
      </div>

      {parsed.invalidRows.length > 0 && (
        <div className="rounded-xl bg-rose-950/35 border border-rose-500/40 p-3 space-y-1 text-xs">
          <div className="flex items-center gap-1.5 font-mono font-semibold text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            {parsed.invalidRows.length} row(s) skipped due to validation errors:
          </div>
          <div className="max-h-24 overflow-y-auto space-y-0.5 font-mono text-[11px] text-rose-200/90">
            {parsed.invalidRows.slice(0, 8).map((inv) => (
              <div key={inv.lineNumber}>
                Line {inv.lineNumber}: {inv.reason} ({inv.raw.slice(0, 48)})
              </div>
            ))}
          </div>
        </div>
      )}

      {!vaultStatus.unlocked && (
        <div className="rounded-lg bg-amber-950/40 border border-amber-500/40 px-3 py-2 text-xs text-amber-200">
          Unlock your local Wallet Vault in the Wallet tab before executing batch payouts.
        </div>
      )}

      {/* Action bar & progress */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2">
          {!running ? (
            <button
              type="button"
              disabled={!canStart}
              onClick={() => void handleRunBatch()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400 text-xs font-mono font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-40"
            >
              <Play className="w-3.5 h-3.5" />
              Execute Batch ({parsed.validRows.length} tx)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                abortRef.current = true;
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-400 text-xs font-mono font-semibold text-rose-100"
            >
              <Square className="w-3.5 h-3.5" />
              Abort Remaining
            </button>
          )}

          {receipts.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadReceipts}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-400/50 text-xs font-mono text-emerald-200 hover:bg-emerald-500/25"
            >
              <Download className="w-3.5 h-3.5" />
              Download Receipt CSV
            </button>
          )}
        </div>

        {(running || progress.total > 0) && (
          <div className="flex items-center gap-2.5 min-w-[200px]">
            {running && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
            <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-[11px] text-slate-300 tabular-nums">
              {progress.done}/{progress.total} ({pct}%)
            </span>
          </div>
        )}
      </div>

      {/* Receipt table */}
      {receipts.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden">
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-800/80 font-mono text-[11px]">
            {receipts.map((r, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {r.status === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span className="text-slate-200 truncate">{r.destination}</span>
                  <span className="text-cyan-300 shrink-0">
                    {r.amount} {r.currency}
                  </span>
                </div>
                <div className="text-right truncate max-w-[220px]">
                  {r.hash ? (
                    <span className="text-emerald-300">{r.hash.slice(0, 16)}…</span>
                  ) : (
                    <span className="text-rose-300">{r.error ?? r.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
