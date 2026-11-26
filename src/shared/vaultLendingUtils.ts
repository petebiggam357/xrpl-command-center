import type { AmendmentVoteRecord } from './types';

// ============================================================================
// XLS-65 Single Asset Vaults & XLS-66 Native Lending Protocol Engine
// ============================================================================

export interface AmendmentReadinessBadge {
  name: string;
  xls: 'XLS-65' | 'XLS-66';
  status: 'enabled' | 'voting' | 'pending';
  votePct: number;
  count: number;
  threshold: number;
}

export function getVaultLendingAmendmentStatus(amendments: AmendmentVoteRecord[]): {
  singleAssetVault: AmendmentReadinessBadge;
  lendingProtocol: AmendmentReadinessBadge;
} {
  const findBadge = (
    patterns: RegExp[],
    fallbackName: string,
    xls: 'XLS-65' | 'XLS-66'
  ): AmendmentReadinessBadge => {
    const match = amendments.find((a) => patterns.some((re) => re.test(a.name)));
    if (!match) {
      return {
        name: fallbackName,
        xls,
        status: 'pending',
        votePct: 0,
        count: 0,
        threshold: 28,
      };
    }
    const status: AmendmentReadinessBadge['status'] = match.enabled
      ? 'enabled'
      : match.count > 0
        ? 'voting'
        : 'pending';
    return {
      name: match.name,
      xls,
      status,
      votePct: match.percent,
      count: match.count,
      threshold: match.threshold,
    };
  };

  return {
    singleAssetVault: findBadge([/singleassetvault/i, /xls-?65/i, /^vault/i], 'SingleAssetVault', 'XLS-65'),
    lendingProtocol: findBadge([/lendingprotocol/i, /xls-?66/i, /^lending/i], 'LendingProtocol', 'XLS-66'),
  };
}

export function isValidLedgerObjectHex(id: string): boolean {
  return /^[0-9A-Fa-f]{64}$/.test(id.trim());
}

// ============================================================================
// XLS-65 + XLS-66 Yield & First-Loss Cover Waterfall Simulator
// ============================================================================

export interface VaultWaterfallInput {
  vaultTotalAssets: number; // Existing depositor liquidity in the XLS-65 Vault
  yourDeposit: number; // Your deposit into the vault
  loanUtilizationPct: number; // % of vault lent out via XLS-66 (0..100)
  loanAprPct: number; // Fixed interest rate paid by borrowers (e.g. 9.5%)
  termDays: number; // Loan term duration in days
  brokerManagementFeePct: number; // % of interest retained by LoanBroker (e.g. 10%)
  brokerFirstLossCover: number; // First-Loss capital posted by LoanBroker
  defaultShockPct: number; // Simulated borrower principal default % (0..100)
}

export interface VaultWaterfallResult {
  postDepositVaultTvl: number;
  yourSharePct: number;
  activeLoanPrincipal: number;
  grossInterest: number;
  brokerMgmtFee: number;
  netInterestToVault: number;
  yourProjectedInterest: number;
  netDepositorApyPct: number;
  defaultLossPrincipal: number;
  brokerCoverAbsorbed: number;
  depositorPrincipalLoss: number;
  yourPrincipalLoss: number;
  yourNetEndingBalance: number;
  yourNetPnl: number;
  coverProtectedDepositors: boolean;
}

