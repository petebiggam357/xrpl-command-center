import { describe, expect, it } from 'vitest';
import type { WalletAccountPublic } from '../src/shared/types';
import {
  buildPayoutReceiptCsv,
  computeGroupTotals,
  parseBatchPayoutCsv,
  simulateTxDryRun,
  WALLET_GROUP_META,
} from '../src/shared/v022Utils';

describe('v0.2.2-beta Batch Airdrop & Multi-Recipient Payout CSV', () => {
  it('parses valid CSV with header, comments, and optional destination tags', () => {
    const csv = `destination,amount,destination_tag
# treasury payout
rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe,10.5,1001
rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh,25
rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe,4.5,0
`;
    const res = parseBatchPayoutCsv(csv);
    expect(res.validRows).toHaveLength(3);
    expect(res.invalidRows).toHaveLength(0);
    expect(res.totalAmount).toBe(40);
    expect(res.uniqueRecipients).toBe(2);
    expect(res.estimatedFeesXrp).toBeCloseTo(0.000036, 6);
    expect(res.validRows[0].destinationTag).toBe(1001);
    expect(res.validRows[1].destinationTag).toBeUndefined();
    expect(res.validRows[2].destinationTag).toBe(0);
  });

  it('rejects invalid addresses, non-positive amounts, and out-of-range destination tags', () => {
    const csv = `not_an_address,10
rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe,-5
rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe,0
rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe,10,4294967296
rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe,10,abc
`;
    const res = parseBatchPayoutCsv(csv);
    expect(res.validRows).toHaveLength(0);
    expect(res.invalidRows).toHaveLength(5);
    expect(res.invalidRows[0].reason).toContain('r-address');
    expect(res.invalidRows[1].reason).toContain('positive');
    expect(res.invalidRows[3].reason).toContain('uint32');
  });

  it('handles empty input cleanly', () => {
    const res = parseBatchPayoutCsv('');
    expect(res.validRows).toHaveLength(0);
    expect(res.invalidRows).toHaveLength(0);
    expect(res.totalAmount).toBe(0);
    expect(res.estimatedFeesXrp).toBe(0);
  });

  it('builds a downloadable payout receipt CSV', () => {
    const csv = buildPayoutReceiptCsv([
      {
        destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        amount: '10',
        currency: 'XRP',
        destinationTag: 1001,
        status: 'success',
        hash: 'ABCDEF1234',
      },
      {
        destination: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        amount: '25',
        currency: 'XRP',
        status: 'failed',
        error: 'tecUNFUNDED_PAYMENT',
      },
    ]);
    expect(csv).toContain('Destination,Amount,Currency,DestinationTag,Status,TxHash,Error');
    expect(csv).toContain('ABCDEF1234');
    expect(csv).toContain('tecUNFUNDED_PAYMENT');
  });
});

