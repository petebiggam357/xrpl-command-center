import type { IssuerRiskFlags, LiveTransaction, TxCategory } from './types';

export const RIPPLE_EPOCH_OFFSET_SEC = 946684800;

export const BLACKHOLE_ADDRESSES = new Set([
  'rrrrrrrrrrrrrrrrrrrrrhoLvTp', // ACCOUNT_ZERO
  'rrrrrrrrrrrrrrrrrrrrBZbvji', // ACCOUNT_ONE
  'rrrrrrrrrrrrrrrrrNAMEtxvNvQ', // Ripple Name reservation
  'rrrrrrrrrrrrrrrrrrrn5RM1rHd', // NaN address
]);

// AccountRoot ledger entry bitmask flags (official XRPL specification)
export const LSF_FLAGS = {
  PASSWORD_SPENT: 0x00010000,
  REQUIRE_DEST_TAG: 0x00020000,
  REQUIRE_AUTH: 0x00040000,
  DISALLOW_XRP: 0x00080000,
  DISABLE_MASTER: 0x00100000,
  NO_FREEZE: 0x00200000,
  GLOBAL_FREEZE: 0x00400000,
  DEFAULT_RIPPLE: 0x00800000,
  DEPOSIT_AUTH: 0x01000000,
  ALLOW_TRUSTLINE_CLAWBACK: 0x80000000,
} as const;

/**
 * Convert Ripple epoch seconds (seconds since 2000-01-01T00:00:00Z) to Unix milliseconds.
 */
export function rippleTimeToUnixMs(rippleTime?: number): number {
  if (typeof rippleTime !== 'number' || !Number.isFinite(rippleTime)) {
    return Date.now();
  }
  return (rippleTime + RIPPLE_EPOCH_OFFSET_SEC) * 1000;
}

/**
 * Exact BigInt conversion from drops (1 XRP = 1,000,000 drops) to formatted XRP string.
 */
export function dropsToXrpString(drops: string | number | bigint, maxDecimals = 6): string {
  try {
    const str = typeof drops === 'bigint' ? drops.toString() : String(drops).trim();
    if (!/^-?\d+$/.test(str)) return '0';
    const raw = BigInt(str);
    const neg = raw < 0n;
    const abs = neg ? -raw : raw;
    const whole = abs / 1_000_000n;
    const frac = (abs % 1_000_000n).toString().padStart(6, '0').slice(0, maxDecimals);
    const trimmedFrac = frac.replace(/0+$/, '');
    const wholeFmt = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const sign = neg ? '-' : '';
    return trimmedFrac.length > 0 ? `${sign}${wholeFmt}.${trimmedFrac}` : `${sign}${wholeFmt}`;
  } catch {
    return '0';
  }
}

export function dropsToXrpNumber(drops: string | number | undefined): number {
  if (drops === undefined || drops === null) return 0;
  const n = Number(drops);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

/**
 * Decode standard 3-character XRPL currency codes or 160-bit (40-hex-char) non-standard currency codes.
 * Example: "524C555344000000000000000000000000000000" -> "RLUSD".
 */
export function decodeCurrencyCode(currency: string): string {
  if (!currency) return 'XRP';
  const trimmed = currency.trim();
  if (trimmed.length === 3) return trimmed;
  if (/^[0-9A-Fa-f]{40}$/.test(trimmed)) {
    // Standard hex ASCII encoding starts with non-0x02 / non-0x03 byte
    let out = '';
    for (let i = 0; i < 40; i += 2) {
      const code = parseInt(trimmed.slice(i, i + 2), 16);
      if (code === 0) continue;
      if (code >= 32 && code <= 126) {
        out += String.fromCharCode(code);
      } else {
        // Non-ASCII / LP token (starts with 03)
        if (trimmed.startsWith('03')) {
          return `LP-${trimmed.slice(2, 8).toUpperCase()}`;
        }
        return `${trimmed.slice(0, 8).toUpperCase()}…`;
      }
    }
    const cleaned = out.trim();
    return cleaned.length > 0 ? cleaned : `${trimmed.slice(0, 8).toUpperCase()}…`;
  }
  return trimmed;
}

/**
 * Decode hex-encoded XRPL Domain field from AccountRoot.
 */
export function decodeHexAscii(hex?: string): string | undefined {
  if (!hex || !/^[0-9A-Fa-f]+$/.test(hex) || hex.length % 2 !== 0) return undefined;
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (code >= 32 && code <= 126) out += String.fromCharCode(code);
  }
  return out.trim() || undefined;
}

