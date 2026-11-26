import { describe, expect, it } from 'vitest';
import type { TokenOnLedgerReport, WalletPortfolioSnapshot } from '../src/shared/types';
import {
  buildAccountSecurityAuditMarkdown,
  buildEscrowVestingSchedule,
  computeClobVsAmmSpread,
  RPC_PLAYGROUND_PRESETS,
  validateRpcJsonParams,
} from '../src/shared/v023Utils';

describe('v0.2.3-beta Track 1: RPC Playground Presets & JSON Validator', () => {
  it('provides at least 8 valid rippled RPC presets', () => {
    expect(RPC_PLAYGROUND_PRESETS.length).toBeGreaterThanOrEqual(8);
    expect(RPC_PLAYGROUND_PRESETS.some((p) => p.command === 'amm_info')).toBe(true);
    expect(RPC_PLAYGROUND_PRESETS.some((p) => p.command === 'account_objects')).toBe(true);
  });

  it('validates empty, valid object, array, and malformed JSON params cleanly', () => {
    expect(validateRpcJsonParams('')).toEqual({ ok: true, params: {} });
    expect(validateRpcJsonParams('{"ledger_index":"validated","limit":10}')).toEqual({
      ok: true,
      params: { ledger_index: 'validated', limit: 10 },
    });

    const arrRes = validateRpcJsonParams('[1, 2, 3]');
    expect(arrRes.ok).toBe(false);

    const badRes = validateRpcJsonParams('{ bad json }');
    expect(badRes.ok).toBe(false);
  });
});

describe('v0.2.3-beta Track 2: Live CLOB vs. AMM Spread & Liquidity Radar', () => {
  const baseReport: TokenOnLedgerReport = {
    currency: 'RLUSD',
    currencyRaw: '524C555344000000000000000000000000000000',
    issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
    fetchedAt: Date.now(),
    xrpBalance: '1000',
    flags: {
      blackholed: false,
      disableMaster: false,
      globalFreeze: false,
      noFreeze: false,
      allowClawback: true,
      requireAuth: false,
      defaultRipple: true,
      depositAuth: false,
    },
    bids: [{ price: 0.49, size: 1000, total: 1000, account: 'rBid' }],
    asks: [{ price: 0.51, size: 1000, total: 1000, account: 'rAsk' }],
    amm: {
      account: 'rAmmPool',
      asset1Amount: '48,000 XRP',
      asset2Amount: '100,000 RLUSD',
      asset1Numeric: 48_000,
      asset2Numeric: 100_000,
      tradingFeeBps: 0.3, // 0.30% -> 30 bps
      lpTokenSupply: '69282',
    },
  };

  it('detects when AMM spot is cheaper than CLOB mid and computes net arb edge after LP fee', () => {
    // CLOB mid = 0.50 XRP/RLUSD, AMM spot = 0.48 XRP/RLUSD -> 4% cheaper on AMM, fee = 30 bps (0.30%)
    const res = computeClobVsAmmSpread(baseReport);
    expect(res.hasClob).toBe(true);
    expect(res.hasAmm).toBe(true);
    expect(res.clobMidPriceXrp).toBeCloseTo(0.5, 6);
    expect(res.ammSpotPriceXrp).toBeCloseTo(0.48, 6);
    expect(res.ammTradingFeeBps).toBe(30);
    expect(res.cheaperVenue).toBe('AMM');
    expect(res.absSpreadPct).toBeCloseTo(4, 2);
    expect(res.netArbEdgePct).toBeCloseTo(3.7, 2);
  });

  it('detects when CLOB is cheaper than AMM and handles single-venue fallback', () => {
    const clobCheaper = computeClobVsAmmSpread({
      ...baseReport,
      amm: { ...baseReport.amm!, asset1Numeric: 55_000, asset2Numeric: 100_000 },
    });
    expect(clobCheaper.cheaperVenue).toBe('CLOB');

    const noAmm = computeClobVsAmmSpread({ ...baseReport, amm: null });
    expect(noAmm.cheaperVenue).toBe('INSUFFICIENT_DATA');
    expect(noAmm.hasAmm).toBe(false);
  });
});

