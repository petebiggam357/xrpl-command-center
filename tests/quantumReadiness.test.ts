import { describe, expect, it } from 'vitest';
import { assessQuantumExposure, VAULT_PQC_POSTURE } from '../src/shared/quantumUtils';
import type { WalletPortfolioSnapshot } from '../src/shared/types';
import { buildAccountSecurityAuditMarkdown } from '../src/shared/v023Utils';

const makePortfolio = (patch: Partial<WalletPortfolioSnapshot> = {}): WalletPortfolioSnapshot => ({
  address: 'rColdVault111111111111111111111111',
  funded: true,
  fetchedAt: Date.now(),
  totalXrp: 25_000,
  totalXrpDisplay: '25,000',
  baseReserveXrp: 1,
  ownerReserveXrp: 0,
  spendableXrp: 24_999,
  sequence: 100,
  ownerCount: 0,
  flags: {
    blackholed: false,
    disableMaster: false,
    globalFreeze: false,
    noFreeze: false,
    allowClawback: false,
    requireAuth: false,
    defaultRipple: false,
    depositAuth: false,
  },
  tokens: [],
  offers: [],
  escrows: [],
  checks: [],
  nfts: [],
  recentTransactions: [],
  ...patch,
});

describe('v0.2.9-beta Post-Quantum Exposure & Crypto-Agility Suite', () => {
  it('classifies an unspent receive-only funded wallet as PQ-SHIELDED (PubKey Hidden)', () => {
    const res = assessQuantumExposure(
      makePortfolio({
        recentTransactions: [
          {
            id: 'in-1',
            hash: 'AAAA',
            txType: 'Payment',
            category: 'payment',
            account: 'rExchangeSender1111111111111111111',
            destination: 'rColdVault111111111111111111111111',
            amountDisplay: '25,000 XRP',
            amountXrpEstimate: 25_000,
            feeDrops: 12,
            validated: true,
            timestamp: Date.now(),
            isWhale: false,
          },
        ],
      })
    );
    expect(res.status).toBe('shielded');
    expect(res.pubKeyExposed).toBe(false);
    expect(res.score).toBeGreaterThanOrEqual(95);
    expect(res.badgeLabel).toContain('PQ-SHIELDED');
  });

  it('flags a high-value spent wallet with outgoing classical tx as PUBKEY EXPOSED and recommends cold sweep', () => {
    const res = assessQuantumExposure(
      makePortfolio({
        totalXrp: 25_000,
        recentTransactions: [
          {
            id: 'out-1',
            hash: 'BBBB',
            txType: 'Payment',
            category: 'payment',
            account: 'rColdVault111111111111111111111111',
            destination: 'rDest11111111111111111111111111111',
            amountDisplay: '100 XRP',
            amountXrpEstimate: 100,
            feeDrops: 12,
            validated: true,
            timestamp: Date.now(),
            isWhale: false,
            raw: { SigningPubKey: 'ED' + 'A'.repeat(64) },
          },
        ],
      })
    );
    expect(res.status).toBe('exposed-high-value');
    expect(res.pubKeyExposed).toBe(true);
    expect(res.exposedOutgoingTxCount).toBe(1);
    expect(res.recommendations.some((r) => r.includes('PQ Cold Vault'))).toBe(true);
  });

  it('awards higher readiness score when Multi-Sig and RegularKey rotation are configured', () => {
    const base = assessQuantumExposure(
      makePortfolio({
        totalXrp: 1_000,
        recentTransactions: [
          {
            id: 'o1',
            hash: 'C',
            txType: 'Payment',
            category: 'payment',
            account: 'rColdVault111111111111111111111111',
            destination: 'rDest',
            amountDisplay: '10 XRP',
            amountXrpEstimate: 10,
            feeDrops: 12,
            validated: true,
            timestamp: Date.now(),
            isWhale: false,
          },
        ],
      })
    );
    const hardened = assessQuantumExposure(
      makePortfolio({
        totalXrp: 1_000,
        flags: { ...makePortfolio().flags, regularKey: 'rRegKey11111111111111111111111111' },
        signerList: { signerQuorum: 2, signers: [{ account: 'rS1', weight: 1 }, { account: 'rS2', weight: 1 }] },
        recentTransactions: [
          {
            id: 'o1',
            hash: 'C',
            txType: 'Payment',
            category: 'payment',
            account: 'rColdVault111111111111111111111111',
            destination: 'rDest',
            amountDisplay: '10 XRP',
            amountXrpEstimate: 10,
            feeDrops: 12,
            validated: true,
            timestamp: Date.now(),
            isWhale: false,
          },
        ],
      })
    );
    expect(hardened.score).toBeGreaterThan(base.score);
  });

  it('handles unfunded and blackholed accounts with 100/100 zero-exposure score', () => {
    expect(assessQuantumExposure(makePortfolio({ funded: false })).status).toBe('unfunded');
    expect(
      assessQuantumExposure(makePortfolio({ flags: { ...makePortfolio().flags, blackholed: true } })).status
    ).toBe('immutable');
  });

  it('embeds Post-Quantum Readiness & Public-Key Exposure section inside Security Audit Markdown', () => {
    const md = buildAccountSecurityAuditMarkdown(makePortfolio(), {
      label: 'PQ Cold Vault',
      networkLabel: 'MAINNET',
      xrpUsd: 2.5,
    });
    expect(md).toContain('## 3. Post-Quantum Readiness & Public-Key Exposure');
    expect(md).toContain('PQ-SHIELDED (PUBKEY HIDDEN)');
    expect(md).toContain('AES-256-GCM');
  });

  it('exposes accurate Rust Vault symmetric PQC posture metadata', () => {
    expect(VAULT_PQC_POSTURE.atRestCipher).toContain('AES-256-GCM');
    expect(VAULT_PQC_POSTURE.backupIntegrity).toContain('SHA-512');
    expect(VAULT_PQC_POSTURE.xrplMigrationPath).toContain('ML-DSA');
  });
});