/**
 * Decode AccountRoot security & issuer flags including blackholed detection.
 */
export function decodeIssuerRiskFlags(
  flagsNum: number,
  regularKey?: string,
  domainHex?: string
): IssuerRiskFlags {
  const f = flagsNum >>> 0;
  const disableMaster = Boolean(f & LSF_FLAGS.DISABLE_MASTER);
  const regularKeyBlackholed = !regularKey || BLACKHOLE_ADDRESSES.has(regularKey);
  return {
    blackholed: disableMaster && regularKeyBlackholed,
    disableMaster,
    globalFreeze: Boolean(f & LSF_FLAGS.GLOBAL_FREEZE),
    noFreeze: Boolean(f & LSF_FLAGS.NO_FREEZE),
    allowClawback: Boolean(f & LSF_FLAGS.ALLOW_TRUSTLINE_CLAWBACK),
    requireAuth: Boolean(f & LSF_FLAGS.REQUIRE_AUTH),
    defaultRipple: Boolean(f & LSF_FLAGS.DEFAULT_RIPPLE),
    depositAuth: Boolean(f & LSF_FLAGS.DEPOSIT_AUTH),
    regularKey,
    domain: decodeHexAscii(domainHex),
  };
}

export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (abs >= 1) return n.toFixed(2).replace(/\.00$/, '');
  if (abs > 0) return n.toPrecision(3);
  return '0';
}

