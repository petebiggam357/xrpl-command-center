import type { LiveTransaction } from './types';

// ============================================================================
// Track 1: Live XRPL Mempool & Open-Ledger Fee-Pressure Radar
// ============================================================================

export interface FeeRpcMetrics {
  openLedgerFeeDrops: number;
  medianFeeDrops: number;
  minimumFeeDrops: number;
  currentQueueSize: number;
  maxQueueSize: number;
  expectedLedgerSize: number;
  currentLedgerSize: number;
}

export interface MempoolSummary {
  pendingCount: number;
  pendingWhaleCount: number;
  pendingXrpVolume: number;
  queueFillPct: number;
  ledgerFillPct: number;
  openLedgerFeeDrops: number;
  medianFeeDrops: number;
  pressureLevel: 'calm' | 'busy' | 'congested';
  topPending: LiveTransaction[];
}

export function parseFeeRpcResponse(raw: Record<string, unknown>): FeeRpcMetrics | null {
  const result = (raw.result ?? raw) as Record<string, unknown>;
  const drops = (result.drops ?? {}) as Record<string, unknown>;
  const openFee = Number(drops.open_ledger_fee ?? 0);
  const medianFee = Number(drops.median_fee ?? 0);
  const minFee = Number(drops.minimum_fee ?? 10);
  if (!Number.isFinite(openFee) || openFee <= 0) return null;

  return {
    openLedgerFeeDrops: openFee,
    medianFeeDrops: Number.isFinite(medianFee) && medianFee > 0 ? medianFee : minFee,
    minimumFeeDrops: Number.isFinite(minFee) && minFee > 0 ? minFee : 10,
    currentQueueSize: Math.max(0, Number(result.current_queue_size ?? 0) || 0),
    maxQueueSize: Math.max(1, Number(result.max_queue_size ?? 1) || 1),
    expectedLedgerSize: Math.max(1, Number(result.expected_ledger_size ?? 50) || 50),
    currentLedgerSize: Math.max(0, Number(result.current_ledger_size ?? 0) || 0),
  };
}

export function computeMempoolSummary(
  transactions: LiveTransaction[],
  feeMetrics: FeeRpcMetrics | null
): MempoolSummary {
  const pending = transactions.filter((t) => !t.validated);
  let pendingWhaleCount = 0;
  let pendingXrpVolume = 0;

  for (const tx of pending) {
    if (tx.isWhale) pendingWhaleCount += 1;
    if (Number.isFinite(tx.amountXrpEstimate) && tx.amountXrpEstimate > 0) {
      pendingXrpVolume += tx.amountXrpEstimate;
    }
  }

  const openFee = feeMetrics?.openLedgerFeeDrops ?? 10;
  const medianFee = feeMetrics?.medianFeeDrops ?? 10;
  const queueFillPct = feeMetrics
    ? Math.min(100, Math.round((feeMetrics.currentQueueSize / feeMetrics.maxQueueSize) * 100))
    : 0;
  const ledgerFillPct = feeMetrics
    ? Math.min(100, Math.round((feeMetrics.currentLedgerSize / feeMetrics.expectedLedgerSize) * 100))
    : Math.min(100, pending.length * 4);

  let pressureLevel: MempoolSummary['pressureLevel'] = 'calm';
  if (openFee >= 500 || queueFillPct >= 50) {
    pressureLevel = 'congested';
  } else if (openFee >= 50 || queueFillPct >= 15 || ledgerFillPct >= 75) {
    pressureLevel = 'busy';
  }

  return {
    pendingCount: pending.length,
    pendingWhaleCount,
    pendingXrpVolume: Number(pendingXrpVolume.toFixed(2)),
    queueFillPct,
    ledgerFillPct,
    openLedgerFeeDrops: openFee,
    medianFeeDrops: medianFee,
    pressureLevel,
    topPending: pending.slice(0, 8),
  };
}

// ============================================================================
// Track 2: XLS-30 AMM Impermanent Loss & LP Yield Simulator
// ============================================================================

export interface AmmLpSimulationInput {
  depositXrpTotal: number; // Total deposit value expressed in XRP (50% XRP / 50% Token)
  poolTvlXrp: number; // Total pool value in XRP (2 * XRP reserve)
  dailyVolumeXrp: number; // Estimated 24h swap volume in XRP
  tradingFeeBps: number; // Pool fee in bps (e.g. 30 = 0.30%)
  priceChangePct: number; // Relative token/XRP price change (-80 to +400)
  holdingDays: number; // Number of days LP is held
}

