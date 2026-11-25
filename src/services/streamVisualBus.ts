import type { LiveTransaction } from '../shared/types';

type TxListener = (tx: LiveTransaction) => void;
type PulseListener = () => void;

const txListeners = new Set<TxListener>();
const ledgerPulseListeners = new Set<PulseListener>();

export function emitVisualTx(tx: LiveTransaction): void {
  for (const fn of txListeners) {
    fn(tx);
  }
}

export function subscribeVisualTx(fn: TxListener): () => void {
  txListeners.add(fn);
  return () => {
    txListeners.delete(fn);
  };
}

export function emitVisualLedgerPulse(): void {
  for (const fn of ledgerPulseListeners) {
    fn();
  }
}

export function subscribeVisualLedgerPulse(fn: PulseListener): () => void {
  ledgerPulseListeners.add(fn);
  return () => {
    ledgerPulseListeners.delete(fn);
  };
}
