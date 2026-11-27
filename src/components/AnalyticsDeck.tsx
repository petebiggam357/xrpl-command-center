import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  Database,
  Download,
  FileDown,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import type { HudThemeId, SqliteAnalyticsSummary, TrayAndUpdaterSettings } from '../shared/types';
import { computeAssetAllocation } from '../shared/v020Utils';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

export const AnalyticsDeck: React.FC = () => {
  const inspectQuery = useCommandStore((s) => s.inspectQuery);
  const hudTheme = useCommandStore((s) => s.hudTheme);
  const setHudTheme = useCommandStore((s) => s.setHudTheme);
  const autoLockMinutes = useCommandStore((s) => s.autoLockMinutes);
  const setAutoLockMinutes = useCommandStore((s) => s.setAutoLockMinutes);
  const portfolioHistory = useCommandStore((s) => s.portfolioHistory);
  const walletPortfolio = useCommandStore((s) => s.walletPortfolio);
  const marketPrice = useCommandStore((s) => s.marketPrice);

  const [summary, setSummary] = useState<SqliteAnalyticsSummary | null>(null);
  const [trayState, setTrayState] = useState<TrayAndUpdaterSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportBanner, setExportBanner] = useState<string | null>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const allocation = useMemo(
    () =>
      computeAssetAllocation(
        walletPortfolio?.totalXrp ?? 0,
        marketPrice.xrpUsd,
        walletPortfolio?.tokens ?? []
      ),
    [walletPortfolio, marketPrice.xrpUsd]
  );

  const loadAll = async () => {
    setLoading(true);
    const bridge = getXrplBridge();
    const [sum, tray] = await Promise.all([
      bridge.analyticsGetSummary(),
      bridge.systemGetTrayUpdaterState(),
    ]);
    setSummary(sum);
    setTrayState(tray);
    setLoading(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  // Draw historical ledger throughput sparkline from SQLite series
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas || !summary) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth || 600;
    const h = parent.clientHeight || 160;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    const pts = summary.ledgerSeries;
    if (pts.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText('Recording live validated ledgers into SQLite…', 18, h / 2);
      return;
    }

    const maxTx = Math.max(...pts.map((p) => p.txnCount), 10);
    const pad = 16;
    const uw = w - pad * 2;
    const uh = h - pad * 2;

    ctx.beginPath();
    pts.forEach((p, idx) => {
      const x = pad + (idx / (pts.length - 1)) * uw;
      const y = pad + uh - (p.txnCount / maxTx) * uh;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineTo(pad + uw, pad + uh);
    ctx.lineTo(pad, pad + uh);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad, 0, pad + uh);
    grad.addColorStop(0, 'rgba(34, 211, 238, 0.28)');
    grad.addColorStop(1, 'rgba(34, 211, 238, 0.01)');
    ctx.fillStyle = grad;
    ctx.fill();
  }, [summary]);

  const handleExport = async (kind: 'transactions' | 'ledgers') => {
    const res = await getXrplBridge().analyticsExportCsv(kind);
    if (res.ok) {
      setExportBanner(`Exported ${res.rowCount ?? 0} rows to ${res.filePath}`);
    } else if (res.error && res.error !== 'Export cancelled') {
      setExportBanner(`Export error: ${res.error}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 font-mono">
        <div className="hud-panel rounded-xl p-3.5">
          <div className="text-[10px] uppercase text-slate-400">SQLite Ledgers Logged</div>
          <div className="text-2xl font-bold text-cyan-300 tabular-nums mt-1">
            {summary?.recordedLedgers.toLocaleString() ?? 0}
          </div>
          <div className="text-[10px] text-slate-500">
            DB: {((summary?.dbSizeBytes ?? 0) / 1024).toFixed(1)} KB
          </div>
        </div>

        <div className="hud-panel rounded-xl p-3.5">
          <div className="text-[10px] uppercase text-slate-400">Wallet Tx Journal</div>
          <div className="text-2xl font-bold text-emerald-300 tabular-nums mt-1">
            {summary?.recordedTxJournal.toLocaleString() ?? 0}
          </div>
          <div className="text-[10px] text-slate-500">Tax / accounting ready</div>
        </div>

        <div className="hud-panel rounded-xl p-3.5">
          <div className="text-[10px] uppercase text-slate-400">Historical Avg TPS</div>
          <div className="text-2xl font-bold text-white tabular-nums mt-1">
            {summary?.avgTpsRecent ?? 0} tx/s
          </div>
          <div className="text-[10px] text-slate-500">Rolling SQLite window</div>
        </div>

        <div className="hud-panel rounded-xl p-3.5">
          <div className="text-[10px] uppercase text-slate-400">Peak Ledger Seen</div>
          <div className="text-2xl font-bold text-amber-300 tabular-nums mt-1">
            {summary?.peakTxnLedger ? `${summary.peakTxnLedger.txnCount} tx` : '—'}
          </div>
          <div className="text-[10px] text-slate-500">
            {summary?.peakTxnLedger ? `#${summary.peakTxnLedger.ledgerIndex.toLocaleString()}` : ''}
          </div>
        </div>

        <div className="hud-panel rounded-xl p-3.5 flex flex-col justify-between">
          <div className="text-[10px] uppercase text-slate-400">CSV Accounting Export</div>
          <div className="flex gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => void handleExport('transactions')}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-[11px] text-emerald-200 hover:bg-emerald-500/30"
            >
              <Download className="w-3 h-3" />
              Tx CSV
            </button>
            <button
              type="button"
              onClick={() => void handleExport('ledgers')}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-[11px] text-cyan-200 hover:bg-cyan-500/30"
            >
              <Download className="w-3 h-3" />
              Ledgers
            </button>
          </div>
        </div>
      </div>

      {exportBanner && (
        <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs font-mono text-emerald-200 flex justify-between">
          <span>{exportBanner}</span>
          <button type="button" onClick={() => setExportBanner(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Historical Chart + Desktop System Tray / Watchdog / Updater */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 hud-panel rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                SQLite Validated Ledger Throughput History
              </h3>
            </div>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-xs font-mono text-slate-300"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh DB
            </button>
          </div>
          <div className="h-44 w-full">
            <canvas ref={chartCanvasRef} className="w-full h-full block" />
          </div>
          <div className="text-[10px] font-mono text-slate-500 truncate">
            Database File: {summary?.dbPath || 'command-center.sqlite'}
          </div>
        </div>

        {/* System Tray, Node Watchdog & Auto-Updater */}
        <div className="lg:col-span-5 hud-panel rounded-xl p-4 space-y-3.5">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
              System Tray, Watchdog &amp; Release Updater
            </h3>
          </div>

          <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(trayState?.minimizeToTray)}
              onChange={async (e) => {
                const next = await getXrplBridge().systemUpdateTraySettings({
                  minimizeToTray: e.target.checked,
                });
                setTrayState(next);
              }}
              className="mt-1"
            />
            <div>
              <div className="text-xs font-semibold text-white">Minimize to OS System Tray on Close</div>
              <div className="text-[11px] text-slate-400">
                Keep XRPL watchlist &amp; node health alerts running quietly in the background.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(trayState?.nodeWatchdogEnabled)}
              onChange={async (e) => {
                const next = await getXrplBridge().systemUpdateTraySettings({
                  nodeWatchdogEnabled: e.target.checked,
                });
                setTrayState(next);
              }}
              className="mt-1"
            />
            <div>
              <div className="text-xs font-semibold text-white">30s Background `rippled` Node Watchdog</div>
              <div className="text-[11px] text-slate-400">
                Fires native desktop alerts if your node drops out of `full`/`proposing` sync or peers drop below 3.
              </div>
            </div>
          </label>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Installed Release: <strong className="text-white">v{trayState?.currentVersion ?? '0.2.8-beta'}</strong>
              </span>
              <button
                type="button"
                onClick={async () => {
                  const st = await getXrplBridge().systemCheckForUpdates();
                  setTrayState(st);
                }}
                className="px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-400/40 text-[11px] text-cyan-200"
              >
                Check Updates
              </button>
            </div>
            {trayState?.updateMessage && (
              <div className="text-[11px] text-slate-400">{trayState.updateMessage}</div>
            )}
          </div>
        </div>
      </div>

      {/* v0.2.0-beta: Appearance, Vault Auto-Lock, Tax CSV & Redacted Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 hud-panel rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
              HUD Theme, Vault Auto-Lock &amp; Diagnostics
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            {(
              [
                { id: 'cyber-cyan', label: 'Cyber Cyan' },
                { id: 'emerald-matrix', label: 'Emerald Matrix' },
                { id: 'solar-amber', label: 'Solar Amber' },
                { id: 'midnight-contrast', label: 'Midnight High-Contrast' },
              ] as Array<{ id: HudThemeId; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setHudTheme(t.id)}
                className={`px-2.5 py-2 rounded-lg border text-center transition-colors ${
                  hudTheme === t.id
                    ? 'bg-cyan-500/20 border-cyan-400/60 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Vault Auto-Lock:</span>
              <select
                value={autoLockMinutes}
                onChange={(e) => void setAutoLockMinutes(Number(e.target.value))}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1 text-xs text-white"
              >
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes (Default)</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await getXrplBridge().analyticsExportTaxCsv();
                  if (res.ok) {
                    setExportBanner(
                      `Exported CoinTracker/Koinly Tax CSV (${res.rowCount ?? 0} rows) to ${res.filePath}`
                    );
                  } else if (res.error && res.error !== 'Export cancelled') {
                    setExportBanner(`Tax CSV export failed: ${res.error}`);
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-[11px] text-emerald-200 hover:bg-emerald-500/25"
              >
                <FileDown className="w-3.5 h-3.5" />
                Tax CSV (Koinly)
              </button>

              <button
                type="button"
                onClick={async () => {
                  const res = await getXrplBridge().systemExportDiagnostics();
                  if (res.cancelled) return;
                  setExportBanner(
                    res.ok
                      ? `Exported redacted diagnostics (zero keys/seeds) to ${res.filePath}`
                      : `Diagnostics export failed: ${res.error ?? 'Unknown error'}`
                  );
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-slate-200 hover:border-cyan-400/50"
              >
                <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                Diagnostics
              </button>
            </div>
          </div>
        </div>

        {/* Portfolio Asset Allocation & Snapshot History */}
        <div className="lg:col-span-6 hud-panel rounded-xl p-4 space-y-3 font-mono">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
              Active Wallet Asset Allocation &amp; Net Worth Snapshots
            </h3>
            <span className="text-[10px] text-slate-400">
              {portfolioHistory.length} snapshots saved
            </span>
          </div>

          {allocation.length === 0 ? (
            <div className="text-xs text-slate-500 py-4">
              Select a funded wallet in Wallets &amp; DeFi to visualize your XRP vs. token allocation.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden flex">
                {allocation.map((slice) => (
                  <div
                    key={slice.label}
                    style={{ width: `${slice.pct}%`, backgroundColor: slice.color }}
                    title={`${slice.label}: ${slice.pct}%`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {allocation.map((slice) => (
                  <span
                    key={slice.label}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: slice.color }} />
                    {slice.label} ({slice.pct}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {portfolioHistory.length >= 2 && (
            <div className="pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                <span>Portfolio Net Worth Trend (XRP)</span>
                <span className="text-emerald-300 tabular-nums">
                  {portfolioHistory[portfolioHistory.length - 1].totalXrp.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  XRP
                </span>
              </div>
              <svg viewBox="0 0 240 42" className="w-full h-10 overflow-visible">
                {(() => {
                  const vals = portfolioHistory.map((p) => p.totalXrp);
                  const minV = Math.min(...vals);
                  const maxV = Math.max(...vals);
                  const span = Math.max(maxV - minV, 0.0001);
                  const pts = vals
                    .map((v, i) => {
                      const x = (i / (vals.length - 1)) * 240;
                      const y = 38 - ((v - minV) / span) * 34;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ');
                  return (
                    <polyline
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={pts}
                    />
                  );
                })()}
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Wallet Transaction Journal Table */}
      <div className="hud-panel rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
            SQLite Tracked Wallet Transaction Journal ({summary?.recentJournal.length ?? 0})
          </h3>
        </div>
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead className="sticky top-0 bg-panel text-[10px] uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-1.5 px-2">Timestamp</th>
                <th className="py-1.5 px-2">Network</th>
                <th className="py-1.5 px-2">Type</th>
                <th className="py-1.5 px-2">Account → Dest</th>
                <th className="py-1.5 px-2">Status</th>
                <th className="py-1.5 px-2 text-right">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(summary?.recentJournal ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    Transactions signed or received by your tracked wallets are automatically journaled here.
                  </td>
                </tr>
              ) : (
                summary!.recentJournal.map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => void inspectQuery(j.hash)}
                    className="cursor-pointer hover:bg-slate-900/60"
                  >
                    <td className="py-1.5 px-2 text-slate-400">
                      {new Date(j.timestamp).toLocaleString()}
                    </td>
                    <td className="py-1.5 px-2 text-cyan-300 uppercase">{j.network}</td>
                    <td className="py-1.5 px-2 text-white">{j.txType}</td>
                    <td className="py-1.5 px-2 text-slate-300">
                      {shortenAddress(j.account, 6, 4)}
                      {j.destination ? ` → ${shortenAddress(j.destination, 6, 4)}` : ''}
                    </td>
                    <td className="py-1.5 px-2 text-emerald-300">{j.status}</td>
                    <td className="py-1.5 px-2 text-right text-slate-400">
                      {shortenAddress(j.hash, 8, 6)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
