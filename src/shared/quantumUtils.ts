import type { WalletPortfolioSnapshot } from './types';

// ============================================================================
// v0.2.9-beta: Post-Quantum Cryptography (PQC) Exposure & Crypto-Agility Engine
// ============================================================================

export type QuantumExposureStatus =
  | 'unfunded'
  | 'immutable'
  | 'shielded'
  | 'exposed-low-balance'
  | 'exposed-high-value';

export interface QuantumExposureReport {
  status: QuantumExposureStatus;
  pubKeyExposed: boolean;
  exposedOutgoingTxCount: number;
  score: number; // 0..100
  badgeLabel: string;
  headline: string;
  recommendations: string[];
}

export const VAULT_PQC_POSTURE = {
  atRestCipher: 'AES-256-GCM (128-bit Grover Post-Quantum Security)',
  kdf: 'Argon2id (64 MiB memory-hard, t=3, p=1)',
  ramProtection: 'Rust Zeroizing buffers (0x00 wipe on lock/exit)',
  backupIntegrity: 'SHA-512 Cryptographic Envelope Seal (256-bit PQ collision security)',
  xrplMigrationPath: 'Crypto-agile KeyAlgorithm trait + native XRPL SetRegularKey / SignerListSet for future NIST ML-DSA (Dilithium) & SLH-DSA (SPHINCS+)',
} as const;

export function assessQuantumExposure(portfolio: WalletPortfolioSnapshot): QuantumExposureReport {
  if (!portfolio.funded) {
    return {
      status: 'unfunded',
      pubKeyExposed: false,
      exposedOutgoingTxCount: 0,
      score: 100,
      badgeLabel: 'PQ-READY (UNFUNDED)',
      headline: 'Zero on-ledger public-key exposure — ready as a receive-only cold vault.',
      recommendations: [
        'Use this address as a receive-only cold vault to keep its raw public key hidden behind SHA-256 + RIPEMD-160.',
      ],
    };
  }

  if (portfolio.flags.blackholed) {
    return {
      status: 'immutable',
      pubKeyExposed: false,
      exposedOutgoingTxCount: 0,
      score: 100,
      badgeLabel: 'IMMUTABLE (BLACKHOLED)',
      headline: 'Master key disabled and RegularKey pointed to a blackhole address — signing permanently disabled.',
      recommendations: [
        'No private key can authorize transactions on this account.',
      ],
    };
  }

  // Detect whether this account has ever signed an outgoing classical transaction on-ledger
  const outgoingTxs = portfolio.recentTransactions.filter(
    (tx) => tx.account?.trim() === portfolio.address.trim()
  );
  const hasExplicitSigningPubKey = outgoingTxs.some((tx) => {
    const raw = (tx.raw ?? {}) as Record<string, unknown>;
    const inner = ((raw.transaction ?? raw.tx ?? raw) ?? {}) as Record<string, unknown>;
    const spk = inner.SigningPubKey;
    return typeof spk === 'string' && spk.trim().length > 0;
  });

  const exposedOutgoingTxCount = outgoingTxs.length;
  const pubKeyExposed = exposedOutgoingTxCount > 0 || hasExplicitSigningPubKey;

  if (!pubKeyExposed) {
    return {
      status: 'shielded',
      pubKeyExposed: false,
      exposedOutgoingTxCount: 0,
      score: 98,
      badgeLabel: 'PQ-SHIELDED (PUBKEY HIDDEN)',
      headline:
        'Public key has NOT been revealed on-ledger — shielded behind SHA-256 + RIPEMD-160 against Shor’s algorithm.',
      recommendations: [
        'Keep this wallet receive-only for long-term cold storage so its classical public key remains unexposed.',
        'When you eventually need to spend, sweep the full balance to a fresh unexposed address or rotate to a NIST ML-DSA / SLH-DSA RegularKey once XRPL activates PQ signatures.',
      ],
    };
  }

  const isHighValue = portfolio.totalXrp >= 5_000;
  const hasMultiSig = Boolean(portfolio.signerList && portfolio.signerList.signerQuorum >= 2);
  const hasRegularKey = Boolean(portfolio.flags.regularKey);

  const recs: string[] = [];
  if (isHighValue) {
    recs.push(
      'Sweep long-term HODL balances into a fresh, unspent "PQ Cold Vault (Receive-Only)" address so the raw public key stays hidden behind its AccountID hash.'
    );
  }
  if (!hasRegularKey && !hasMultiSig) {
    recs.push(
      'Configure SetRegularKey or M-of-N Multi-Sig so you can rotate keys cleanly (and adopt NIST ML-DSA / SLH-DSA as soon as XRPL activates its Post-Quantum amendment).'
    );
  } else {
    recs.push(
      'Key-rotation posture active — you are positioned to swap to a Post-Quantum RegularKey/SignerList without changing your r-address once XRPL enables PQ signatures.'
    );
  }
  recs.push(
    'Your local Rust Vault file is already encrypted with AES-256-GCM + Argon2id (128-bit post-quantum symmetric security).'
  );

  const baseScore = isHighValue ? 64 : 78;
  const bonus = (hasMultiSig ? 8 : 0) + (hasRegularKey ? 6 : 0);

  return {
    status: isHighValue ? 'exposed-high-value' : 'exposed-low-balance',
    pubKeyExposed: true,
    exposedOutgoingTxCount,
    score: Math.min(92, baseScore + bonus),
    badgeLabel: isHighValue ? 'PUBKEY EXPOSED (HODL MIGRATE)' : 'PUBKEY EXPOSED (CLASSICAL ECC)',
    headline: `Classical Ed25519/secp256k1 SigningPubKey revealed across ${exposedOutgoingTxCount} outgoing transaction(s).`,
    recommendations: recs,
  };
}