describe('v0.2.3-beta Track 3A: Multi-Tranche Escrow Vesting Schedule Builder', () => {
  it('splits uneven XRP totals accurately down to the exact drop with zero rounding drift', () => {
    const startMs = Date.UTC(2027, 0, 1, 12, 0, 0);
    const plan = buildEscrowVestingSchedule({
      account: 'rSender111111111111111111111111111',
      destination: 'rBeneficiary1111111111111111111111',
      totalXrp: 100,
      trancheCount: 3,
      intervalDays: 30,
      startUnixMs: startMs,
      cancelBufferDays: 60,
    });

    expect(plan.ok).toBe(true);
    expect(plan.tranches).toHaveLength(3);
    const sum = plan.tranches.reduce((acc, t) => acc + Number(t.amountXrp), 0);
    expect(sum).toBeCloseTo(100, 6);
    expect(plan.additionalReserveXrp).toBe(0.6);
    expect(plan.tranches[0].unlockDateIso).toBe('2027-01-01');
    expect(plan.tranches[1].finishAfterUnixMs - plan.tranches[0].finishAfterUnixMs).toBe(30 * 86_400_000);
    expect(plan.tranches[0].cancelAfterUnixMs).toBe(startMs + 60 * 86_400_000);
    expect(plan.tranches[2].intent.memoText).toBe('Vesting Tranche 3/3');
  });

  it('rejects invalid tranche counts or non-positive totals', () => {
    const badCount = buildEscrowVestingSchedule({
      account: 'rA',
      destination: 'rB',
      totalXrp: 500,
      trancheCount: 1,
      intervalDays: 30,
      startUnixMs: Date.now(),
    });
    expect(badCount.ok).toBe(false);

    const badAmount = buildEscrowVestingSchedule({
      account: 'rA',
      destination: 'rB',
      totalXrp: 0,
      trancheCount: 4,
      intervalDays: 30,
      startUnixMs: Date.now(),
    });
    expect(badAmount.ok).toBe(false);
  });
});

describe('v0.2.3-beta Track 3B: Account Security & Reserve Audit Markdown Generator', () => {
  it('generates a complete redacted Markdown report with flags, multi-sig, and reserve optimization hints', () => {
    const portfolio: WalletPortfolioSnapshot = {
      address: 'rTreasuryAudit11111111111111111111',
      funded: true,
      fetchedAt: Date.now(),
      totalXrp: 5000,
      totalXrpDisplay: '5,000',
      baseReserveXrp: 1,
      ownerReserveXrp: 0.6,
      spendableXrp: 4998.4,
      sequence: 42,
      ownerCount: 3,
      domain: 'treasury.example.org',
      flags: {
        blackholed: false,
        disableMaster: true,
        globalFreeze: false,
        noFreeze: true,
        allowClawback: false,
        requireAuth: false,
        defaultRipple: true,
        depositAuth: false,
        requireDestTag: true,
      },
      signerList: {
        signerQuorum: 2,
        signers: [
          { account: 'rSigner1', weight: 1 },
          { account: 'rSigner2', weight: 1 },
          { account: 'rSigner3', weight: 1 },
        ],
      },
      tokens: [
        {
          currency: 'RLUSD',
          currencyRaw: '524C555344000000000000000000000000000000',
          issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
          balance: '0',
          limit: '10000',
          noRipple: true,
          authorized: true,
          freeze: false,
        },
      ],
      offers: [],
      escrows: [
        {
          index: 'ESC1',
          account: 'rTreasuryAudit11111111111111111111',
          destination: 'rBeneficiary',
          amountXrp: '500',
          finishAfterMs: Date.UTC(2027, 5, 1),
          offerSequence: 41,
        },
      ],
      checks: [],
      nfts: [],
      recentTransactions: [],
    };

    const md = buildAccountSecurityAuditMarkdown(portfolio, {
      label: 'Primary Treasury',
      networkLabel: 'MAINNET (wss://xrplcluster.com)',
      xrpUsd: 2.5,
      generatedAtIso: '2026-11-26T18:00:00.000Z',
    });

    expect(md).toContain('# XRPL Account Security & Reserve Audit Report');
    expect(md).toContain('rTreasuryAudit11111111111111111111');
    expect(md).toContain('Quorum 2 (3 signers)');
    expect(md).toContain('RequireDestTag Enabled');
    expect(md).toContain('NoFreeze Enforced');
    expect(md).toContain('1 zero-balance TrustLine(s) detected');
    expect(md).toContain('0.2 XRP');
    expect(md).toContain('No private keys, seeds, or vault passphrases are included');
  });
});