export interface AmmLpSimulationResult {
  priceRatio: number;
  impermanentLossPct: number; // Negative or 0 (e.g. -5.72%)
  impermanentLossXrp: number; // Negative or 0 XRP vs HODL
  hodlValueXrp: number;
  lpValueBeforeFeesXrp: number;
  poolSharePct: number;
  dailyFeeYieldXrp: number;
  projectedFeeYieldXrp: number;
  estimatedAprPct: number;
  netLpValueXrp: number;
  netVsHodlXrp: number;
  breakEvenDays: number | null;
}

export function simulateAmmLpYield(input: AmmLpSimulationInput): AmmLpSimulationResult {
  const deposit = Math.max(1, Number.isFinite(input.depositXrpTotal) ? input.depositXrpTotal : 1000);
  const poolTvl = Math.max(deposit, Number.isFinite(input.poolTvlXrp) ? input.poolTvlXrp : 100_000);
  const dailyVol = Math.max(0, Number.isFinite(input.dailyVolumeXrp) ? input.dailyVolumeXrp : 0);
  const feeBps = Math.max(0, Math.min(100, Number.isFinite(input.tradingFeeBps) ? input.tradingFeeBps : 30));
  const clampedPricePct = Math.max(-90, Math.min(1000, Number.isFinite(input.priceChangePct) ? input.priceChangePct : 0));
  const days = Math.max(1, Math.min(3650, Number.isFinite(input.holdingDays) ? input.holdingDays : 30));

  const priceRatio = Math.max(0.05, 1 + clampedPricePct / 100);
  // Constant-product x*y=k LP value relative to 50/50 HODL:
  // HODL value = deposit * (0.5 + 0.5 * r)
  // LP value   = deposit * sqrt(r)
  const hodlValueXrp = deposit * (0.5 + 0.5 * priceRatio);
  const lpValueBeforeFeesXrp = deposit * Math.sqrt(priceRatio);
  const ilRatio = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1; // <= 0
  const impermanentLossPct = Number((ilRatio * 100).toFixed(2));
  const impermanentLossXrp = Number((lpValueBeforeFeesXrp - hodlValueXrp).toFixed(4));

  const postDepositTvl = poolTvl + deposit;
  const poolShare = deposit / postDepositTvl;
  const feeRate = feeBps / 10_000;
  const dailyFeeYieldXrp = Number((dailyVol * feeRate * poolShare).toFixed(4));
  const projectedFeeYieldXrp = Number((dailyFeeYieldXrp * days).toFixed(4));
  const estimatedAprPct = Number(((dailyFeeYieldXrp * 365 / deposit) * 100).toFixed(2));

  const netLpValueXrp = Number((lpValueBeforeFeesXrp + projectedFeeYieldXrp).toFixed(4));
  const netVsHodlXrp = Number((netLpValueXrp - hodlValueXrp).toFixed(4));

  const ilLossMagnitude = Math.abs(impermanentLossXrp);
  const breakEvenDays =
    ilLossMagnitude <= 0.0001
      ? 0
      : dailyFeeYieldXrp > 0
        ? Math.ceil(ilLossMagnitude / dailyFeeYieldXrp)
        : null;

  return {
    priceRatio: Number(priceRatio.toFixed(4)),
    impermanentLossPct,
    impermanentLossXrp,
    hodlValueXrp: Number(hodlValueXrp.toFixed(4)),
    lpValueBeforeFeesXrp: Number(lpValueBeforeFeesXrp.toFixed(4)),
    poolSharePct: Number((poolShare * 100).toFixed(4)),
    dailyFeeYieldXrp,
    projectedFeeYieldXrp,
    estimatedAprPct,
    netLpValueXrp,
    netVsHodlXrp,
    breakEvenDays,
  };
}

// ============================================================================
// Track 3: Payment Channels & RegularKey Rotation Validators
// ============================================================================

const KNOWN_BLACKHOLE_ADDRESSES = new Set([
  'rrrrrrrrrrrrrrrrrrrrrhoLvTp',
  'rrrrrrrrrrrrrrrrrrrrBZbvji',
  'rrrrrrrrrrrrrrrrrNAMEtxvNvQ',
  'rrrrrrrrrrrrrrrrrrrn5RM1rHd',
]);

export function isKnownBlackholeAddress(address: string): boolean {
  return KNOWN_BLACKHOLE_ADDRESSES.has(address.trim());
}

