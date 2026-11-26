import { describe, expect, it } from 'vitest';
import type { LiveTransaction } from '../src/shared/types';
import {
  buildAccountFlowGraph,
  computeMempoolSummary,
  isKnownBlackholeAddress,
  parseFeeRpcResponse,
  simulateAmmLpYield,
  validatePaymentChannelCreate,
  validateRegularKeyRotation,
} from '../src/shared/v024Utils';

const sampleTx = (patch: Partial<LiveTransaction>): LiveTransaction => ({
  id: 'tx-1',
  hash: 'AAAA',
  txType: 'Payment',
  category: 'payment',
  account: 'rCenter111111111111111111111111111',
  destination: 'rPeerA1111111111111111111111111111',
  amountDisplay: '100 XRP',
  amountXrpEstimate: 100,
  feeDrops: 12,
  validated: false,
  timestamp: Date.now(),
  isWhale: false,
  ...patch,
});

describe('v0.2.4-beta Track 1: Live Mempool & Fee-Pressure Radar', () => {
  it('parses rippled fee RPC payload and classifies congested vs calm mempool', () => {
    const metrics = parseFeeRpcResponse({
      result: {
        drops: { open_ledger_fee: '600', median_fee: '50', minimum_fee: '10' },
        current_queue_size: '60',
        max_queue_size: '100',
        current_ledger_size: '80',
        expected_ledger_size: '100',
      },
    });
    expect(metrics).not.toBeNull();
    expect(metrics!.openLedgerFeeDrops).toBe(600);

    const summary = computeMempoolSummary(
      [
        sampleTx({ id: 'p1', validated: false, isWhale: true, amountXrpEstimate: 250_000 }),
        sampleTx({ id: 'v1', validated: true, isWhale: true, amountXrpEstimate: 999_999 }),
      ],
      metrics
    );
    expect(summary.pendingCount).toBe(1);
    expect(summary.pendingWhaleCount).toBe(1);
    expect(summary.pendingXrpVolume).toBe(250_000);
    expect(summary.queueFillPct).toBe(60);
    expect(summary.pressureLevel).toBe('congested');
  });
});

describe('v0.2.4-beta Track 2: XLS-30 AMM Impermanent Loss & LP Yield Simulator', () => {
  it('computes exact constant-product impermanent loss (-5.72% at 2x price move) and fee APR', () => {
    const res = simulateAmmLpYield({
      depositXrpTotal: 10_000,
      poolTvlXrp: 90_000, // 10% share post-deposit
      dailyVolumeXrp: 100_000,
      tradingFeeBps: 30, // 0.30% -> 300 XRP/day pool fees -> 30 XRP/day LP share
      priceChangePct: 100, // 2x price ratio -> IL = 2*sqrt(2)/3 - 1 = -5.72%
      holdingDays: 30,
    });

    expect(res.priceRatio).toBe(2);
    expect(res.impermanentLossPct).toBeCloseTo(-5.72, 1);
    expect(res.poolSharePct).toBeCloseTo(10, 2);
    expect(res.dailyFeeYieldXrp).toBeCloseTo(30, 1);
    expect(res.projectedFeeYieldXrp).toBeCloseTo(900, 1);
    expect(res.estimatedAprPct).toBeCloseTo(109.5, 1);
    expect(res.breakEvenDays).toBeGreaterThan(0);
  });

  it('reports zero impermanent loss and immediate break-even when price is unchanged', () => {
    const res = simulateAmmLpYield({
      depositXrpTotal: 1000,
      poolTvlXrp: 50_000,
      dailyVolumeXrp: 20_000,
      tradingFeeBps: 30,
      priceChangePct: 0,
      holdingDays: 30,
    });
    expect(res.impermanentLossPct).toBe(0);
    expect(res.breakEvenDays).toBe(0);
    expect(res.netVsHodlXrp).toBeGreaterThan(0);
  });
});

describe('v0.2.4-beta Track 3: Payment Channels & RegularKey Rotation Validators', () => {
  it('validates PaymentChannelCreate parameters strictly', () => {
    const valid = validatePaymentChannelCreate({
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountXrp: '50',
      settleDelaySec: 3600,
      publicKeyHex: 'ED' + 'A'.repeat(64),
    });
    expect(valid.ok).toBe(true);

    const badPub = validatePaymentChannelCreate({
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountXrp: '50',
      settleDelaySec: 3600,
      publicKeyHex: '1234',
    });
    expect(badPub.ok).toBe(false);

    const badDelay = validatePaymentChannelCreate({
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amountXrp: '50',
      settleDelaySec: 10,
      publicKeyHex: 'ED' + 'A'.repeat(64),
    });
    expect(badDelay.ok).toBe(false);
  });

  it('detects blackhole addresses, self-assignment, and removal on SetRegularKey', () => {
    expect(isKnownBlackholeAddress('rrrrrrrrrrrrrrrrrrrrrhoLvTp')).toBe(true);

    const selfErr = validateRegularKeyRotation({
      account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      regularKey: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    });
    expect(selfErr.ok).toBe(false);

    const bhWarn = validateRegularKeyRotation({
      account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      regularKey: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp',
    });
    expect(bhWarn.ok).toBe(true);
    expect(bhWarn.warning).toContain('BLACKHOLE');

    const removeWarn = validateRegularKeyRotation({
      account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      regularKey: '',
    });
    expect(removeWarn.ok).toBe(true);
    expect(removeWarn.isRemoval).toBe(true);
  });
});

describe('v0.2.4-beta Track 4: Account Fund-Flow Counterparty Graph', () => {
  it('aggregates inbound, outbound, and bidirectional flows sorted by total XRP volume', () => {
    const center = 'rCenter111111111111111111111111111';
    const graph = buildAccountFlowGraph(center, [
      sampleTx({ id: '1', account: center, destination: 'rOut1', amountXrpEstimate: 500 }),
      sampleTx({ id: '2', account: 'rIn1', destination: center, amountXrpEstimate: 1200 }),
      sampleTx({ id: '3', account: center, destination: 'rBoth1', amountXrpEstimate: 300 }),
      sampleTx({ id: '4', account: 'rBoth1', destination: center, amountXrpEstimate: 400 }),
    ]);

    expect(graph.totalInboundXrp).toBe(1600);
    expect(graph.totalOutboundXrp).toBe(800);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges[0].counterparty).toBe('rIn1');
    expect(graph.edges[0].direction).toBe('in');
    expect(graph.edges[1].counterparty).toBe('rBoth1');
    expect(graph.edges[1].direction).toBe('both');
    expect(graph.edges[2].counterparty).toBe('rOut1');
    expect(graph.edges[2].direction).toBe('out');
  });
});
