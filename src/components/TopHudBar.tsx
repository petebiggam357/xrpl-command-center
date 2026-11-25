import React, { useState } from 'react';
import {
  Activity,
  Pause,
  Play,
  Radio,
  Search,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { NETWORK_PRESETS } from '../shared/networks';
import type { NetworkId } from '../shared/types';
import { useCommandStore } from '../store/useCommandStore';

export const TopHudBar: React.FC = () => {
  const streamStatus = useCommandStore((s) => s.streamStatus);
  const latestLedger = useCommandStore((s) => s.ledgers[0]);
  const tpsEstimate = useCommandStore((s) => s.tpsEstimate);
  const paused = useCommandStore((s) => s.paused);
  const reducedMotion = useCommandStore((s) => s.reducedMotion);
  const togglePaused = useCommandStore((s) => s.togglePaused);
  const toggleReducedMotion = useCommandStore((s) => s.toggleReducedMotion);
  const connectNetwork = useCommandStore((s) => s.connectNetwork);
  const setCommandPaletteOpen = useCommandStore((s) => s.setCommandPaletteOpen);

  const [customUrlOpen, setCustomUrlOpen] = useState(false);
  const [customWsUrl, setCustomWsUrl] = useState('ws://127.0.0.1:6006/');

  const handleNetworkChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const net = e.target.value as NetworkId;
    if (net === 'custom') {
      setCustomUrlOpen(true);
    } else {
      setCustomUrlOpen(false);
      void connectNetwork(net);
    }
  };

  const submitCustomEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customWsUrl.trim()) return;
    setCustomUrlOpen(false);
    void connectNetwork('custom', customWsUrl.trim());
  };

  return (
    <header className="h-14 shrink-0 border-b border-hudBorder/80 bg-panel/90 backdrop-blur px-4 flex items-center justify-between gap-3 z-30 relative">
      {/* Brand & Network Selector */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400/20 to-emerald-400/20 border border-cyan-400/40 flex items-center justify-center shadow-glowCyan">
            <Radio className="w-4 h-4 text-cyan-300" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-[0.16em] uppercase text-white">
                XRPL Command Center
              </span>
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/30 font-mono text-[10px] text-cyan-300">
                v0.0.3-alpha
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 truncate max-w-[230px]">
              {streamStatus.endpoint}
            </div>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-800 mx-1" />

        <div className="relative flex items-center gap-2">
          <select
            aria-label="Select XRPL network"
            value={streamStatus.networkId}
            onChange={handleNetworkChange}
            className="bg-slate-950/90 border border-slate-700/90 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
          >
            {Object.values(NETWORK_PRESETS).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>

          {customUrlOpen && (
            <form
              onSubmit={submitCustomEndpoint}
              className="absolute top-10 left-0 z-50 w-80 p-3 rounded-xl hud-panel border border-cyan-400/40 shadow-2xl space-y-2"
            >
              <label className="block text-[11px] font-mono text-cyan-300 uppercase">
                Custom / Local rippled WebSocket URL
              </label>
              <input
                type="text"
                value={customWsUrl}
                onChange={(e) => setCustomWsUrl(e.target.value)}
                placeholder="ws://127.0.0.1:6006/"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCustomUrlOpen(false)}
                  className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-medium text-cyan-200 hover:bg-cyan-500/30"
                >
                  Connect
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Live Telemetry Pill Strip */}
      <div className="hidden lg:flex items-center gap-4 px-3.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800/90 font-mono text-xs">
        <div className="flex items-center gap-1.5">
          {streamStatus.connected ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          )}
          <span className={streamStatus.connected ? 'text-emerald-300' : 'text-amber-300'}>
            {streamStatus.connected ? 'LIVE' : streamStatus.connecting ? 'SYNC' : 'OFFLINE'}
          </span>
          {streamStatus.latencyMs !== null && (
            <span className="text-slate-500 tabular-nums">{streamStatus.latencyMs}ms</span>
          )}
        </div>

        <div className="h-3.5 w-px bg-slate-800" />

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[10px]">LEDGER</span>
          <span className="text-white font-semibold tabular-nums">
            {latestLedger ? `#${latestLedger.ledgerIndex.toLocaleString()}` : '—'}
          </span>
        </div>

        <div className="h-3.5 w-px bg-slate-800" />

        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-cyan-300 tabular-nums">{tpsEstimate.toFixed(1)} tx/s</span>
        </div>

        <div className="h-3.5 w-px bg-slate-800" />

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[10px]">FEE</span>
          <span className="text-slate-200 tabular-nums">
            {latestLedger ? `${latestLedger.feeBaseDrops}d` : '10d'}
          </span>
        </div>
      </div>

      {/* Right Action Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-700/90 hover:border-cyan-400/60 text-xs text-slate-300 transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Inspect Address / Tx / Ledger</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400">
            Ctrl+K
          </kbd>
        </button>

        <button
          type="button"
          onClick={togglePaused}
          title={paused ? 'Resume live animations' : 'Pause live visual stream'}
          className={`p-2 rounded-lg border transition-colors ${
            paused
              ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
              : 'bg-slate-950/90 border-slate-800 text-slate-300 hover:border-cyan-400/50'
          }`}
        >
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={toggleReducedMotion}
          title="Toggle Reduced Motion mode"
          className={`p-2 rounded-lg border transition-colors ${
            reducedMotion
              ? 'bg-violet-500/20 border-violet-400/50 text-violet-300'
              : 'bg-slate-950/90 border-slate-800 text-slate-400 hover:border-cyan-400/50 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
