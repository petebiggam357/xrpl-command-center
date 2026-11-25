import type {
  AddressBookContact,
  DecodedMemo,
  ReserveBreakdown,
  WalletAccountPublic,
} from './types';

export interface KnownExchangeInfo {
  name: string;
  address: string;
  requireDestinationTag: boolean;
}

/**
 * Curated list of well-known XRPL exchange hot/deposit wallets that require a Destination Tag.
 * Users can also mark any custom contact in their Address Book with `requireTag: true`.
 */
export const KNOWN_EXCHANGE_ADDRESSES: KnownExchangeInfo[] = [
  { name: 'Coinbase', address: 'rw2ciyaNshpHe7bCHo4bRWq6pqqynnWKQg', requireDestinationTag: true },
  { name: 'Coinbase (2)', address: 'rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w', requireDestinationTag: true },
  { name: 'Kraken', address: 'rLHzPsX6oXkzU2qL12kHCH8G8cnZv1rBJh', requireDestinationTag: true },
  { name: 'Bitstamp', address: 'rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1', requireDestinationTag: true },
  { name: 'Binance', address: 'rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh', requireDestinationTag: true },
  { name: 'Binance (2)', address: 'rEy8TFcrAPvhpKrwyrscNYyqBGUkE9hKaJ', requireDestinationTag: true },
  { name: 'Uphold', address: 'rMdG3ju8pgyVh29ELPWaDuA74CpWW6Fxns', requireDestinationTag: true },
  { name: 'Bitrue', address: 'rKq7xLeTaDFCg9cdy9MmgxpPnj8MWZj2Feedback'.slice(0, 34), requireDestinationTag: true },
  { name: 'KuCoin', address: 'rUW9toSjQkLY6EspdnBJP2paG4hWKmNbMh', requireDestinationTag: true },
  { name: 'Crypto.com', address: 'rKV8HEL3vLc6q9waTiJcewdRdSFyx67QFb', requireDestinationTag: true },
].filter((e) => /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(e.address));

export const DEFAULT_ADDRESS_BOOK_CONTACTS: AddressBookContact[] = [
  {
    id: 'contact-rlusd-issuer',
    label: 'Ripple USD (RLUSD) Issuer',
    address: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
    category: 'issuer',
    requireTag: false,
    notes: 'Official Ripple USD stablecoin issuer on XRPL Mainnet',
    createdAt: 1735689600000,
  },
  {
    id: 'contact-bitstamp-usd',
    label: 'Bitstamp Gateway',
    address: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
    category: 'issuer',
    requireTag: false,
    notes: 'Bitstamp IOU issuer address',
    createdAt: 1735689600000,
  },
];

export function isXAddress(input: string): boolean {
  const q = input.trim();
  return /^[XT][1-9A-HJ-NP-Za-km-z]{46}$/.test(q);
}

export interface DestinationTagCheck {
  level: 'ok' | 'warn' | 'danger';
  message?: string;
  matchedLabel?: string;
  suggestedTag?: number;
}

/**
 * Guardrail that warns before sending funds to a known exchange or user-saved
 * contact that requires a Destination Tag.
 */
export function checkDestinationTagSafety(
  destination: string,
  destinationTagInput: string,
  contacts: AddressBookContact[]
): DestinationTagCheck {
  const cleanDest = destination.trim();
  if (!cleanDest) return { level: 'ok' };

  const hasTag = destinationTagInput.trim().length > 0 && /^\d+$/.test(destinationTagInput.trim());

  const contact = contacts.find((c) => c.address === cleanDest);
  if (contact) {
    if (contact.requireTag && !hasTag) {
      return {
        level: 'danger',
        matchedLabel: contact.label,
        suggestedTag: contact.defaultTag,
        message: `"${contact.label}" requires a Destination Tag. Sending without one can cause lost or delayed funds.`,
      };
    }
    if (contact.defaultTag !== undefined && !hasTag) {
      return {
        level: 'warn',
        matchedLabel: contact.label,
        suggestedTag: contact.defaultTag,
        message: `Saved contact "${contact.label}" has a default Destination Tag (${contact.defaultTag}).`,
      };
    }
    return { level: 'ok', matchedLabel: contact.label };
  }

  const exchange = KNOWN_EXCHANGE_ADDRESSES.find((e) => e.address === cleanDest);
  if (exchange && exchange.requireDestinationTag && !hasTag) {
    return {
      level: 'danger',
      matchedLabel: exchange.name,
      message: `${exchange.name} deposit address detected — a Destination Tag is REQUIRED so the exchange credits your account.`,
    };
  }

  return { level: 'ok', matchedLabel: exchange?.name };
}

