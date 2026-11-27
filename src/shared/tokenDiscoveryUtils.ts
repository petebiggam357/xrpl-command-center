// v0.3.0-beta: Full-Ledger Token Discovery, Live Stream Extraction & Query Parsing

import type { TokenRecord } from './types';
import { decodeCurrencyCode, encodeCurrencyCode, extractIssuedTokensFromTx } from './xrplCodec';

export { extractIssuedTokensFromTx };

export interface ObservedStreamToken {
  currency: string;
  currencyRaw: string;
  issuer: string;
}

export type ParsedTokenQuery =
  | { kind: 'empty'; raw: string }
  | { kind: 'pair'; raw: string; currency: string; currencyRaw: string; issuer: string }
  | { kind: 'issuer'; raw: string; issuer: string }
  | { kind: 'hex-currency'; raw: string; currency: string; currencyRaw: string }
  | { kind: 'search'; raw: string; query: string; encodedCurrency?: string };

const CLASSIC_ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HEX_CURRENCY_RE = /^[0-9A-Fa-f]{40}$/;

/**
 * Normalizes a canonical token key using encoded XRPL currencyRaw + issuer address
 * so 3-char codes, 40-hex non-standard codes, and human labels deduplicate identically.
 */
export function canonicalTokenKey(currencyOrRaw: string, issuer: string): string {
  const cleanIssuer = issuer.trim();
  const cleanCur = currencyOrRaw.trim();
  if (!cleanCur || cleanCur.toUpperCase() === 'XRP') {
    return `XRP:${cleanIssuer}`;
  }
  try {
    return `${encodeCurrencyCode(cleanCur)}:${cleanIssuer}`;
  } catch {
    return `${cleanCur.toUpperCase()}:${cleanIssuer}`;
  }
}

/**
 * Parses a user token search input into an exact lookup strategy:
 * - "RIP:rIssuer..." or "RIP.rIssuer..." -> direct currency+issuer pair
 * - "rIssuer..." -> direct issuer lookup (XRPLMeta + on-ledger gateway_balances)
 * - 40-char hex -> exact hex currency lookup
 * - Ticker or name (e.g., "RIP", "RLUSD", "Solo") -> full XRPLMeta registry search
 */
export function parseTokenQueryInput(input: string): ParsedTokenQuery {
  const raw = String(input ?? '').trim();
  if (!raw) return { kind: 'empty', raw: '' };

  // Match CURRENCY:rIssuer or CURRENCY.rIssuer or CURRENCY rIssuer
  const pairMatch = raw.match(/^([A-Za-z0-9_$-]{1,40})[:.\s]+(r[1-9A-HJ-NP-Za-km-z]{24,34})$/);
  if (pairMatch) {
    const [, curPart, issuerPart] = pairMatch;
    if (curPart.toUpperCase() !== 'XRP') {
      try {
        const currencyRaw = encodeCurrencyCode(curPart);
        return {
          kind: 'pair',
          raw,
          currency: decodeCurrencyCode(currencyRaw),
          currencyRaw,
          issuer: issuerPart,
        };
      } catch {
        // fall through to generic search
      }
    }
  }

  if (CLASSIC_ADDRESS_RE.test(raw)) {
    return { kind: 'issuer', raw, issuer: raw };
  }

  if (HEX_CURRENCY_RE.test(raw)) {
    const currencyRaw = raw.toUpperCase();
    return {
      kind: 'hex-currency',
      raw,
      currency: decodeCurrencyCode(currencyRaw),
      currencyRaw,
    };
  }

  let encodedCurrency: string | undefined;
  if (/^[A-Za-z0-9_$-]{1,20}$/.test(raw) && raw.toUpperCase() !== 'XRP') {
    try {
      encodedCurrency = encodeCurrencyCode(raw);
    } catch {
      encodedCurrency = undefined;
    }
  }

  return {
    kind: 'search',
    raw,
    query: raw,
    encodedCurrency,
  };
}

/**
 * Merges multiple token sources (XRPLMeta directory, live stream observed tokens,
 * user-pinned custom tokens, and remote search hits) without dropping live metrics or pins.
 */
export function mergeTokenCollections(collections: {
  directory: TokenRecord[];
  liveStream: TokenRecord[];
  pinned: TokenRecord[];
  remoteHits?: TokenRecord[];
}): TokenRecord[] {
  const byKey = new Map<string, TokenRecord>();
  const pinnedKeys = new Set(collections.pinned.map((t) => canonicalTokenKey(t.currencyRaw || t.currency, t.issuer)));

  const upsert = (item: TokenRecord, preferMetrics: boolean) => {
    const key = canonicalTokenKey(item.currencyRaw || item.currency, item.issuer);
    const existing = byKey.get(key);
    const isPinned = pinnedKeys.has(key) || Boolean(item.pinned) || Boolean(existing?.pinned);

    if (!existing) {
      byKey.set(key, {
        ...item,
        id: key,
        pinned: isPinned,
      });
      return;
    }

    byKey.set(key, {
      ...existing,
      ...(preferMetrics
        ? {
            name: item.name ?? existing.name,
            domain: item.domain ?? existing.domain,
            icon: item.icon ?? existing.icon,
            holders: Math.max(item.holders, existing.holders),
            trustlines: Math.max(item.trustlines, existing.trustlines),
            supply: Math.max(item.supply, existing.supply),
            volume24hUsd: Math.max(item.volume24hUsd, existing.volume24hUsd),
            marketcapUsd: Math.max(item.marketcapUsd, existing.marketcapUsd),
            priceUsd: item.priceUsd > 0 ? item.priceUsd : existing.priceUsd,
            source: existing.source === 'live-stream' ? 'live-stream' : item.source,
          }
        : {
            name: existing.name ?? item.name,
            domain: existing.domain ?? item.domain,
            icon: existing.icon ?? item.icon,
            holders: Math.max(existing.holders, item.holders),
            trustlines: Math.max(existing.trustlines, item.trustlines),
            supply: Math.max(existing.supply, item.supply),
            volume24hUsd: Math.max(existing.volume24hUsd, item.volume24hUsd),
            marketcapUsd: Math.max(existing.marketcapUsd, item.marketcapUsd),
            priceUsd: existing.priceUsd > 0 ? existing.priceUsd : item.priceUsd,
          }),
      id: key,
      liveTxCount: Math.max(existing.liveTxCount ?? 0, item.liveTxCount ?? 0) || undefined,
      lastSeenAt: Math.max(existing.lastSeenAt ?? 0, item.lastSeenAt ?? 0) || undefined,
      pinned: isPinned,
    });
  };

  for (const t of collections.directory) upsert(t, true);
  for (const t of collections.remoteHits ?? []) upsert(t, true);
  for (const t of collections.pinned) upsert(t, false);
  for (const t of collections.liveStream) upsert(t, false);

  return Array.from(byKey.values());
}
