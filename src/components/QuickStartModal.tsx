import React, { useState } from 'react';
import {
  BookOpen,
  Compass,
  FlaskConical,
  KeyRound,
  Radio,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { useCommandStore } from '../store/useCommandStore';

export const QuickStartModal: React.FC = () => {
  const quickStartOpen = useCommandStore((s) => s.quickStartOpen);
  const dismissQuickStart = useCommandStore((s) => s.dismissQuickStart);
  const connectNetwork = useCommandStore((s) => s.connectNetwork);
  const setActiveTab = useCommandStore((s) => s.setActiveTab);

  const [launchingSandbox, setLaunchingSandbox] = useState(false);

  if (!quickStartOpen) return null;

  const handleLaunchTestnetPlayground = async () => {
    setLaunchingSandbox(true);
    try {
      await connectNetwork('testnet');
      setActiveTab('wallets');
      dismissQuickStart();
    } finally {
      setLaunchingSandbox(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="hud-panel w-full max-w-2xl rounded-2xl border border-cyan-400/35 p-6 shadow-2xl relative">
        <button
          type="button"
          onClick={dismissQuickStart}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
          title="Close Quick-Start"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/25 to-emerald-500/20 border border-cyan-400/40 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400">
              XRPL Command Center • v0.1.1-beta
            </div>
            <h2 className="text-lg font-bold text-white">
              Welcome to Your XRPL Mission Control
            </h2>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          100% free, open-source, and self-custodial. Stream live Mainnet/Testnet consensus at 60fps,
          manage wallets in a process-isolated Rust Argon2id vault, explore tokens &amp; AMMs, and
          operate your own <code className="text-cyan-300">rippled</code> node.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
            <Radio className="w-4 h-4 text-cyan-400 mb-1.5" />
            <div className="text-xs font-semibold text-white">Live Command Deck</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Click any flowing particle, ledger block, or press <kbd className="px-1 rounded bg-slate-800 text-slate-200">Ctrl+K</kbd> to inspect any address, hash, or ledger.
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
            <KeyRound className="w-4 h-4 text-emerald-400 mb-1.5" />
            <div className="text-xs font-semibold text-white">Rust Vault &amp; DeFi</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Keys stay in the isolated Rust sidecar with Zeroize RAM wiping. Export encrypted <code className="text-emerald-300">.xrplvault</code> backups in 1 click.
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
            <Compass className="w-4 h-4 text-violet-400 mb-1.5" />
            <div className="text-xs font-semibold text-white">Validators &amp; Nodes</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Track 3D UNL consensus, live protocol Amendment voting progress, and spin up local Docker <code className="text-violet-300">rippled</code> nodes.
            </p>
          </div>
        </div>

        {/* Plain-English XRPL Safety Cheat Sheet */}
        <div className="rounded-xl bg-amber-500/5 border border-amber-400/25 p-3.5 mb-5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-amber-300">
            <ShieldAlert className="w-3.5 h-3.5" />
            Quick XRPL Cheat Sheet (Good to Know)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
            <div>
              <span className="text-cyan-300 font-semibold">Account Reserve:</span> Every XRPL
              account holds <span className="font-mono text-white">1 XRP</span> base reserve +{' '}
              <span className="font-mono text-white">0.2 XRP</span> per Trustline, DEX offer, or
              NFT page.
            </div>
            <div>
              <span className="text-amber-300 font-semibold">Destination Tags:</span> Sending to an
              exchange (Coinbase, Kraken, Bitstamp, etc.) requires a Destination Tag — our Send
              guard warns you automatically!
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={launchingSandbox}
            onClick={() => void handleLaunchTestnetPlayground()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
          >
            <FlaskConical className="w-4 h-4" />
            {launchingSandbox
              ? 'Switching to Testnet...'
              : 'Launch 1-Click Testnet Playground (Free Practice XRP)'}
          </button>

          <button
            type="button"
            onClick={dismissQuickStart}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Jump Into Mainnet Command Deck
          </button>
        </div>
      </div>
    </div>
  );
};
