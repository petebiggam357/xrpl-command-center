import { describe, expect, it } from 'vitest';
import type { AmendmentVoteRecord } from '../src/shared/types';
import {
  getVaultLendingAmendmentStatus,
  isValidLedgerObjectHex,
  parseVaultInfoRpc,
  simulateVaultYieldAndWaterfall,
} from '../src/shared/vaultLendingUtils';

describe('v0.2.6-beta XLS-65 Single Asset Vaults & XLS-66 Native Lending Protocol', () => {
  it('detects SingleAssetVault (XLS-65) and LendingProtocol (XLS-66) live amendment voting status', () => {
    const records: AmendmentVoteRecord[] = [
      {
        id: 'A1',
        name: 'SingleAssetVault',
        enabled: true,
        supported: true,
        count: 30,
        threshold: 28,
        percent: 85.7,
      },
      {
        id: 'A2',
        name: 'LendingProtocol',
        enabled: false,
        supported: true,
        count: 25,
        threshold: 28,
        percent: 71.4,
      },
    ];
    const st = getVaultLendingAmendmentStatus(records);
    expect(st.singleAssetVault.status).toBe('enabled');
    expect(st.lendingProtocol.status).toBe('voting');
    expect(st.lendingProtocol.votePct).toBeCloseTo(71.4, 1);
  });

  it('validates 64-hex ledger object IDs strictly', () => {
    expect(isValidLedgerObjectHex('A'.repeat(64))).toBe(true);
    expect(isValidLedgerObjectHex('short')).toBe(false);
    expect(isValidLedgerObjectHex('Z'.repeat(64))).toBe(false);
  });

  it('models zero-default vault yield accurately after LoanBroker management fee', () => {
    const res = simulateVaultYieldAndWaterfall({
      vaultTotalAssets: 90_000,
      yourDeposit: 10_000, // 10% share of 100k TVL
      loanUtilizationPct: 100,
      loanAprPct: 10,
      termDays: 365,
      brokerManagementFeePct: 10, // 10% of 10k interest = 1k fee -> 9k net to vault -> 900 to you
      brokerFirstLossCover: 15_000,
      defaultShockPct: 0,
    });
    expect(res.yourSharePct).toBeCloseTo(10, 2);
    expect(res.grossInterest).toBeCloseTo(10_000, 1);
    expect(res.brokerMgmtFee).toBeCloseTo(1_000, 1);
    expect(res.yourProjectedInterest).toBeCloseTo(900, 1);
    expect(res.netDepositorApyPct).toBeCloseTo(9, 1);
    expect(res.depositorPrincipalLoss).toBe(0);
  });

  it('protects depositors when default shock is within LoanBroker First-Loss Cover', () => {
    const res = simulateVaultYieldAndWaterfall({
      vaultTotalAssets: 400_000,
      yourDeposit: 100_000,
      loanUtilizationPct: 100, // 500k active loans
      loanAprPct: 8,
      termDays: 90,
      brokerManagementFeePct: 10,
      brokerFirstLossCover: 60_000,
      defaultShockPct: 10, // 50k default <= 60k broker cover
    });
    expect(res.defaultLossPrincipal).toBeCloseTo(50_000, 1);
    expect(res.brokerCoverAbsorbed).toBeCloseTo(50_000, 1);
    expect(res.depositorPrincipalLoss).toBe(0);
    expect(res.yourPrincipalLoss).toBe(0);
    expect(res.coverProtectedDepositors).toBe(true);
  });

  it('spills excess default loss pro-rata onto depositors when shock exceeds First-Loss Cover', () => {
    const res = simulateVaultYieldAndWaterfall({
      vaultTotalAssets: 400_000,
      yourDeposit: 100_000, // 20% share
      loanUtilizationPct: 100, // 500k active loans
      loanAprPct: 8,
      termDays: 90,
      brokerManagementFeePct: 10,
      brokerFirstLossCover: 25_000,
      defaultShockPct: 20, // 100k default -> 25k broker, 75k depositors -> 15k your loss
    });
    expect(res.brokerCoverAbsorbed).toBeCloseTo(25_000, 1);
    expect(res.depositorPrincipalLoss).toBeCloseTo(75_000, 1);
    expect(res.yourPrincipalLoss).toBeCloseTo(15_000, 1);
    expect(res.coverProtectedDepositors).toBe(false);
  });

  it('parses live vault_info RPC response cleanly', () => {
    const parsed = parseVaultInfoRpc(
      {
        result: {
          vault: {
            index: 'B'.repeat(64),
            Owner: 'rVaultOwner11111111111111111111111',
            Account: 'rVaultPseudo1111111111111111111111',
            Asset: { currency: 'RLUSD', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' },
            AssetsTotal: '250000',
            AssetsAvailable: '100000',
            AssetsMaximum: '1000000',
            ShareMPTID: 'C'.repeat(48),
            Flags: 0x00010000,
            DomainID: 'D'.repeat(64),
          },
        },
      },
      'B'.repeat(64)
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.isPrivate).toBe(true);
    expect(parsed!.assetLabel).toContain('RLUSD');
    expect(parsed!.assetsTotal).toBe('250000');
  });
});
