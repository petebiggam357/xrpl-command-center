import React, { lazy, Suspense, useEffect } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { ConsensusCoreCanvas } from './components/ConsensusCoreCanvas';
import { InspectorDrawer } from './components/InspectorDrawer';
import { LedgerRibbon } from './components/LedgerRibbon';
import { LiveTxFeed } from './components/LiveTxFeed';
import { PerfHudPill } from './components/PerfHudPill';
import { QuickStartModal } from './components/QuickStartModal';
import { SidebarNav } from './components/SidebarNav';
import { TopHudBar } from './components/TopHudBar';
import { TxConfirmModal } from './components/TxConfirmModal';
import { TxParticleRiver } from './components/TxParticleRiver';
import { emitVisualLedgerPulse, emitVisualTx } from './services/streamVisualBus';
import { getXrplBridge } from './services/xrplBridge';
import type { LiveTransaction, ValidationPulse } from './shared/types';
import { useCommandStore } from './store/useCommandStore';

// Code-split secondary decks so cold startup only parses & executes the Command Deck
const ValidatorGlobe3D = lazy(() =>
  import('./components/ValidatorGlobe3D').then((m) => ({ default: m.ValidatorGlobe3D }))
);
const ValidatorDeck = lazy(() =>
  import('./components/ValidatorDeck').then((m) => ({ default: m.ValidatorDeck }))
);
const TokenExplorer = lazy(() =>
  import('./components/TokenExplorer').then((m) => ({ default: m.TokenExplorer }))
);
const TokenLauncherDeck = lazy(() =>
  import('./components/TokenLauncherDeck').then((m) => ({ default: m.TokenLauncherDeck }))
);
const WalletDeck = lazy(() =>
  import('./components/WalletDeck').then((m) => ({ default: m.WalletDeck }))
);
const PrimitivesDeck = lazy(() =>
  import('./components/PrimitivesDeck').then((m) => ({ default: m.PrimitivesDeck }))
);
const DevRpcDeck = lazy(() =>
  import('./components/DevRpcDeck').then((m) => ({ default: m.DevRpcDeck }))
);
const NodeOpsDeck = lazy(() =>
  import('./components/NodeOpsDeck').then((m) => ({ default: m.NodeOpsDeck }))
);
const AnalyticsDeck = lazy(() =>
  import('./components/AnalyticsDeck').then((m) => ({ default: m.AnalyticsDeck }))
);
const EducationDeck = lazy(() =>
  import('./components/EducationDeck').then((m) => ({ default: m.EducationDeck }))
);

const DeckFallback: React.FC = () => (
  <div className="hud-panel rounded-xl p-10 text-center font-mono text-xs text-cyan-300">
    Loading module…
  </div>
);

export const App: React.FC = () => {
  const activeTab = useCommandStore((s) => s.activeTab);
  const nodeAutoPoll = useCommandStore((s) => s.nodeAutoPoll);

  useEffect(() => {
    const bridge = getXrplBridge();
    const store = useCommandStore.getState();

    // Batch high-frequency stream events into Zustand at ~6.5 Hz so React DOM diffing
    // never starves 60fps Canvas animations, while feeding canvases immediately via visual bus.
    let pendingTxs: LiveTransaction[] = [];
    let pendingVals: ValidationPulse[] = [];

    const flushTimer = setInterval(() => {
      if (pendingTxs.length > 0) {
        const batch = pendingTxs;
        pendingTxs = [];
        useCommandStore.getState().ingestTransactionBatch(batch);
      }
      if (pendingVals.length > 0) {
        const batch = pendingVals;
        pendingVals = [];
        useCommandStore.getState().ingestValidationBatch(batch);
      }
    }, 150);

    const unsubs = [
      bridge.onStreamStatus((st) => useCommandStore.getState().ingestStreamStatus(st)),
      bridge.onLedgerClosed((l) => {
        emitVisualLedgerPulse();
        useCommandStore.getState().ingestLedger(l);
      }),
      bridge.onTransaction((tx) => {
        emitVisualTx(tx);
        pendingTxs.push(tx);
        if (pendingTxs.length > 250) {
          pendingTxs.splice(0, pendingTxs.length - 250);
        }
      }),
      bridge.onValidation((v) => {
        pendingVals.push(v);
        if (pendingVals.length > 120) {
          pendingVals.splice(0, pendingVals.length - 120);
        }
      }),
      bridge.onConsensusPhase((p) => useCommandStore.getState().ingestConsensusPhase(p)),
    ];

    void bridge.getStreamStatus().then((st) => {
      useCommandStore.getState().ingestStreamStatus(st);
      if (!bridge.isElectron && !st.connected) {
        void bridge.connectNetwork('mainnet');
      }
    });

    void store.refreshVaultStatus();
    void store.refreshMarketPrice();

    // Defer heavier directory fetches slightly so first paint of Command Deck is instantaneous
    const deferredInit = setTimeout(() => {
      const st = useCommandStore.getState();
      void st.refreshValidators();
      void st.refreshTokens();
      void st.refreshAmendments();
    }, 300);

    const priceTimer = setInterval(() => {
      void useCommandStore.getState().refreshMarketPrice();
    }, 60_000);

    return () => {
      clearTimeout(deferredInit);
      clearInterval(flushTimer);
      clearInterval(priceTimer);
      for (const u of unsubs) u();
    };
  }, []);

  useEffect(() => {
    if (!nodeAutoPoll) return;
    void useCommandStore.getState().pollOwnNode();
    const timer = setInterval(() => {
      void useCommandStore.getState().pollOwnNode();
    }, 5_000);
    return () => clearInterval(timer);
  }, [nodeAutoPoll]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const st = useCommandStore.getState();
        st.setCommandPaletteOpen(!st.commandPaletteOpen);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        useCommandStore.getState().toggleSidebar();
      } else if (e.key === 'Escape') {
        const st = useCommandStore.getState();
        if (st.commandPaletteOpen) st.setCommandPaletteOpen(false);
        else if (st.pendingTxIntent) st.closeTxConfirmModal();
        else if (st.inspectorOpen) st.closeInspector();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col hud-grid-bg text-slate-100 overflow-hidden">
      <TopHudBar />

      <div className="flex-1 flex min-h-0">
        <SidebarNav />

        <main className="flex-1 min-w-0 overflow-y-auto p-4">
          {activeTab === 'command' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <div className="xl:col-span-5">
                  <ConsensusCoreCanvas />
                </div>
                <div className="xl:col-span-7">
                  <TxParticleRiver />
                </div>
              </div>
              <LedgerRibbon />
              <LiveTxFeed />
            </div>
          )}

          {activeTab !== 'command' && (
            <Suspense fallback={<DeckFallback />}>
              {activeTab === 'globe' && <ValidatorGlobe3D />}
              {activeTab === 'validators' && <ValidatorDeck />}
              {activeTab === 'tokens' && <TokenExplorer />}
              {activeTab === 'launcher' && <TokenLauncherDeck />}
              {activeTab === 'wallets' && <WalletDeck />}
              {activeTab === 'primitives' && <PrimitivesDeck />}
              {activeTab === 'rpc' && <DevRpcDeck />}
              {activeTab === 'nodeops' && <NodeOpsDeck />}
              {activeTab === 'analytics' && <AnalyticsDeck />}
              {activeTab === 'education' && <EducationDeck />}
            </Suspense>
          )}
        </main>
      </div>

      <InspectorDrawer />
      <CommandPalette />
      <TxConfirmModal />
      <QuickStartModal />
      <PerfHudPill />
    </div>
  );
};

export default App;