describe('v0.2.2-beta XRPL Transaction Dry-Run Simulator', () => {
  const SENDER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

  it('simulates a funded XRP Payment as tesSUCCESS with exact XRP delta', () => {
    const sim = simulateTxDryRun(
      {
        kind: 'Payment',
        account: SENDER,
        destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        asset: { currency: 'XRP', value: '12.5' },
      },
      100,
      12
    );
    expect(sim.projectedResult).toBe('tesSUCCESS');
    expect(sim.xrpDelta).toBe(-12.500012);
    expect(sim.reserveDeltaXrp).toBe(0);
    expect(sim.warnings).toHaveLength(0);
  });

  it('flags tecUNFUNDED_PAYMENT when spendable balance is insufficient', () => {
    const sim = simulateTxDryRun(
      {
        kind: 'Payment',
        account: SENDER,
        destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        asset: { currency: 'XRP', value: '50' },
      },
      10,
      12
    );
    expect(sim.projectedResult).toBe('tecUNFUNDED_PAYMENT');
    expect(sim.warnings.length).toBeGreaterThan(0);
  });

  it('flags tecDST_TAG_NEEDED when destination requires a tag and none is provided', () => {
    const sim = simulateTxDryRun(
      {
        kind: 'Payment',
        account: SENDER,
        destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        asset: { currency: 'XRP', value: '5' },
      },
      100,
      12,
      true
    );
    expect(sim.projectedResult).toBe('tecDST_TAG_NEEDED');
    expect(sim.warnings[0]).toContain('Destination Tag');
  });

  it('projects +0.2 XRP reserve for TrustSet create and -0.2 XRP for TrustSet remove', () => {
    const addSim = simulateTxDryRun(
      {
        kind: 'TrustSet',
        account: SENDER,
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        limit: '1000',
      },
      5
    );
    expect(addSim.projectedResult).toBe('tesSUCCESS');
    expect(addSim.reserveDeltaXrp).toBe(0.2);

    const rmSim = simulateTxDryRun(
      {
        kind: 'TrustSet',
        account: SENDER,
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        limit: '0',
      },
      5
    );
    expect(rmSim.reserveDeltaXrp).toBe(-0.2);
  });

  it('flags tecINSUFFICIENT_RESERVE when spendable XRP cannot cover new object reserve', () => {
    const sim = simulateTxDryRun(
      {
        kind: 'TrustSet',
        account: SENDER,
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        limit: '1000',
      },
      0.1,
      12
    );
    expect(sim.projectedResult).toBe('tecINSUFFICIENT_RESERVE');
  });

  it('flags tecUNFUNDED_PAYMENT when spendableXrp is known to be 0, but skips balance check when null', () => {
    const intent = {
      kind: 'Payment' as const,
      account: SENDER,
      destination: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      asset: { currency: 'XRP', value: '5' },
    };
    expect(simulateTxDryRun(intent, 0, 12).projectedResult).toBe('tecUNFUNDED_PAYMENT');
    expect(simulateTxDryRun(intent, null, 12).projectedResult).toBe('tesSUCCESS');
  });

  it('skips CSV header row even after leading comments or blank lines', () => {
    const csv = `\n# Batch 1\ndestination,amount,destination_tag\nrHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh,12.5,42\n`;
    const parsed = parseBatchPayoutCsv(csv);
    expect(parsed.validRows).toHaveLength(1);
    expect(parsed.invalidRows).toHaveLength(0);
    expect(parsed.validRows[0].destinationTag).toBe(42);
  });
});

describe('v0.2.2-beta Wallet Portfolio Groups', () => {
  const sampleAccounts: WalletAccountPublic[] = [
    {
      id: 'w1',
      label: 'Ledger Vault',
      address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      kind: 'hardware-ledger',
      createdAt: 1,
    },
    {
      id: 'w2',
      label: 'DEX Hot',
      address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      kind: 'custodial',
      createdAt: 2,
    },
    {
      id: 'w3',
      label: 'Unassigned',
      address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
      kind: 'watch-only',
      createdAt: 3,
    },
  ];

  it('computes per-group XRP and USD totals and defaults untagged accounts to general', () => {
    const totals = computeGroupTotals(
      sampleAccounts,
      {
        rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe: 1000,
        rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh: 250.5,
        rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH: 50,
      },
      {
        w1: 'cold-storage',
        w2: 'defi-hot',
      },
      2.0
    );

    expect(totals).toHaveLength(3);
    const cold = totals.find((t) => t.group === 'cold-storage');
    const hot = totals.find((t) => t.group === 'defi-hot');
    const general = totals.find((t) => t.group === 'general');

    expect(cold).toEqual({ group: 'cold-storage', count: 1, totalXrp: 1000, totalUsd: 2000 });
    expect(hot).toEqual({ group: 'defi-hot', count: 1, totalXrp: 250.5, totalUsd: 501 });
    expect(general).toEqual({ group: 'general', count: 1, totalXrp: 50, totalUsd: 100 });
    expect(WALLET_GROUP_META['cold-storage'].label).toBe('Cold Storage');
  });

  it('returns null totalUsd when xrpUsd price is unavailable', () => {
    const totals = computeGroupTotals(
      sampleAccounts.slice(0, 1),
      { rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe: 100 },
      { w1: 'issuer-treasury' },
      null
    );
    expect(totals[0].totalUsd).toBeNull();
  });
});
