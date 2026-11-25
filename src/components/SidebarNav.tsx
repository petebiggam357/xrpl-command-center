import React, { useState } from 'react';
import {
  Bell,
  Building2,
  Coins,
  Database,
  Globe2,
  GraduationCap,
  Plus,
  Radar,
  Server,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import { shortenAddress } from '../shared/xrplCodec';
import { type NavTab, useCommandStore } from '../store/useCommandStore';

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'command', label: 'Command Deck', subtitle: 'Live Pulse & Stream', icon: Radar },
  { id: 'globe', label: '3D Globe', subtitle: 'Holographic Consensus', icon: Globe2 },
  { id: 'validators', label: 'Validators', subtitle: 'UNL & Quorum Health', icon: ShieldCheck },
  { id: 'tokens', label: 'Tokens & DEX', subtitle: 'IOUs, Depth & AMM Curve', icon: Coins },
  { id: 'wallets', label: 'Wallets & DeFi', subtitle: 'Vault, Ledger, PathSwap', icon: Wallet },
  { id: 'primitives', label: 'Institutional', subtitle: 'MPT, Oracles, DID & TOML', icon: Building2 },
  { id: 'nodeops', label: 'My Node Ops', subtitle: 'Docker, Config & Admin', icon: Server },
  { id: 'analytics', label: 'Analytics & Tray', subtitle: 'SQLite, CSV & Updater', icon: Database },
  { id: 'education', label: 'XRPL Academy', subtitle: 'Docs, Labs & Guide', icon: GraduationCap },
];

export const SidebarNav: React.FC = () => {
  const activeTab = useCommandStore((s) => s.activeTab);
  const setActiveTab = useCommandStore((s) => s.setActiveTab);
  const watchlist = useCommandStore((s) => s.watchlist);
  const alerts = useCommandStore((s) => s.alerts);
  const addWatchlistEntry = useCommandStore((s) => s.addWatchlistEntry);
  const removeWatchlistEntry = useCommandStore((s) => s.removeWatchlistEntry);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);
  const nodeSnapshot = useCommandStore((s) => s.nodeSnapshot);

  const [addingWatch, setAddingWatch] = useState(false);
  const [watchLabel, setWatchLabel] = useState('');
  const [watchTarget, setWatchTarget] = useState('');

  const handleAddWatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!watchTarget.trim()) return;
    const target = watchTarget.trim();
    const isAcct = target.startsWith('r') && target.length >= 25;
    addWatchlistEntry({
      label: watchLabel.trim() || shortenAddress(target),
      type: isAcct ? 'account' : 'token',
      target,
      notifyOs: true,
    });
    setWatchLabel('');
    setWatchTarget('');
    setAddingWatch(false);
  };

  return (
    <aside className="w-60 shrink-0 border-r border-hudBorder/80 bg-panel/75 backdrop-blur flex flex-col justify-between p-3 overflow-y-auto">
      <div className="space-y-1.5">
        <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
          Mission Control
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border transition-all ${
                active
                  ? 'bg-cyan-500/15 border-cyan-400/50 text-white shadow-glowCyan'
                  : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-900/70 hover:text-slate-100 hover:border-slate-800'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-300' : 'text-slate-400'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold truncate">{item.label}</span>
                  {item.id === 'nodeops' && nodeSnapshot?.connected && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" title="Own Node Online" />
                  )}
                </div>
                <div className="text-[10px] text-slate-500 truncate">{item.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Watchlist & Live Alerts Section */}
      <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">
            <Bell className="w-3 h-3 text-cyan-400" />
            Watchlist ({watchlist.length})
          </div>
          <button
            type="button"
            onClick={() => setAddingWatch((v) => !v)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300"
            title="Watch an account or token"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {addingWatch && (
          <form onSubmit={handleAddWatch} className="p-2 rounded-lg bg-slate-950/90 border border-slate-800 space-y-1.5">
            <input
              type="text"
              value={watchLabel}
              onChange={(e) => setWatchLabel(e.target.value)}
              placeholder="Label (e.g. Whale / RLUSD)"
              className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-white focus:outline-none focus:border-cyan-400"
            />
            <input
              type="text"
              value={watchTarget}
              onChange={(e) => setWatchTarget(e.target.value)}
              placeholder="rAddress or Currency code"
              className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="w-full py-1 rounded bg-cyan-500/20 border border-cyan-400/40 text-[11px] text-cyan-200 hover:bg-cyan-500/30"
            >
              Add Alert Watch
            </button>
          </form>
        )}

        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
          {watchlist.map((item) => (
            <div
              key={item.id}
              className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-cyan-500/40"
            >
              <button
                type="button"
                onClick={() => {
                  if (item.type === 'account') void inspectQuery(item.target);
                  else setActiveTab('tokens');
                }}
                className="min-w-0 text-left flex-1"
              >
                <div className="text-[11px] font-medium text-slate-200 truncate">{item.label}</div>
                <div className="text-[10px] font-mono text-slate-500 truncate">
                  {shortenAddress(item.target, 7, 5)}
                </div>
              </button>
              <button
                type="button"
                onClick={() => removeWatchlistEntry(item.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity"
                title="Remove from watchlist"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {alerts.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300 px-1">
              Recent Alerts ({alerts.length})
            </div>
            {alerts.slice(0, 3).map((a) => (
              <div
                key={a.id}
                className="px-2 py-1.5 rounded bg-amber-500/10 border border-amber-400/30 text-[10px]"
              >
                <div className="font-semibold text-amber-200 truncate">{a.title}</div>
                <div className="font-mono text-slate-300 truncate">{a.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