/**
 * Resolve a human-readable label for any XRPL address from:
 * 1) User's own wallets in Vault
 * 2) Saved Address Book contacts
 * 3) Curated known exchanges
 */
export function resolveAddressLabel(
  address: string | undefined,
  contacts: AddressBookContact[],
  vaultAccounts: WalletAccountPublic[]
): { label: string; source: 'wallet' | 'contact' | 'exchange' } | null {
  if (!address) return null;
  const own = vaultAccounts.find((a) => a.address === address);
  if (own) return { label: own.label, source: 'wallet' };

  const contact = contacts.find((c) => c.address === address);
  if (contact) return { label: contact.label, source: 'contact' };

  const ex = KNOWN_EXCHANGE_ADDRESSES.find((e) => e.address === address);
  if (ex) return { label: `${ex.name} Exchange`, source: 'exchange' };

  return null;
}

function hexToUtf8Safe(hex?: string): string | undefined {
  if (!hex || typeof hex !== 'string') return undefined;
  const clean = hex.trim();
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return undefined;
  try {
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0/g, '').trim();
    return decoded || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Decode XRPL `Memos` array from a raw transaction object into human-readable UTF-8 entries.
 */
export function decodeXrplMemos(rawTx: unknown): DecodedMemo[] {
  if (!rawTx || typeof rawTx !== 'object') return [];
  const obj = rawTx as Record<string, unknown>;
  const txObj = (obj.transaction ?? obj.tx_json ?? obj) as Record<string, unknown>;
  const memos = txObj.Memos;
  if (!Array.isArray(memos)) return [];

  const out: DecodedMemo[] = [];
  for (const item of memos) {
    const memo = (item as { Memo?: Record<string, unknown> })?.Memo;
    if (!memo || typeof memo !== 'object') continue;
    const type = hexToUtf8Safe(typeof memo.MemoType === 'string' ? memo.MemoType : undefined);
    const data = hexToUtf8Safe(typeof memo.MemoData === 'string' ? memo.MemoData : undefined);
    const format = hexToUtf8Safe(typeof memo.MemoFormat === 'string' ? memo.MemoFormat : undefined);
    if (type || data || format) {
      out.push({ type, data, format });
    }
  }
  return out;
}

/**
 * Convert ipfs:// URIs to safe HTTPS gateway URLs and reject non-HTTPS/IPFS schemes.
 */
export function resolveSafeMediaUri(uri?: string): {
  gatewayUrl?: string;
  isImageLikely: boolean;
  displayUri: string;
} {
  if (!uri) return { isImageLikely: false, displayUri: '' };
  const clean = uri.trim();
  let gatewayUrl: string | undefined;

  if (clean.startsWith('ipfs://')) {
    const pathPart = clean.slice('ipfs://'.length).replace(/^ipfs\//, '');
    gatewayUrl = `https://ipfs.io/ipfs/${pathPart}`;
  } else if (clean.startsWith('https://')) {
    gatewayUrl = clean;
  }

  const lower = (gatewayUrl ?? '').toLowerCase();
  const isImageLikely = /\.(png|jpg|jpeg|webp|gif|svg)(\?.*)?$/.test(lower);

  return {
    gatewayUrl,
    isImageLikely,
    displayUri: clean,
  };
}

/**
 * Compute plain-English XRPL reserve breakdown for visual display.
 */
export function computeReserveBreakdown(
  totalXrp: number,
  baseReserveXrp: number,
  ownerCount: number,
  ownerIncrementXrp = 0.2
): ReserveBreakdown {
  const safeTotal = Math.max(0, Number.isFinite(totalXrp) ? totalXrp : 0);
  const base = Math.max(0, baseReserveXrp);
  const owner = Math.max(0, Number((ownerCount * ownerIncrementXrp).toFixed(4)));
  const locked = Number((base + owner).toFixed(4));
  const spendable = Math.max(0, Number((safeTotal - locked).toFixed(6)));
  const lockedPct = safeTotal > 0 ? Math.min(100, Number(((locked / safeTotal) * 100).toFixed(1))) : 0;
  const spendablePct = safeTotal > 0 ? Math.max(0, Number((100 - lockedPct).toFixed(1))) : 0;

  return {
    totalXrp: safeTotal,
    baseReserveXrp: base,
    ownerReserveXrp: owner,
    ownerCount,
    lockedXrp: locked,
    spendableXrp: spendable,
    lockedPct,
    spendablePct,
  };
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount >= 1000 ? 0 : 2,
    maximumFractionDigits: amount >= 1000 ? 2 : amount < 0.1 && amount > 0 ? 4 : 2,
  }).format(amount);
}