export function simulateVaultYieldAndWaterfall(input: VaultWaterfallInput): VaultWaterfallResult {
  const existingVault = Math.max(0, Number.isFinite(input.vaultTotalAssets) ? input.vaultTotalAssets : 500_000);
  const yourDeposit = Math.max(1, Number.isFinite(input.yourDeposit) ? input.yourDeposit : 10_000);
  const utilization = Math.max(0, Math.min(100, Number.isFinite(input.loanUtilizationPct) ? input.loanUtilizationPct : 80));
  const apr = Math.max(0, Math.min(100, Number.isFinite(input.loanAprPct) ? input.loanAprPct : 9));
  const days = Math.max(1, Math.min(1825, Number.isFinite(input.termDays) ? input.termDays : 90));
  const mgmtFeePct = Math.max(0, Math.min(50, Number.isFinite(input.brokerManagementFeePct) ? input.brokerManagementFeePct : 10));
  const brokerCover = Math.max(0, Number.isFinite(input.brokerFirstLossCover) ? input.brokerFirstLossCover : 50_000);
  const shockPct = Math.max(0, Math.min(100, Number.isFinite(input.defaultShockPct) ? input.defaultShockPct : 0));

  const postDepositVaultTvl = existingVault + yourDeposit;
  const yourShare = yourDeposit / postDepositVaultTvl;
  const activeLoanPrincipal = postDepositVaultTvl * (utilization / 100);

  // Interest earned on the performing portion of the loan book
  const performingPrincipal = activeLoanPrincipal * (1 - shockPct / 100);
  const grossInterest = performingPrincipal * (apr / 100) * (days / 365);
  const brokerMgmtFee = grossInterest * (mgmtFeePct / 100);
  const netInterestToVault = grossInterest - brokerMgmtFee;
  const yourProjectedInterest = netInterestToVault * yourShare;

  // XLS-66 First-Loss Cover Waterfall:
  // LoanBroker's first-loss cover is slashed BEFORE regular XLS-65 depositors absorb any principal loss.
  const defaultLossPrincipal = activeLoanPrincipal * (shockPct / 100);
  const brokerCoverAbsorbed = Math.min(brokerCover, defaultLossPrincipal);
  const depositorPrincipalLoss = Math.max(0, defaultLossPrincipal - brokerCover);
  const yourPrincipalLoss = depositorPrincipalLoss * yourShare;

  const yourNetEndingBalance = Math.max(0, yourDeposit + yourProjectedInterest - yourPrincipalLoss);
  const yourNetPnl = yourNetEndingBalance - yourDeposit;
  const netDepositorApyPct =
    postDepositVaultTvl > 0
      ? ((netInterestToVault / postDepositVaultTvl) * (365 / days)) * 100
      : 0;

  return {
    postDepositVaultTvl: Number(postDepositVaultTvl.toFixed(2)),
    yourSharePct: Number((yourShare * 100).toFixed(4)),
    activeLoanPrincipal: Number(activeLoanPrincipal.toFixed(2)),
    grossInterest: Number(grossInterest.toFixed(2)),
    brokerMgmtFee: Number(brokerMgmtFee.toFixed(2)),
    netInterestToVault: Number(netInterestToVault.toFixed(2)),
    yourProjectedInterest: Number(yourProjectedInterest.toFixed(2)),
    netDepositorApyPct: Number(netDepositorApyPct.toFixed(2)),
    defaultLossPrincipal: Number(defaultLossPrincipal.toFixed(2)),
    brokerCoverAbsorbed: Number(brokerCoverAbsorbed.toFixed(2)),
    depositorPrincipalLoss: Number(depositorPrincipalLoss.toFixed(2)),
    yourPrincipalLoss: Number(yourPrincipalLoss.toFixed(2)),
    yourNetEndingBalance: Number(yourNetEndingBalance.toFixed(2)),
    yourNetPnl: Number(yourNetPnl.toFixed(2)),
    coverProtectedDepositors: defaultLossPrincipal > 0 && depositorPrincipalLoss === 0,
  };
}

// ============================================================================
// Live On-Ledger Vault / Loan RPC Parsers
// ============================================================================

export interface ParsedVaultSnapshot {
  vaultId: string;
  owner: string;
  account: string;
  assetLabel: string;
  assetsTotal: string;
  assetsAvailable: string;
  assetsMaximum: string;
  shareMptId: string;
  isPrivate: boolean;
  domainId?: string;
}

export function parseVaultInfoRpc(raw: Record<string, unknown>, fallbackVaultId: string): ParsedVaultSnapshot | null {
  const result = (raw.result ?? raw) as Record<string, unknown>;
  const node = (result.vault ?? result.node ?? result) as Record<string, unknown>;
  if (!node || typeof node !== 'object') return null;
  const owner = String(node.Owner ?? '');
  if (!owner && !node.AssetsTotal && !node.Asset) return null;

  const asset = (node.Asset ?? {}) as Record<string, unknown>;
  const assetLabel =
    typeof asset.currency === 'string'
      ? asset.currency === 'XRP'
        ? 'XRP'
        : `${asset.currency}${asset.issuer ? ` (${String(asset.issuer).slice(0, 8)}…)` : ''}`
      : 'XRP';
  const flags = Number(node.Flags ?? 0);

  return {
    vaultId: String(node.index ?? result.index ?? fallbackVaultId),
    owner: owner || '—',
    account: String(node.Account ?? '—'),
    assetLabel,
    assetsTotal: String(node.AssetsTotal ?? '0'),
    assetsAvailable: String(node.AssetsAvailable ?? '0'),
    assetsMaximum: String(node.AssetsMaximum ?? 'Unlimited'),
    shareMptId: String(node.ShareMPTID ?? '—'),
    isPrivate: Boolean(flags & 0x00010000),
    domainId: typeof node.DomainID === 'string' ? node.DomainID : undefined,
  };
}
