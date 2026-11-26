import React, { useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { detectQueryKind } from '../shared/xrplCodec';
import { type NavTab, useCommandStore } from '../store/useCommandStore';

export const CommandPalette: React.FC = () => {
  const open = useCommandStore((s) => s.commandPaletteOpen);
  const setOpen = useCommandStore((s) => s.setCommandPaletteOpen);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);
  const setActiveTab = useCommandStore((s) => s.setActiveTab);

  const [input, setInput] = useState('');

  if (!open) return null;

  const detected = detectQueryKind(input);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    void inspectQuery(input.trim());
    setInput('');
  };

  const quickNav: Array<{ tab: NavTab; label: string; hint: string }> = [
    { tab: 'command', label: 'Command Deck', hint: 'Live Consensus Core & Particle River' },
    { tab: 'globe', label: '3D Validator Globe', hint: 'Interactive WebGL2 Holographic Globe' },
    { tab: 'validators', label: 'Validators & UNL', hint: 'Agreement Scores & Live Votes' },
    { tab: 'tokens', label: 'Tokens, DEX & AMM', hint: 'CLOB Depth Wall & AMM x*y=k Curve' },
    { tab: 'launcher', label: 'Token Launcher & Wizard', hint: '5-Step IOU + AMM & XLS-33 MPT Token Launcher' },
    { tab: 'wallets', label: 'Wallets & Pro DeFi Studio', hint: 'Vault, Ledger USB, Multi-Sig & PathSwap' },
    { tab: 'primitives', label: 'Institutional Primitives', hint: 'MPT, XLS-47 Oracles, DID & xrp-ledger.toml' },
    { tab: 'nodeops', label: 'My Node Ops & Docker', hint: '1-Click Docker Node & rippled.cfg Diff Studio' },
    { tab: 'analytics', label: 'SQLite Analytics & System', hint: 'CSV Accounting Export, Tray Watchdog & Updater' },
    { tab: 'education', label: 'XRPL Academy & Guide', hint: 'Deep XRPL Curriculum, Reserve Lab, Glossary & Docs' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="hud-panel rounded-2xl w-full max-w-xl border border-cyan-400/40 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800">
          <Search className="w-4 h-4 text-cyan-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste r-address, 64-hex tx hash, or ledger number (e.g. rMxCKb...)"
            className="flex-1 bg-transparent text-sm font-mono text-white placeholder-slate-500 focus:outline-none"
          />
          {input.trim() && (
            <button
              type="submit"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200"
            >
              Inspect {detected}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </form>

        <div className="p-3 space-y-1">
          <div className="px-2 pb-1 text-[10px] font-mono uppercase text-slate-500">
            Jump To Module
          </div>
          {quickNav.map((n) => (
            <button
              key={n.tab}
              type="button"
              onClick={() => {
                setActiveTab(n.tab);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-900/90 text-left transition-colors"
            >
              <span className="text-xs font-medium text-slate-100">{n.label}</span>
              <span className="text-[11px] font-mono text-slate-500">{n.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
