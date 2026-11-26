import { encodeCurrencyCode } from './xrplCodec';
import type { WalletTxIntent } from './types';

export type TokenStandard = 'IOU' | 'MPT';

export interface TokenLaunchDraft {
  standard: TokenStandard;
  // Identity & Tokenomics
  currencyCode: string;
  tokenName: string;
  description: string;
  totalSupply: string;
  assetScale: number; // MPT only (0..19)
  transferFeePercent: number; // IOU: 0..100%, MPT: 0..50% (bps = pct * 100)
  tickSize: number; // IOU only: 0 (disabled) or 3..15
  domain: string;
  orgName: string;
  orgEmail: string;
  // Wallets
  issuerAddress: string;
  distributorAddress: string;
  // Governance Flags
  enableDefaultRipple: boolean;
  enableClawback: boolean;
  enableRequireAuth: boolean;
  enableNoFreeze: boolean;
  // MPT-specific Flags
  mptCanTransfer: boolean;
  mptCanTrade: boolean;
  mptCanEscrow: boolean;
  mptCanLock: boolean;
  // Optional XLS-30 AMM Liquidity Seed (IOU only)
  seedAmmPool: boolean;
  ammTokenAmount: string;
  ammXrpAmount: string;
  ammTradingFeeBps: number; // 0..100 bps (0%..1%)
}

export interface CurrencyValidationResult {
  valid: boolean;
  kind?: 'standard-3' | 'hex-160';
  displayCode: string;
  encodedCode?: string;
  error?: string;
}

export interface TokenLaunchCostEstimate {
  issuerReserveXrp: number;
  distributorReserveXrp: number;
  ammReserveAndLiquidityXrp: number;
  estimatedTxFeesXrp: number;
  totalXrpNeeded: number;
  stepCount: number;
}

export interface AmmInitialPriceSummary {
  valid: boolean;
  xrpPerToken: number;
  tokensPerXrp: number;
  impliedFdvXrp: number;
  impliedFdvUsd?: number;
}

export interface TokenLaunchStep {
  id: string;
  order: number;
  title: string;
  subtitle: string;
  signerRole: 'issuer' | 'distributor';
  signerAddress: string;
  txType: WalletTxIntent['kind'];
  intent: WalletTxIntent;
  warning?: string;
}

export interface TokenLaunchPreset {
  id: string;
  label: string;
  badge: string;
  summary: string;
  patch: Partial<TokenLaunchDraft>;
}

export const DEFAULT_TOKEN_LAUNCH_DRAFT: TokenLaunchDraft = {
  standard: 'IOU',
  currencyCode: 'MYTKN',
  tokenName: 'My XRPL Token',
  description: 'Community utility token launched with XRPL Command Center.',
  totalSupply: '1000000',
  assetScale: 2,
  transferFeePercent: 0,
  tickSize: 5,
  domain: 'example.com',
  orgName: 'My XRPL Project',
  orgEmail: 'ops@example.com',
  issuerAddress: '',
  distributorAddress: '',
  enableDefaultRipple: true,
  enableClawback: false,
  enableRequireAuth: false,
  enableNoFreeze: false,
  mptCanTransfer: true,
  mptCanTrade: true,
  mptCanEscrow: false,
  mptCanLock: false,
  seedAmmPool: false,
  ammTokenAmount: '100000',
  ammXrpAmount: '25',
  ammTradingFeeBps: 50,
};

