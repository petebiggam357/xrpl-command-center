import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Download,
  Gauge,
  HelpCircle,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Radio,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import { NETWORK_PRESETS } from '../shared/networks';
import type { NetworkId, TrayAndUpdaterSettings } from '../shared/types';
import { useCommandStore } from '../store/useCommandStore';

export const TopHudBar: React.FC = () => {
  const streamStatus = useCommandStore((s) => s.streamStatus);
  const latestLedger = useCommandStore((s) => s.ledgers[0]);
  const tpsEstimate = useCommandStore((s) => s.tpsEstimate);
  const marketPrice = useCommandStore((s) => s.marketPrice);
  const vaultStatus = useCommandStore((s) => s.vaultStatus);
  const mcpStatus = useCommandStore((s) => s.mcpStatus);
  const agentDrawerOpen = useCommandStore((s) => s.agentDrawerOpen);
  const setAgentDrawerOpen = useCommandStore((s) => s.setAgentDrawerOpen);
  const paused = useCommandStore((s) => s.paused);
  const reducedMotion = useCommandStore((s) => s.reducedMotion);
  const soundAlertsEnabled = useCommandStore((s) => s.soundAlertsEnabled);
  const showPerfHud = useCommandStore((s) => s.showPerfHud);
  const sidebarCollapsed = useCommandStore((s) => s.sidebarCollapsed);
  const savedEndpoints = useCommandStore((s) => s.savedEndpoints);
  const togglePaused = useCommandStore((s) => s.togglePaused);
  const toggleReducedMotion = useCommandStore((s) => s.toggleReducedMotion);
  const toggleSoundAlerts = useCommandStore((s) => s.toggleSoundAlerts);
  const togglePerfHud = useCommandStore((s) => s.togglePerfHud);
  const toggleSidebar = useCommandStore((s) => s.toggleSidebar);
  const addSavedEndpoint = useCommandStore((s) => s.addSavedEndpoint);
  const removeSavedEndpoint = useCommandStore((s) => s.removeSavedEndpoint);
  const connectNetwork = useCommandStore((s) => s.connectNetwork);
  const setCommandPaletteOpen = useCommandStore((s) => s.setCommandPaletteOpen);
  const setActiveTab = useCommandStore((s) => s.setActiveTab);
  const setQuickStartOpen = useCommandStore((s) => s.setQuickStartOpen);

  const [customUrlOpen, setCustomUrlOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customWsUrl, setCustomWsUrl] = useState('ws://127.0.0.1:6006/');
  const [updaterState, setUpdaterState] = useState<TrayAndUpdaterSettings | null>(null);

  useEffect(() => {
    const bridge = getXrplBridge();
    void bridge.systemGetTrayUpdaterState().then(setUpdaterState).catch(() => undefined);
    const unsub = bridge.onUpdaterState(setUpdaterState);
    return () => unsub();
  }, []);

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
    if (customLabel.trim()) {
      addSavedEndpoint(customLabel.trim(), customWsUrl.trim());
      setCustomLabel('');
    }
    setCustomUrlOpen(false);
    void connectNetwork('custom', customWsUrl.trim());
  };

  return (
    <header className="h-14 shrink-0 border-b border-hudBorder/80 bg-panel/95 px-4 flex items-center justify-between gap-3 z-30 relative">
      {/* Brand & Network Selector */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Widescreen Focus Mode (Ctrl+B)'}
          className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-cyan-300 hover:border-cyan-400/50 transition-colors"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400/20 to-emerald-400/20 border border-cyan-400/40 flex items-center justify-center shadow-glowCyan">
            <Radio className="w-4 h-4 text-cyan-300" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-[0.16em] uppercase text-white">
                XRPL Command Center
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                title="Open Seamless App Updater & Diagnostics"
                className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/30 hover:border-cyan-300 font-mono text-[10px] text-cyan-300 transition-colors"
              >
                v0.3.0-beta
              </button>
              {(updaterState?.updateState === 'available' ||
                updaterState?.updateState === 'downloaded') && (
                <button
                  type="button"
                  onClick={() => setActiveTab('analytics')}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/60 hover:bg-emerald-500/30 font-mono text-[10px] font-semibold text-emerald-200 animate-pulse"
                  title="Seamless update available — click to download & install without losing settings"
                >
                  <Download className="w-2.5 h-2.5" />
                  {updaterState.updateState === 'downloaded'
                    ? `Restart v${updaterState.availableVersion}`
                    : `Update v${updaterState.availableVersion}`}
                </button>
              )}
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
              className="absolute top-10 left-0 z-50 w-96 p-3.5 rounded-xl hud-panel border border-cyan-400/40 shadow-2xl space-y-2.5"
            >
              <label className="block text-[11px] font-mono text-cyan-300 uppercase">
                Custom / Saved rippled &amp; Clio Endpoints
              </label>

              {savedEndpoints.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {savedEndpoints.map((ep) => (
                    <div
                      key={ep.id}
                      className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-slate-950/90 border border-slate-800 hover:border-cyan-400/40"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setCustomWsUrl(ep.wsUrl);
                          setCustomUrlOpen(false);
                          void connectNetwork('custom', ep.wsUrl);
                        }}
                        className="text-left min-w-0 flex-1"
                      >
                        <div className="text-[11px] font-semibold text-white truncate">{ep.label}</div>
                        <div className="text-[10px] font-mono text-cyan-300/80 truncate">{ep.wsUrl}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSavedEndpoint(ep.id)}
                        className="p-1 text-slate-500 hover:text-rose-300"
                        title="Remove saved endpoint"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Save Profile Name (e.g. Home NVMe Node)"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
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
                  Connect{customLabel.trim() ? ' & Save' : ''}
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

        {marketPrice.xrpUsd !== null && (
          <>
            <div className="h-3.5 w-px bg-slate-800" />
            <div
              className="flex items-center gap-1.5"
              title={`Live XRP/USD spot (${marketPrice.source})`}
            >
              <span className="text-slate-500 text-[10px]">XRP</span>
              <span className="text-white font-semibold tabular-nums">
                ${marketPrice.xrpUsd.toFixed(marketPrice.xrpUsd < 1 ? 4 : 2)}
              </span>
              {marketPrice.change24hPct !== null && (
                <span
                  className={`text-[10px] tabular-nums ${
                    marketPrice.change24hPct >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {marketPrice.change24hPct >= 0 ? '+' : ''}
                  {marketPrice.change24hPct.toFixed(1)}%
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right Action Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAgentDrawerOpen(!agentDrawerOpen)}
          title="Open Agent & MCP Command Hub (Ctrl+J) — Copilot Chat, Local MCP Server & Audit Log"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-[11px] transition-colors ${
            agentDrawerOpen
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-100 shadow-glowCyan'
              : mcpStatus?.running
                ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200 hover:bg-emerald-500/25'
                : 'bg-slate-950/90 border-cyan-500/35 text-cyan-200 hover:border-cyan-400 hover:bg-cyan-500/15'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-cyan-300" />
          <span className="hidden sm:inline">Agent / MCP</span>
          {mcpStatus?.running && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('wallets')}
          title={
            vaultStatus.unlocked
              ? 'Rust Vault unlocked — click to manage wallets'
              : vaultStatus.initialized
                ? 'Vault locked — click to unlock'
                : 'Initialize Rust-encrypted wallet vault'
          }
          className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-[11px] transition-colors ${
            vaultStatus.unlocked
              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25'
              : 'bg-slate-950/90 border-slate-800 text-slate-400 hover:border-cyan-400/50 hover:text-slate-200'
          }`}
        >
          {vaultStatus.unlocked ? (
            <Unlock className="w-3.5 h-3.5 text-emerald-300" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>{vaultStatus.unlocked ? 'Vault Open' : 'Vault Locked'}</span>
        </button>

        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-700/90 hover:border-cyan-400/60 text-xs text-slate-300 transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Inspect</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400">
            Ctrl+K
          </kbd>
        </button>

        <button
          type="button"
          onClick={toggleSoundAlerts}
          title={soundAlertsEnabled ? 'Mute Whale & Watchlist audio ping' : 'Enable subtle audio ping for Whale & Watchlist alerts'}
          className={`p-2 rounded-lg border transition-colors ${
            soundAlertsEnabled
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
              : 'bg-slate-950/90 border-slate-800 text-slate-400 hover:border-cyan-400/50 hover:text-slate-200'
          }`}
        >
          {soundAlertsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={togglePerfHud}
          title="Toggle Live FPS & Memory Performance HUD"
          className={`p-2 rounded-lg border transition-colors ${
            showPerfHud
              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
              : 'bg-slate-950/90 border-slate-800 text-slate-400 hover:border-cyan-400/50 hover:text-slate-200'
          }`}
        >
          <Gauge className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setQuickStartOpen(true)}
          title="Quick-Start Guide & 1-Click Testnet Playground"
          className="p-2 rounded-lg border bg-slate-950/90 border-slate-800 text-slate-400 hover:border-cyan-400/50 hover:text-cyan-200 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
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
