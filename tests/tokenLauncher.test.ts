import { describe, expect, it } from 'vitest';
import { buildXrplTransactionFromIntent } from '../electron/walletVaultService';
import {
  buildTokenLaunchSteps,
  computeInitialAmmPrice,
  DEFAULT_TOKEN_LAUNCH_DRAFT,
  decodeTransferRate,
  encodeTransferRate,
  estimateTokenLaunchCost,
  TOKEN_LAUNCH_PRESETS,
  validateCurrencyCode,
} from '../src/shared/tokenLauncherUtils';

describe('v0.2.1-beta Token Launcher & Wizard Utilities', () => {
  it('validates and encodes standard 3-char and 160-bit non-standard XRPL currency codes', () => {
    const std = validateCurrencyCode('usd');
    expect(std.valid).toBe(true);
    expect(std.kind).toBe('standard-3');
    expect(std.encodedCode).toBe('USD');

    const rlusd = validateCurrencyCode('RLUSD');
    expect(rlusd.valid).toBe(true);
    expect(rlusd.kind).toBe('hex-160');
    expect(rlusd.encodedCode).toBe('524C555344000000000000000000000000000000');

    const rawHex = validateCurrencyCode('524c555344000000000000000000000000000000');
    expect(rawHex.valid).toBe(true);
    expect(rawHex.encodedCode).toBe('524C555344000000000000000000000000000000');

    expect(validateCurrencyCode('').valid).toBe(false);
    expect(validateCurrencyCode('XRP').valid).toBe(false);
    expect(validateCurrencyCode('xrp').valid).toBe(false);
    expect(validateCurrencyCode('THIS_CURRENCY_CODE_IS_WAY_TOO_LONG').valid).toBe(false);
  });

  it('encodes and decodes XRPL TransferRate percentages accurately and rejects out-of-range values', () => {
    expect(encodeTransferRate(0)).toBe(0);
    expect(encodeTransferRate(0.5)).toBe(1_005_000_000);
    expect(encodeTransferRate(100)).toBe(2_000_000_000);

    expect(decodeTransferRate(0)).toBe(0);
    expect(decodeTransferRate(1_005_000_000)).toBe(0.5);
    expect(decodeTransferRate(1_001_000_000)).toBe(0.1);

    expect(() => encodeTransferRate(-0.1)).toThrow();
    expect(() => encodeTransferRate(100.1)).toThrow();
  });

  it('estimates XRP reserves and fees for IOU, IOU+AMM, and MPT launches', () => {
    const iouBasic = estimateTokenLaunchCost({
      ...DEFAULT_TOKEN_LAUNCH_DRAFT,
      standard: 'IOU',
      seedAmmPool: false,
    });
    expect(iouBasic.issuerReserveXrp).toBe(1);
    expect(iouBasic.distributorReserveXrp).toBe(1.2);
    expect(iouBasic.ammReserveAndLiquidityXrp).toBe(0);
    expect(iouBasic.stepCount).toBe(3);

    const iouAmm = estimateTokenLaunchCost({
      ...DEFAULT_TOKEN_LAUNCH_DRAFT,
      standard: 'IOU',
      enableClawback: true,
      seedAmmPool: true,
      ammXrpAmount: '50',
    });
    expect(iouAmm.ammReserveAndLiquidityXrp).toBe(50.2);
    expect(iouAmm.stepCount).toBe(5);
    expect(iouAmm.totalXrpNeeded).toBeGreaterThan(52.4);

    const mptCost = estimateTokenLaunchCost({
      ...DEFAULT_TOKEN_LAUNCH_DRAFT,
      standard: 'MPT',
      domain: 'treasury.example.com',
    });
    expect(mptCost.issuerReserveXrp).toBe(1.2);
    expect(mptCost.distributorReserveXrp).toBe(0);
    expect(mptCost.stepCount).toBe(2);
  });

  it('computes initial AMM price and implied FDV cleanly', () => {
    const summary = computeInitialAmmPrice('100000', '50', '1000000', 2.5);
    expect(summary.valid).toBe(true);
    expect(summary.xrpPerToken).toBeCloseTo(0.0005, 8);
    expect(summary.tokensPerXrp).toBeCloseTo(2000, 6);
    expect(summary.impliedFdvXrp).toBeCloseTo(500, 6);
    expect(summary.impliedFdvUsd).toBeCloseTo(1250, 6);

    expect(computeInitialAmmPrice('0', '50', '1000000').valid).toBe(false);
    expect(computeInitialAmmPrice('100', '-5', '1000000').valid).toBe(false);
  });

  it('builds ordered IOU launch steps splitting AccountSet flags and appending TrustSet, Payment, and AMMCreate', () => {
    const steps = buildTokenLaunchSteps({
      ...DEFAULT_TOKEN_LAUNCH_DRAFT,
      standard: 'IOU',
      currencyCode: 'PULSE',
      totalSupply: '1000000',
      issuerAddress: 'rIssuer111111111111111111111111111',
      distributorAddress: 'rDist22222222222222222222222222222',
      enableDefaultRipple: true,
      enableClawback: true,
      enableNoFreeze: true, // mutually exclusive with Clawback on XRPL; Clawback takes precedence
      seedAmmPool: true,
      ammTokenAmount: '250000',
      ammXrpAmount: '50',
      ammTradingFeeBps: 0, // 0% LP fee must be preserved, not coerced to 50
    });

    expect(steps.map((s) => s.txType)).toEqual([
      'AccountSet', // DefaultRipple + Domain + TransferRate + TickSize
      'AccountSet', // Clawback (NoFreeze skipped due to XRPL mutual exclusion)
      'TrustSet', // Distributor TrustLine
      'Payment', // Issuer -> Distributor mint
      'AMMCreate', // Distributor seeds AMM
    ]);
    expect(steps[0].signerRole).toBe('issuer');
    expect(steps[2].signerRole).toBe('distributor');
    expect(steps[3].signerRole).toBe('issuer');
    expect(steps[4].signerRole).toBe('distributor');
    expect(steps[4].intent.kind === 'AMMCreate' && steps[4].intent.tradingFeeBps).toBe(0);
  });

  it('inserts Issuer tfSetfAuth TrustSet before minting when RequireAuth is enabled', () => {
    const draft = {
      ...DEFAULT_TOKEN_LAUNCH_DRAFT,
      standard: 'IOU' as const,
      currencyCode: 'USDX',
      totalSupply: '1000000',
      issuerAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      distributorAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
      enableRequireAuth: true,
      enableClawback: true,
      enableNoFreeze: false,
      seedAmmPool: false,
    };
    const steps = buildTokenLaunchSteps(draft);
    const est = estimateTokenLaunchCost(draft);

    expect(steps.length).toBe(est.stepCount);
    expect(steps.map((s) => s.id)).toEqual([
      'iou-issuer-config',
      'iou-flag-clawback',
      'iou-flag-require-auth',
      'iou-trustline',
      'iou-authorize-distributor',
      'iou-mint-payment',
    ]);

    const authStep = steps[4];
    expect(authStep.signerRole).toBe('issuer');
    expect(authStep.intent.kind).toBe('TrustSet');
    const builtAuth = buildXrplTransactionFromIntent(authStep.intent);
    expect(builtAuth.tx.TransactionType).toBe('TrustSet');
    expect(builtAuth.tx.Flags).toBe(0x00010000); // tfSetfAuth
  });

  it('builds MPT (XLS-33) launch steps and verifies presets are valid', () => {
    expect(TOKEN_LAUNCH_PRESETS.length).toBeGreaterThanOrEqual(3);
    const mptSteps = buildTokenLaunchSteps({
      ...DEFAULT_TOKEN_LAUNCH_DRAFT,
      standard: 'MPT',
      currencyCode: 'TBILL',
      totalSupply: '100000000',
      assetScale: 2,
      issuerAddress: 'rIssuer111111111111111111111111111',
      domain: 'tbill.example.com',
    });
    expect(mptSteps.map((s) => s.txType)).toEqual(['MPTokenIssuanceCreate', 'AccountSet']);
  });

  it('encodes extended AccountSet fields (TransferRate, TickSize, asfNoFreeze, asfRequireAuth) in WalletVaultService', () => {
    const built = buildXrplTransactionFromIntent({
      kind: 'AccountSet',
      account: 'rIssuer111111111111111111111111111',
      domain: 'token.example.com',
      transferRatePercent: 0.25,
      tickSize: 5,
      enableDefaultRipple: true,
    });
    expect(built.tx.TransactionType).toBe('AccountSet');
    expect(built.tx.SetFlag).toBe(8);
    expect(built.tx.TransferRate).toBe(1_002_500_000);
    expect(built.tx.TickSize).toBe(5);
    expect(built.tx.Domain).toBe('746F6B656E2E6578616D706C652E636F6D');

    const noFreeze = buildXrplTransactionFromIntent({
      kind: 'AccountSet',
      account: 'rIssuer111111111111111111111111111',
      enableNoFreeze: true,
    });
    expect(noFreeze.tx.SetFlag).toBe(6);

    const reqAuth = buildXrplTransactionFromIntent({
      kind: 'AccountSet',
      account: 'rIssuer111111111111111111111111111',
      enableRequireAuth: true,
    });
    expect(reqAuth.tx.SetFlag).toBe(2);
  });
});
