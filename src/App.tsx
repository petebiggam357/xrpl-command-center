import React, { useEffect } from 'react';
import { AnalyticsDeck } from './components/AnalyticsDeck';
import { CommandPalette } from './components/CommandPalette';
import { ConsensusCoreCanvas } from './components/ConsensusCoreCanvas';
import { InspectorDrawer } from './components/InspectorDrawer';
import { LedgerRibbon } from './components/LedgerRibbon';
import { LiveTxFeed } from './components/LiveTxFeed';
import { NodeOpsDeck } from './components/NodeOpsDeck';
import { PrimitivesDeck } from './components/PrimitivesDeck';
import { QuickStartModal } from './components/QuickStartModal';
import { SidebarNav } from './components/SidebarNav';
import { TokenExplorer } from './components/TokenExplorer';
import { TopHudBar } from './components/TopHudBar';
import { TxConfirmModal } from './components/TxConfirmModal';
import { TxParticleRiver } from './components/TxParticleRiver';
import { ValidatorDeck } from './components/ValidatorDeck';
import { ValidatorGlobe3D } from './components/ValidatorGlobe3D';
import { WalletDeck } from './components/WalletDeck';
import { emitVisualLedgerPulse, emitVisualTx } from './services/streamVisualBus';
import { getXrplBridge } from './services/xrplBridge';
import type { LiveTransaction, ValidationPulse } from './shared/types';
import { useCommandStore } from './store/useCommandStore';

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

    void store.refreshValidators();
    void store.refreshTokens();
    void store.refreshVaultStatus();
    void store.refreshMarketPrice();
    void store.refreshAmendments();

    const priceTimer = setInterval(() => {
      void useCommandStore.getState().refreshMarketPrice();
    }, 60_000);

    return () => {
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

          {activeTab === 'globe' && <ValidatorGlobe3D />}
          {activeTab === 'validators' && <ValidatorDeck />}
          {activeTab === 'tokens' && <TokenExplorer />}
          {activeTab === 'wallets' && <WalletDeck />}
          {activeTab === 'primitives' && <PrimitivesDeck />}
          {activeTab === 'nodeops' && <NodeOpsDeck />}
          {activeTab === 'analytics' && <AnalyticsDeck />}
        </main>
      </div>

      <InspectorDrawer />
      <CommandPalette />
      <TxConfirmModal />
      <QuickStartModal />
    </div>
  );
};

export default App;
