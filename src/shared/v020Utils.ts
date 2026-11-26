import { serializeRowsToCsv } from './studioUtils';
import type {
  LiveTransaction,
  PriceAlertRule,
  WalletJournalRow,
  WalletTokenBalance,
} from './types';

export interface AllocationSlice {
  label: string;
  valueUsd: number;
  pct: number;
  color: string;
}

export interface TrendingTokenItem {
  key: string;
  currency: string;
  issuer: string;
  txCount: number;
}

export interface FeePressureStatus {
  baseDrops: number;
  effectiveDrops: number;
  loadFactor: number;
  level: 'low' | 'elevated' | 'high';
}

const SLICE_COLORS = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#f472b6', '#60a5fa'];

export function evaluatePriceAlerts(
  currentXrpUsd: number | null,
  rules: PriceAlertRule[]
): PriceAlertRule[] {
  if (currentXrpUsd === null || !Number.isFinite(currentXrpUsd) || currentXrpUsd <= 0) {
    return [];
  }
  return rules.filter((r) => {
    if (!r.active || r.triggeredAt) return false;
    if (r.direction === 'above') return currentXrpUsd >= r.targetUsd;
    return currentXrpUsd <= r.targetUsd;
  });
}

export function computeAssetAllocation(
  totalXrp: number,
  xrpUsd: number | null,
  tokens: WalletTokenBalance[]
): AllocationSlice[] {
  const price = xrpUsd && xrpUsd > 0 ? xrpUsd : 1;
  const raw: Array<{ label: string; valueUsd: number }> = [];

  if (totalXrp > 0) {
    raw.push({ label: 'XRP', valueUsd: totalXrp * price });
  }

  for (const tok of tokens) {
    const bal = Math.abs(Number(tok.balance) || 0);
    if (bal <= 0) continue;
    const isUsdStable = tok.currency === 'RLUSD' || tok.currency === 'USD' || tok.currency === 'USDC';
    const estUsd = isUsdStable ? bal : bal * 0.25;
    raw.push({ label: tok.currency, valueUsd: estUsd });
  }

  const totalUsd = raw.reduce((acc, item) => acc + item.valueUsd, 0);
  if (totalUsd <= 0) return [];

  return raw
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, 6)
    .map((item, idx) => ({
      label: item.label,
      valueUsd: Number(item.valueUsd.toFixed(2)),
      pct: Number(((item.valueUsd / totalUsd) * 100).toFixed(1)),
      color: SLICE_COLORS[idx % SLICE_COLORS.length],
    }));
}

export function computeTrendingTokens(
  transactions: LiveTransaction[],
  windowMs = 5 * 60 * 1000
): TrendingTokenItem[] {
  const cutoff = Date.now() - windowMs;
  const map = new Map<string, TrendingTokenItem>();

  for (const tx of transactions) {
    if (tx.timestamp < cutoff) continue;
    if (!tx.currency || tx.currency === 'XRP' || !tx.issuer) continue;
    const key = `${tx.currency}:${tx.issuer}`;
    const existing = map.get(key);
    if (existing) {
      existing.txCount += 1;
    } else {
      map.set(key, {
        key,
        currency: tx.currency,
        issuer: tx.issuer,
        txCount: 1,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.txCount - a.txCount)
    .slice(0, 6);
}

export function computeFeePressure(baseDrops: number, loadFactor: number): FeePressureStatus {
  const safeBase = Math.max(10, Math.round(baseDrops || 10));
  const safeLoad = Math.max(1, Number.isFinite(loadFactor) ? loadFactor : 1);
  const effectiveDrops = Math.round(safeBase * safeLoad);
  const level: FeePressureStatus['level'] =
    safeLoad >= 4 || effectiveDrops >= 200
      ? 'high'
      : safeLoad >= 1.5 || effectiveDrops >= 30
        ? 'elevated'
        : 'low';

  return {
    baseDrops: safeBase,
    effectiveDrops,
    loadFactor: Number(safeLoad.toFixed(2)),
    level,
  };
}

/**
 * Generates a CoinTracker / Koinly-friendly RFC-4180 CSV from the local SQLite wallet journal.
 */
export function buildTaxReadyCsv(rows: WalletJournalRow[]): string {
  const headers = [
    'Date (UTC)',
    'Type',
    'Sent Quantity',
    'Sent Currency',
    'Received Quantity',
    'Received Currency',
    'Fee Amount',
    'Fee Currency',
    'TxHash',
    'Notes',
  ];

  const csvRows = rows.map((r) => {
    const iso = new Date(r.timestamp).toISOString().replace('T', ' ').slice(0, 19);
    const feeXrp = (r.feeDrops / 1_000_000).toFixed(6);
    return [
      iso,
      r.txType,
      r.amountDisplay,
      r.network.toUpperCase(),
      '',
      '',
      feeXrp,
      'XRP',
      r.hash,
      `${r.status} | ${r.account} -> ${r.destination || 'ledger'}`,
    ];
  });

  return serializeRowsToCsv(headers, csvRows);
}

/**
 * Redacts any accidental XRPL family seeds or secret-looking tokens before exporting diagnostics.
 */
export function redactDiagnosticText(input: string): string {
  return input
    .replace(/\bsEd[1-9A-HJ-NP-Za-km-z]{25,35}\b/g, '[REDACTED_ED25519_SEED]')
    .replace(/\bs[1-9A-HJ-NP-Za-km-z]{27,34}\b/g, '[REDACTED_XRPL_SEED]');
}