export const TOKEN_LAUNCH_PRESETS: TokenLaunchPreset[] = [
  {
    id: 'community-iou',
    label: 'Community / Meme Token',
    badge: 'IOU + AMM',
    summary: 'Fixed-supply XRPL IOU with 0% transfer fee, DefaultRipple enabled, and optional XLS-30 AMM pool.',
    patch: {
      standard: 'IOU',
      currencyCode: 'PULSE',
      tokenName: 'Pulse Community Token',
      totalSupply: '10000000',
      transferFeePercent: 0,
      tickSize: 5,
      enableDefaultRipple: true,
      enableClawback: false,
      enableRequireAuth: false,
      enableNoFreeze: false,
      seedAmmPool: true,
      ammTokenAmount: '2000000',
      ammXrpAmount: '50',
      ammTradingFeeBps: 50,
    },
  },
  {
    id: 'regulated-rwa',
    label: 'Regulated Stablecoin / RWA',
    badge: 'IOU + Clawback',
    summary: 'Compliance-ready issuer with DefaultRipple, XLS-39 Clawback, RequireAuth, and xrp-ledger.toml domain linking.',
    patch: {
      standard: 'IOU',
      currencyCode: 'USDX',
      tokenName: 'Regulated USD Reserve',
      totalSupply: '1000000',
      transferFeePercent: 0.1,
      tickSize: 6,
      enableDefaultRipple: true,
      enableClawback: true,
      enableRequireAuth: true,
      enableNoFreeze: false,
      seedAmmPool: false,
    },
  },
  {
    id: 'institutional-mpt',
    label: 'Institutional MPT (XLS-33)',
    badge: 'Native MPT',
    summary: 'Next-gen Multi-Purpose Token with native scale, max supply cap, JSON metadata, and protocol transfer fee.',
    patch: {
      standard: 'MPT',
      currencyCode: 'TBILL',
      tokenName: 'Treasury Bill MPT',
      totalSupply: '100000000',
      assetScale: 2,
      transferFeePercent: 0.1,
      enableClawback: true,
      enableRequireAuth: false,
      mptCanTransfer: true,
      mptCanTrade: true,
      mptCanEscrow: true,
      mptCanLock: true,
      seedAmmPool: false,
    },
  },
];

/**
 * Validate an XRPL token currency code (standard 3-char ASCII or non-standard 4..20 UTF-8 bytes -> 40-hex).
 */
export function validateCurrencyCode(rawInput: string): CurrencyValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, displayCode: '', error: 'Currency code is required.' };
  }
  if (trimmed.toUpperCase() === 'XRP') {
    return { valid: false, displayCode: 'XRP', error: 'XRP is the native XRPL asset and cannot be issued as a token.' };
  }

  // Direct 40-hex currency code
  if (/^[0-9A-Fa-f]{40}$/.test(trimmed)) {
    return {
      valid: true,
      kind: 'hex-160',
      displayCode: trimmed.toUpperCase(),
      encodedCode: trimmed.toUpperCase(),
    };
  }

  // Standard 3-character ASCII code
  if (trimmed.length === 3) {
    if (!/^[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}$/.test(trimmed)) {
      return {
        valid: false,
        displayCode: trimmed,
        error: '3-character standard codes must use printable ASCII characters without spaces.',
      };
    }
    const upper = trimmed.toUpperCase();
    return {
      valid: true,
      kind: 'standard-3',
      displayCode: upper,
      encodedCode: upper,
    };
  }

  const byteLen = new TextEncoder().encode(trimmed).length;
  if (byteLen > 20) {
    return {
      valid: false,
      displayCode: trimmed,
      error: `Non-standard currency code is ${byteLen} bytes (maximum 20 bytes for XRPL 160-bit hex).`,
    };
  }

  return {
    valid: true,
    kind: 'hex-160',
    displayCode: trimmed,
    encodedCode: encodeCurrencyCode(trimmed),
  };
}

/**
 * Convert a human percentage (0..100%) to XRPL AccountSet TransferRate integer.
 * 0% -> 0 (special disabled sentinel); >0% -> 1_000_000_000 + pct * 10_000_000.
 */
export function encodeTransferRate(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('Transfer fee must be between 0% and 100%.');
  }
  if (percent === 0) return 0;
  return Math.min(2_000_000_000, Math.round(1_000_000_000 + percent * 10_000_000));
}

export function decodeTransferRate(rate?: number): number {
  if (!rate || rate <= 1_000_000_000) return 0;
  return Number(((rate - 1_000_000_000) / 10_000_000).toFixed(4));
}

/**
 * Estimate XRP reserves and network fees required to execute a Token Launch plan.
 * Uses current XRPL Mainnet reserves: 1 XRP base reserve + 0.2 XRP per owner object.
 */