export function shortenAddress(addr?: string, head = 6, tail = 5): string {
  if (!addr) return '—';
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

interface XrplIssuedAmount {
  currency: string;
  issuer?: string;
  value: string;
}

function isIssuedAmount(val: unknown): val is XrplIssuedAmount {
  return (
    typeof val === 'object' &&
    val !== null &&
    'currency' in val &&
    'value' in val &&
    typeof (val as XrplIssuedAmount).currency === 'string'
  );
}

export function classifyTransaction(tx: Record<string, unknown>): {
  category: TxCategory;
  amountDisplay: string;
  amountXrpEstimate: number;
  currency?: string;
  issuer?: string;
} {
  const txType = String(tx.TransactionType ?? 'Unknown');

  if (txType.startsWith('AMM')) {
    const amt = tx.Amount ?? tx.Amount2 ?? tx.LPTokenOut ?? tx.LPTokenIn;
    if (typeof amt === 'string') {
      const xrp = dropsToXrpNumber(amt);
      return {
        category: 'amm',
        amountDisplay: `${formatCompactNumber(xrp)} XRP`,
        amountXrpEstimate: xrp,
        currency: 'XRP',
      };
    }
    if (isIssuedAmount(amt)) {
      const code = decodeCurrencyCode(amt.currency);
      return {
        category: 'amm',
        amountDisplay: `${formatCompactNumber(Number(amt.value))} ${code}`,
        amountXrpEstimate: 25,
        currency: code,
        issuer: amt.issuer,
      };
    }
    return { category: 'amm', amountDisplay: txType.replace('AMM', 'AMM '), amountXrpEstimate: 20 };
  }

  if (txType.startsWith('NFToken')) {
    const amt = tx.Amount;
    const xrp = typeof amt === 'string' ? dropsToXrpNumber(amt) : 0;
    return {
      category: 'nft',
      amountDisplay: xrp > 0 ? `${formatCompactNumber(xrp)} XRP` : txType.replace('NFToken', 'NFT '),
      amountXrpEstimate: Math.max(xrp, 5),
    };
  }

  if (txType.startsWith('MPToken')) {
    return {
      category: 'mpt',
      amountDisplay: txType.replace('MPToken', 'MPT '),
      amountXrpEstimate: 15,
    };
  }

  if (txType === 'OfferCreate' || txType === 'OfferCancel') {
    const pays = tx.TakerPays;
    const gets = tx.TakerGets;
    if (typeof pays === 'string') {
      const xrp = dropsToXrpNumber(pays);
      const other = isIssuedAmount(gets) ? decodeCurrencyCode(gets.currency) : 'XRP';
      return {
        category: 'dex',
        amountDisplay: `${formatCompactNumber(xrp)} XRP / ${other}`,
        amountXrpEstimate: xrp,
        currency: isIssuedAmount(gets) ? other : 'XRP',
        issuer: isIssuedAmount(gets) ? gets.issuer : undefined,
      };
    }
    if (typeof gets === 'string') {
      const xrp = dropsToXrpNumber(gets);
      const other = isIssuedAmount(pays) ? decodeCurrencyCode(pays.currency) : 'XRP';
      return {
        category: 'dex',
        amountDisplay: `${formatCompactNumber(xrp)} XRP / ${other}`,
        amountXrpEstimate: xrp,
        currency: isIssuedAmount(pays) ? other : 'XRP',
        issuer: isIssuedAmount(pays) ? pays.issuer : undefined,
      };
    }
    if (isIssuedAmount(pays)) {
      const code = decodeCurrencyCode(pays.currency);
      return {
        category: 'dex',
        amountDisplay: `${formatCompactNumber(Number(pays.value))} ${code}`,
        amountXrpEstimate: 15,
        currency: code,
        issuer: pays.issuer,
      };
    }
    return { category: 'dex', amountDisplay: txType === 'OfferCancel' ? 'Cancel Offer' : 'DEX Order', amountXrpEstimate: 2 };
  }

  if (txType === 'TrustSet') {
    const limit = tx.LimitAmount;
    if (isIssuedAmount(limit)) {
      const code = decodeCurrencyCode(limit.currency);
      return {
        category: 'trust',
        amountDisplay: `Trust ${code}`,
        amountXrpEstimate: 4,
        currency: code,
        issuer: limit.issuer,
      };
    }
    return { category: 'trust', amountDisplay: 'TrustSet', amountXrpEstimate: 2 };
  }

  if (txType === 'Payment' || txType === 'Clawback') {
    const amt = tx.Amount ?? tx.DeliverMax;
    if (typeof amt === 'string') {
      const xrp = dropsToXrpNumber(amt);
      return {
        category: txType === 'Clawback' ? 'token' : 'payment',
        amountDisplay: `${formatCompactNumber(xrp)} XRP`,
        amountXrpEstimate: xrp,
        currency: 'XRP',
      };
    }
    if (isIssuedAmount(amt)) {
      const code = decodeCurrencyCode(amt.currency);
      return {
        category: 'token',
        amountDisplay: `${formatCompactNumber(Number(amt.value))} ${code}`,
        amountXrpEstimate: Math.min(Number(amt.value) || 10, 25000),
        currency: code,
        issuer: amt.issuer,
      };
    }
    return { category: 'payment', amountDisplay: txType, amountXrpEstimate: 1 };
  }

  if (txType.startsWith('Escrow') || txType.startsWith('Check') || txType.startsWith('PaymentChannel')) {
    const amt = tx.Amount;
    const xrp = typeof amt === 'string' ? dropsToXrpNumber(amt) : 0;
    return {
      category: 'escrow',
      amountDisplay: xrp > 0 ? `${formatCompactNumber(xrp)} XRP` : txType,
      amountXrpEstimate: Math.max(xrp, 5),
    };
  }

  return {
    category: 'system',
    amountDisplay: txType,
    amountXrpEstimate: 1,
  };
}

export function parseLiveTransactionEvent(msg: Record<string, unknown>): LiveTransaction | null {
  const tx = (msg.transaction ?? msg.tx_json ?? msg) as Record<string, unknown> | undefined;
  if (!tx || typeof tx.TransactionType !== 'string') return null;

  const hash = String(msg.hash ?? tx.hash ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const classified = classifyTransaction(tx);
  const feeDrops = Number(tx.Fee ?? 12) || 12;
  const validated = Boolean(msg.validated);
  const isWhale = classified.currency === 'XRP' && classified.amountXrpEstimate >= 100_000;

  return {
    id: `${hash}-${validated ? 'v' : 'p'}`,
    hash,
    txType: tx.TransactionType,
    category: classified.category,
    account: String(tx.Account ?? ''),
    destination: typeof tx.Destination === 'string' ? tx.Destination : undefined,
    amountDisplay: classified.amountDisplay,
    amountXrpEstimate: classified.amountXrpEstimate,
    currency: classified.currency,
    issuer: classified.issuer,
    feeDrops,
    validated,
    engineResult: typeof msg.engine_result === 'string' ? msg.engine_result : undefined,
    ledgerIndex: typeof msg.ledger_index === 'number' ? msg.ledger_index : undefined,
    timestamp: Date.now(),
    isWhale,
    raw: tx,
  };
}

export function detectQueryKind(input: string): 'account' | 'hash' | 'ledger' | 'search' {
  const q = input.trim();
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(q)) return 'account';
  if (/^[0-9A-Fa-f]{64}$/.test(q)) return 'hash';
  if (/^\d{1,10}$/.test(q)) return 'ledger';
  return 'search';
}
