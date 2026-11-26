import { describe, expect, it } from 'vitest';
import {
  buildTaxReadyCsv,
  computeAssetAllocation,
  computeFeePressure,
  computeTrendingTokens,
  evaluatePriceAlerts,
  redactDiagnosticText,
} from '../src/shared/v020Utils';
import type { LiveTransaction, PriceAlertRule, WalletJournalRow, WalletTokenBalance } from '../src/shared/types';

describe('v0.2.0-beta Feature Utilities', () => {
  describe('evaluatePriceAlerts', () => {
    const rules: PriceAlertRule[] = [
      { id: '1', symbol: 'XRP', direction: 'above', targetUsd: 2.5, active: true, createdAt: 1000 },
      { id: '2', symbol: 'XRP', direction: 'below', targetUsd: 1.8, active: true, createdAt: 1000 },
      { id: '3', symbol: 'XRP', direction: 'above', targetUsd: 1.0, active: false, createdAt: 1000 },
      {
        id: '4',
        symbol: 'XRP',
        direction: 'above',
        targetUsd: 1.0,
        active: true,
        triggeredAt: 2000,
        createdAt: 1000,
      },
    ];

    it('triggers matching active untriggered rules for above and below targets', () => {
      const aboveHits = evaluatePriceAlerts(2.6, rules);
      expect(aboveHits.map((r) => r.id)).toEqual(['1']);

      const belowHits = evaluatePriceAlerts(1.75, rules);
      expect(belowHits.map((r) => r.id)).toEqual(['2']);
    });

    it('returns empty array for null, zero, negative, or NaN prices', () => {
      expect(evaluatePriceAlerts(null, rules)).toEqual([]);
      expect(evaluatePriceAlerts(0, rules)).toEqual([]);
      expect(evaluatePriceAlerts(-1, rules)).toEqual([]);
      expect(evaluatePriceAlerts(Number.NaN, rules)).toEqual([]);
    });
  });

  describe('computeAssetAllocation', () => {
    it('computes sorted percentage slices for XRP and IOU tokens', () => {
      const tokens: WalletTokenBalance[] = [
        {
          currency: 'RLUSD',
          currencyRaw: 'RLUSD',
          issuer: 'rIssuer1',
          balance: '500',
          limit: '10000',
          noRipple: false,
          authorized: false,
          freeze: false,
        },
        {
          currency: 'SOLO',
          currencyRaw: 'SOLO',
          issuer: 'rIssuer2',
          balance: '400',
          limit: '10000',
          noRipple: false,
          authorized: false,
          freeze: false,
        },
      ];
      // 100 XRP * $2.00 = $200, RLUSD = $500, SOLO = 400 * 0.25 = $100 => total $800
      const slices = computeAssetAllocation(100, 2.0, tokens);
      expect(slices.length).toBe(3);
      expect(slices[0].label).toBe('RLUSD');
      expect(slices[0].pct).toBe(62.5);
      expect(slices[1].label).toBe('XRP');
      expect(slices[1].pct).toBe(25);
      expect(slices[2].label).toBe('SOLO');
      expect(slices[2].pct).toBe(12.5);
    });

    it('returns empty array when portfolio has zero balance', () => {
      expect(computeAssetAllocation(0, 2.0, [])).toEqual([]);
    });
  });

  describe('computeTrendingTokens', () => {
    it('aggregates non-XRP token activity within the 5-minute window and ignores stale or XRP txs', () => {
      const now = Date.now();
      const baseTx = (overrides: Partial<LiveTransaction>): LiveTransaction => ({
        id: 'tx-1',
        hash: 'ABC',
        txType: 'Payment',
        category: 'payment',
        account: 'rAcc',
        amountDisplay: '100',
        amountXrpEstimate: 100,
        feeDrops: 12,
        validated: true,
        engineResult: 'tesSUCCESS',
        ledgerIndex: 100,
        timestamp: now - 10_000,
        isWhale: false,
        ...overrides,
      });

      const txs: LiveTransaction[] = [
        baseTx({ id: '1', currency: 'RLUSD', issuer: 'rRLUSD' }),
        baseTx({ id: '2', currency: 'RLUSD', issuer: 'rRLUSD' }),
        baseTx({ id: '3', currency: 'SOLO', issuer: 'rSOLO' }),
        baseTx({ id: '4', currency: 'XRP' }),
        baseTx({ id: '5', currency: 'OLD', issuer: 'rOLD', timestamp: now - 10 * 60 * 1000 }),
      ];

      const trending = computeTrendingTokens(txs, 5 * 60 * 1000);
      expect(trending.length).toBe(2);
      expect(trending[0].currency).toBe('RLUSD');
      expect(trending[0].txCount).toBe(2);
      expect(trending[1].currency).toBe('SOLO');
      expect(trending[1].txCount).toBe(1);
    });
  });

  describe('computeFeePressure', () => {
    it('classifies low, elevated, and high fee pressure accurately', () => {
      expect(computeFeePressure(10, 1).level).toBe('low');
      expect(computeFeePressure(10, 2).level).toBe('elevated');
      expect(computeFeePressure(12, 5).level).toBe('high');
      expect(computeFeePressure(0, Number.NaN)).toEqual({
        baseDrops: 10,
        effectiveDrops: 10,
        loadFactor: 1,
        level: 'low',
      });
    });
  });

  describe('buildTaxReadyCsv', () => {
    it('produces CoinTracker/Koinly-compatible headers and formatted fee in XRP', () => {
      const rows: WalletJournalRow[] = [
        {
          id: 1,
          timestamp: Date.UTC(2026, 10, 25, 12, 0, 0),
          network: 'mainnet',
          account: 'rSender',
          destination: 'rDest',
          txType: 'Payment',
          amountDisplay: '25.5 XRP',
          feeDrops: 12,
          hash: 'HASH123',
          status: 'tesSUCCESS',
        },
      ];
      const csv = buildTaxReadyCsv(rows);
      expect(csv).toContain('Date (UTC),Type,Sent Quantity,Sent Currency');
      expect(csv).toContain('2026-11-25 12:00:00');
      expect(csv).toContain('0.000012');
      expect(csv).toContain('HASH123');
    });
  });

  describe('redactDiagnosticText', () => {
    it('strips both Ed25519 (sEd...) and secp256k1 (s...) XRPL family seeds', () => {
      const raw =
        'Account rTest123 used seed sEd7rBGm5kxzauRTAV2hbsNz7N45X91 and backup s████████████ snh123456789ABCDEFGHJKLMNPQRStuv';
      const redacted = redactDiagnosticText(raw);
      expect(redacted).not.toContain('sEd7rBGm5kxzauRTAV2hbsNz7N45X91');
      expect(redacted).not.toContain('snh123456789ABCDEFGHJKLMNPQRStuv');
      expect(redacted).toContain('[REDACTED_ED25519_SEED]');
      expect(redacted).toContain('[REDACTED_XRPL_SEED]');
      expect(redacted).toContain('rTest123');
    });
  });
});