export function estimateTokenLaunchCost(draft: TokenLaunchDraft): TokenLaunchCostEstimate {
  const BASE_RESERVE = 1;
  const OWNER_RESERVE = 0.2;
  const TX_FEE_XRP = 0.000012;

  if (draft.standard === 'MPT') {
    const stepCount = 1 + (draft.domain.trim() ? 1 : 0);
    const issuerReserveXrp = Number((BASE_RESERVE + OWNER_RESERVE).toFixed(4));
    const estimatedTxFeesXrp = Number((stepCount * TX_FEE_XRP).toFixed(6));
    return {
      issuerReserveXrp,
      distributorReserveXrp: 0,
      ammReserveAndLiquidityXrp: 0,
      estimatedTxFeesXrp,
      totalXrpNeeded: Number((issuerReserveXrp + estimatedTxFeesXrp).toFixed(4)),
      stepCount,
    };
  }

  // IOU flow: Issuer (1 XRP base) + Distributor (1 XRP base + 0.2 XRP trustline)
  const issuerReserveXrp = BASE_RESERVE;
  const distributorReserveXrp = Number((BASE_RESERVE + OWNER_RESERVE).toFixed(4));

  const ammXrp = draft.seedAmmPool ? Math.max(0, Number(draft.ammXrpAmount) || 0) : 0;
  const ammReserveAndLiquidityXrp = draft.seedAmmPool
    ? Number((ammXrp + OWNER_RESERVE).toFixed(4))
    : 0;

  let stepCount = 3; // Issuer AccountSet + Distributor TrustSet + Issuer Mint Payment
  if (draft.enableClawback) stepCount += 1;
  if (draft.enableRequireAuth) stepCount += 2; // asfRequireAuth AccountSet + Issuer tfSetfAuth TrustSet
  if (draft.enableNoFreeze && !draft.enableClawback) stepCount += 1;
  if (draft.seedAmmPool) stepCount += 1;

  const estimatedTxFeesXrp = Number((stepCount * TX_FEE_XRP).toFixed(6));
  const totalXrpNeeded = Number(
    (issuerReserveXrp + distributorReserveXrp + ammReserveAndLiquidityXrp + estimatedTxFeesXrp).toFixed(4)
  );

  return {
    issuerReserveXrp,
    distributorReserveXrp,
    ammReserveAndLiquidityXrp,
    estimatedTxFeesXrp,
    totalXrpNeeded,
    stepCount,
  };
}

/**
 * Compute implied initial AMM price and FDV from initial token & XRP pool deposits.
 */
export function computeInitialAmmPrice(
  ammTokenAmount: string,
  ammXrpAmount: string,
  totalSupply: string,
  xrpUsd?: number
): AmmInitialPriceSummary {
  const tok = Number(ammTokenAmount);
  const xrp = Number(ammXrpAmount);
  const supply = Number(totalSupply);
  if (!Number.isFinite(tok) || !Number.isFinite(xrp) || tok <= 0 || xrp <= 0) {
    return { valid: false, xrpPerToken: 0, tokensPerXrp: 0, impliedFdvXrp: 0 };
  }
  const xrpPerToken = xrp / tok;
  const tokensPerXrp = tok / xrp;
  const impliedFdvXrp = Number.isFinite(supply) && supply > 0 ? xrpPerToken * supply : 0;
  const impliedFdvUsd =
    xrpUsd && xrpUsd > 0 && impliedFdvXrp > 0 ? impliedFdvXrp * xrpUsd : undefined;
  return {
    valid: true,
    xrpPerToken,
    tokensPerXrp,
    impliedFdvXrp,
    impliedFdvUsd,
  };
}

/**
 * Build the ordered list of on-ledger XRPL transactions for the Token Launch Wizard.
 */
