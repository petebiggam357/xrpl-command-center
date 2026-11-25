import React, { useEffect, useRef, useState } from 'react';
import {
  BellRing,
  Database,
  Download,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import type { SqliteAnalyticsSummary, TrayAndUpdaterSettings } from '../shared/types';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

export const AnalyticsDeck: React.FC = () => {
  const inspectQuery = useCommandStore((s) => s.inspectQuery);
  const [summary, setSummary] = useState<SqliteAnalyticsSummary | null>(null);
  const [trayState, setTrayState] = useState<TrayAndUpdaterSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportBanner, setExportBanner] = useState<string | null>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
                Installed Release: <strong className="text-white">v{trayState?.currentVersion ?? '0.0.2-alpha'}</strong>
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