export function validatePaymentChannelCreate(params: {
  destination: string;
  amountXrp: string;
  settleDelaySec: number;
  publicKeyHex: string;
}): { ok: boolean; error?: string } {
  const dest = params.destination.trim();
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(dest)) {
    return { ok: false, error: 'Destination must be a valid classic XRPL r-address.' };
  }
  const amt = Number(params.amountXrp);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, error: 'Channel funding amount must be a positive XRP value.' };
  }
  if (!Number.isInteger(params.settleDelaySec) || params.settleDelaySec < 60) {
    return { ok: false, error: 'Settle delay must be at least 60 seconds.' };
  }
  const pub = params.publicKeyHex.trim();
  if (!/^(ED|02|03)[0-9A-Fa-f]{64}$/.test(pub)) {
    return {
      ok: false,
      error: 'Public key must be a 66-char hex XRPL public key starting with ED, 02, or 03.',
    };
  }
  return { ok: true };
}

export function validateRegularKeyRotation(params: {
  account: string;
  regularKey: string;
}): { ok: boolean; warning?: string; error?: string; isRemoval: boolean } {
  const rk = params.regularKey.trim();
  if (!rk) {
    return {
      ok: true,
      isRemoval: true,
      warning: 'Leaving RegularKey blank will REMOVE the active RegularKey and revert to master-key signing.',
    };
  }
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(rk)) {
    return { ok: false, isRemoval: false, error: 'RegularKey must be a valid classic XRPL r-address.' };
  }
  if (rk === params.account.trim()) {
    return { ok: false, isRemoval: false, error: 'RegularKey cannot be the same as the account itself.' };
  }
  if (isKnownBlackholeAddress(rk)) {
    return {
      ok: true,
      isRemoval: false,
      warning:
        'DANGER: This is a known XRPL BLACKHOLE address. Combined with DisableMaster, this permanently locks the account.',
    };
  }
  return { ok: true, isRemoval: false };
}

// ============================================================================
// Track 4: Account Fund-Flow Counterparty Graph Builder
// ============================================================================

export interface AccountFlowEdge {
  counterparty: string;
  inboundXrp: number;
  outboundXrp: number;
  totalVolumeXrp: number;
  txCount: number;
  direction: 'in' | 'out' | 'both';
}

export interface AccountFlowGraph {
  centerAccount: string;
  edges: AccountFlowEdge[];
  totalInboundXrp: number;
  totalOutboundXrp: number;
  maxEdgeVolumeXrp: number;
}

export function buildAccountFlowGraph(
  centerAccount: string,
  transactions: LiveTransaction[],
  maxNodes = 8
): AccountFlowGraph {
  const center = centerAccount.trim();
  const map = new Map<string, { inboundXrp: number; outboundXrp: number; txCount: number }>();

  let totalInboundXrp = 0;
  let totalOutboundXrp = 0;

  for (const tx of transactions) {
    const src = tx.account?.trim();
    const dst = tx.destination?.trim();
    if (!src || !dst || src === dst) continue;

    const vol = Number.isFinite(tx.amountXrpEstimate) && tx.amountXrpEstimate > 0 ? tx.amountXrpEstimate : 0;

    if (src === center) {
      const prev = map.get(dst) ?? { inboundXrp: 0, outboundXrp: 0, txCount: 0 };
      prev.outboundXrp += vol;
      prev.txCount += 1;
      map.set(dst, prev);
      totalOutboundXrp += vol;
    } else if (dst === center) {
      const prev = map.get(src) ?? { inboundXrp: 0, outboundXrp: 0, txCount: 0 };
      prev.inboundXrp += vol;
      prev.txCount += 1;
      map.set(src, prev);
      totalInboundXrp += vol;
    }
  }

  const edges: AccountFlowEdge[] = Array.from(map.entries())
    .map(([counterparty, stats]) => {
      const totalVolumeXrp = stats.inboundXrp + stats.outboundXrp;
      const direction: AccountFlowEdge['direction'] =
        stats.inboundXrp > 0 && stats.outboundXrp > 0
          ? 'both'
          : stats.inboundXrp > 0
            ? 'in'
            : 'out';
      return {
        counterparty,
        inboundXrp: Number(stats.inboundXrp.toFixed(4)),
        outboundXrp: Number(stats.outboundXrp.toFixed(4)),
        totalVolumeXrp: Number(totalVolumeXrp.toFixed(4)),
        txCount: stats.txCount,
        direction,
      };
    })
    .sort((a, b) => b.totalVolumeXrp - a.totalVolumeXrp || b.txCount - a.txCount)
    .slice(0, maxNodes);

  const maxEdgeVolumeXrp = edges.reduce((m, e) => Math.max(m, e.totalVolumeXrp), 0);

  return {
    centerAccount: center,
    edges,
    totalInboundXrp: Number(totalInboundXrp.toFixed(4)),
    totalOutboundXrp: Number(totalOutboundXrp.toFixed(4)),
    maxEdgeVolumeXrp,
  };
}