export function buildTokenLaunchSteps(draft: TokenLaunchDraft): TokenLaunchStep[] {
  const steps: TokenLaunchStep[] = [];
  const issuer = draft.issuerAddress.trim();
  const distributor = draft.distributorAddress.trim();
  const currencyCheck = validateCurrencyCode(draft.currencyCode);
  const currency = currencyCheck.displayCode || draft.currencyCode.trim();
  const supply = draft.totalSupply.trim() || '1000000';

  if (draft.standard === 'MPT') {
    const metadataObj = {
      name: draft.tokenName.trim() || currency,
      ticker: currency,
      desc: draft.description.trim() || undefined,
      domain: draft.domain.trim() || undefined,
    };
    const transferFeeBps = Math.max(0, Math.min(5000, Math.round((draft.transferFeePercent || 0) * 100)));

    steps.push({
      id: 'mpt-create',
      order: 1,
      title: 'Create Multi-Purpose Token Issuance',
      subtitle: `Mint XLS-33 MPT "${currency}" (max supply ${supply}, scale ${draft.assetScale})`,
      signerRole: 'issuer',
      signerAddress: issuer,
      txType: 'MPTokenIssuanceCreate',
      intent: {
        kind: 'MPTokenIssuanceCreate',
        account: issuer,
        assetScale: Math.max(0, Math.min(19, Math.floor(draft.assetScale || 0))),
        maximumAmount: supply,
        transferFeeBps,
        metadataText: JSON.stringify(metadataObj),
        canTransfer: draft.mptCanTransfer,
        canTrade: draft.mptCanTrade,
        canEscrow: draft.mptCanEscrow,
        canClawback: draft.enableClawback,
        canLock: draft.mptCanLock,
        requireAuth: draft.enableRequireAuth,
      },
    });

    if (draft.domain.trim()) {
      steps.push({
        id: 'mpt-domain',
        order: 2,
        title: 'Link Issuer Domain On-Ledger',
        subtitle: `Set AccountRoot Domain to "${draft.domain.trim().toLowerCase()}" for xrp-ledger.toml verification`,
        signerRole: 'issuer',
        signerAddress: issuer,
        txType: 'AccountSet',
        intent: {
          kind: 'AccountSet',
          account: issuer,
          domain: draft.domain.trim().toLowerCase(),
        },
      });
    }
    return steps;
  }

  // Standard XRPL IOU Launch Sequence
  let order = 1;

  // Step 1: Primary Issuer AccountSet (DefaultRipple + Domain + TransferRate + TickSize)
  steps.push({
    id: 'iou-issuer-config',
    order: order++,
    title: 'Configure Issuer Account Settings',
    subtitle: `Enable DefaultRipple${draft.domain.trim() ? `, link ${draft.domain.trim()}` : ''}${
      draft.transferFeePercent > 0 ? `, ${draft.transferFeePercent}% transfer fee` : ''
    }`,
    signerRole: 'issuer',
    signerAddress: issuer,
    txType: 'AccountSet',
    intent: {
      kind: 'AccountSet',
      account: issuer,
      enableDefaultRipple: draft.enableDefaultRipple,
      ...(draft.domain.trim() ? { domain: draft.domain.trim().toLowerCase() } : {}),
      ...(draft.transferFeePercent >= 0 ? { transferRatePercent: draft.transferFeePercent } : {}),
      ...(draft.tickSize === 0 || (draft.tickSize >= 3 && draft.tickSize <= 15)
        ? { tickSize: draft.tickSize }
        : {}),
    },
  });

  // XRPL only allows one SetFlag per AccountSet transaction, so extra flags are separate steps
  if (draft.enableClawback) {
    steps.push({
      id: 'iou-flag-clawback',
      order: order++,
      title: 'Enable XLS-39 TrustLine Clawback',
      subtitle: 'Set asfAllowTrustLineClawback (SetFlag 16) before creating any TrustLines',
      signerRole: 'issuer',
      signerAddress: issuer,
      txType: 'AccountSet',
      intent: {
        kind: 'AccountSet',
        account: issuer,
        enableAllowClawback: true,
      },
      warning: 'Clawback must be enabled BEFORE the issuer owns any TrustLines or objects.',
    });
  }

  if (draft.enableRequireAuth) {
    steps.push({
      id: 'iou-flag-require-auth',
      order: order++,
      title: 'Enable RequireAuth (KYC Allowlist)',
      subtitle: 'Set asfRequireAuth (SetFlag 2) so holders must be explicitly authorized',
      signerRole: 'issuer',
      signerAddress: issuer,
      txType: 'AccountSet',
      intent: {
        kind: 'AccountSet',
        account: issuer,
        enableRequireAuth: true,
      },
    });
  }

  if (draft.enableNoFreeze && !draft.enableClawback) {
    steps.push({
      id: 'iou-flag-nofreeze',
      order: order++,
      title: 'Permanently Renounce Freeze Authority',
      subtitle: 'Set asfNoFreeze (SetFlag 6) — irreversible guarantee that balances cannot be frozen',
      signerRole: 'issuer',
      signerAddress: issuer,
      txType: 'AccountSet',
      intent: {
        kind: 'AccountSet',
        account: issuer,
        enableNoFreeze: true,
      },
      warning: 'IRREVERSIBLE: Once asfNoFreeze is set on the issuer, it can never be undone.',
    });
  }

  // Step: Distributor TrustSet
  steps.push({
    id: 'iou-trustline',
    order: order++,
    title: 'Create Distributor TrustLine',
    subtitle: `Distributor trusts Issuer for up to ${supply} ${currency}`,
    signerRole: 'distributor',
    signerAddress: distributor,
    txType: 'TrustSet',
    intent: {
      kind: 'TrustSet',
      account: distributor,
      currency,
      issuer,
      limit: supply,
      allowRippling: false,
    },
  });

  // If RequireAuth is enabled, Issuer MUST authorize Distributor's TrustLine (tfSetfAuth) before minting
  if (draft.enableRequireAuth) {
    steps.push({
      id: 'iou-authorize-distributor',
      order: order++,
      title: 'Authorize Distributor TrustLine (tfSetfAuth)',
      subtitle: `Issuer approves Distributor (${distributor ? distributor.slice(0, 10) + '…' : 'wallet'}) under RequireAuth`,
      signerRole: 'issuer',
      signerAddress: issuer,
      txType: 'TrustSet',
      intent: {
        kind: 'TrustSet',
        account: issuer,
        currency,
        issuer: distributor,
        limit: '0',
        authorizeTrustLine: true,
      },
    });
  }

  // Step: Mint & Issue Supply Payment (Issuer -> Distributor)
  steps.push({
    id: 'iou-mint-payment',
    order: order++,
    title: 'Mint & Issue Token Supply',
    subtitle: `Issue ${supply} ${currency} from Issuer to Distributor wallet`,
    signerRole: 'issuer',
    signerAddress: issuer,
    txType: 'Payment',
    intent: {
      kind: 'Payment',
      account: issuer,
      destination: distributor,
      asset: {
        currency,
        issuer,
        value: supply,
      },
      memoText: `XRPL Command Center Token Launch: ${draft.tokenName.trim() || currency}`,
    },
  });

  // Optional Step: Seed XLS-30 AMM Pool from Distributor
  if (draft.seedAmmPool) {
    steps.push({
      id: 'iou-amm-create',
      order: order++,
      title: 'Seed XLS-30 AMM Liquidity Pool',
      subtitle: `Pair ${draft.ammTokenAmount} ${currency} + ${draft.ammXrpAmount} XRP (${(
        (draft.ammTradingFeeBps ?? 50) / 100
      ).toFixed(2)}% LP fee)`,
      signerRole: 'distributor',
      signerAddress: distributor,
      txType: 'AMMCreate',
      intent: {
        kind: 'AMMCreate',
        account: distributor,
        amount1: {
          currency,
          issuer,
          value: draft.ammTokenAmount.trim() || '1000',
        },
        amount2: {
          currency: 'XRP',
          value: draft.ammXrpAmount.trim() || '10',
        },
        tradingFeeBps: Math.max(0, Math.min(100, Math.round(draft.ammTradingFeeBps ?? 50))),
      },
    });
  }

  return steps;
}
