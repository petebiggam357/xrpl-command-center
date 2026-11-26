import type {
  AmendmentVoteRecord,
  DidResolutionReport,
  InspectorResult,
  LiveTransaction,
  MarketPriceSnapshot,
  NetworkId,
  OracleAggregateReport,
  OrderbookLevel,
  TokenOnLedgerReport,
  TokenRecord,
  TopologyNode,
  ValidatorRecord,
} from '../src/shared/types';
import {
  decodeCurrencyCode,
  decodeHexAscii,
  decodeIssuerRiskFlags,
  detectQueryKind,
  dropsToXrpNumber,
  dropsToXrpString,
  encodeCurrencyCode,
  formatCompactNumber,
  parseLiveTransactionEvent,
  rippleTimeToUnixMs,
} from '../src/shared/xrplCodec';
import type { XrplStreamManager } from './xrplStream';

interface CacheSlot<T> {
  fetchedAt: number;
  data: T;
}

const VALIDATOR_CACHE_TTL_MS = 60_000;
const TOKEN_CACHE_TTL_MS = 90_000;

const CURATED_FALLBACK_TOKENS: TokenRecord[] = [
  {
    id: '524C555344000000000000000000000000000000:rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
    currency: 'RLUSD',
    currencyRaw: '524C555344000000000000000000000000000000',
    issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
    name: 'Ripple USD (RLUSD)',
    domain: 'ripple.com',
    holders: 0,
    trustlines: 0,
    supply: 0,
    volume24hUsd: 0,
    marketcapUsd: 0,
    priceUsd: 1,
    source: 'curated',
  },
  {
    id: '534F4C4F00000000000000000000000000000000:rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz',
    currency: 'SOLO',
    currencyRaw: '534F4C4F00000000000000000000000000000000',
    issuer: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz',
    name: 'Sologenic',
    domain: 'sologenic.com',
    holders: 0,
    trustlines: 0,
    supply: 0,
    volume24hUsd: 0,
    marketcapUsd: 0,
    priceUsd: 0,
    source: 'curated',
  },
  {
    id: '434F524500000000000000000000000000000000:rcoreNywaoz2ZCQ8Lg2EbSLnGuRBmun6D',
    currency: 'CORE',
    currencyRaw: '434F524500000000000000000000000000000000',
    issuer: 'rcoreNywaoz2ZCQ8Lg2EbSLnGuRBmun6D',
    name: 'Coreum',
    domain: 'coreum.com',
    holders: 0,
    trustlines: 0,
    supply: 0,
    volume24hUsd: 0,
    marketcapUsd: 0,
    priceUsd: 0,
    source: 'curated',
  },
  {
    id: 'USD:rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
    currency: 'USD',
    currencyRaw: 'USD',
    issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
    name: 'GateHub USD',
    domain: 'gatehub.net',
    holders: 0,
    trustlines: 0,
    supply: 0,
    volume24hUsd: 0,
    marketcapUsd: 0,
    priceUsd: 1,
    source: 'curated',
  },
  {
    id: 'USD:rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
    currency: 'USD',
    currencyRaw: 'USD',
    issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
    name: 'Bitstamp USD',
    domain: 'bitstamp.net',
    holders: 0,
    trustlines: 0,
    supply: 0,
    volume24hUsd: 0,
    marketcapUsd: 0,
    priceUsd: 1,
    source: 'curated',
  },
  {
    id: 'EUR:rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
    currency: 'EUR',
    currencyRaw: 'EUR',
    issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
    name: 'GateHub EUR',
    domain: 'gatehub.net',
    holders: 0,
    trustlines: 0,
    supply: 0,
    volume24hUsd: 0,
    marketcapUsd: 0,
    priceUsd: 1.08,
    source: 'curated',
  },
];

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'XRPL-Command-Center/0.2.1-beta',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export class DirectoryService {
  private validatorCache = new Map<
    string,
    CacheSlot<{ validators: ValidatorRecord[]; topology: TopologyNode[]; source: string }>
  >();
  private tokenCache = new Map<string, CacheSlot<{ tokens: TokenRecord[]; source: string }>>();
  private priceCache: CacheSlot<MarketPriceSnapshot> | null = null;
  private amendmentCache: CacheSlot<{ amendments: AmendmentVoteRecord[]; source: string }> | null = null;

  public async fetchMarketPrices(): Promise<MarketPriceSnapshot> {
    if (this.priceCache && Date.now() - this.priceCache.fetchedAt < 60_000) {
      return this.priceCache.data;
    }

    // 1) Try CoinGecko public simple price (includes 24h change)
    try {
      const cg = await fetchJsonWithTimeout<{
        ripple?: { usd?: number; usd_24h_change?: number };
      }>(
        'https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd&include_24hr_change=true',
        6_000
      );
      const usd = Number(cg?.ripple?.usd);
      if (Number.isFinite(usd) && usd > 0) {
        const snap: MarketPriceSnapshot = {
          xrpUsd: usd,
          change24hPct: Number.isFinite(Number(cg?.ripple?.usd_24h_change))
            ? Number(Number(cg.ripple!.usd_24h_change).toFixed(2))
            : null,
          source: 'CoinGecko',
          fetchedAt: Date.now(),
        };
        this.priceCache = { fetchedAt: Date.now(), data: snap };
        return snap;
      }
    } catch {
      // fall through to Coinbase Spot
    }

    // 2) Fallback: Coinbase Spot XRP-USD
    try {
      const cb = await fetchJsonWithTimeout<{ data?: { amount?: string } }>(
        'https://api.coinbase.com/v2/prices/XRP-USD/spot',
        6_000
      );
      const usd = Number(cb?.data?.amount);
      if (Number.isFinite(usd) && usd > 0) {
        const snap: MarketPriceSnapshot = {
          xrpUsd: usd,
          change24hPct: null,
          source: 'Coinbase Spot',
          fetchedAt: Date.now(),
        };
        this.priceCache = { fetchedAt: Date.now(), data: snap };
        return snap;
      }
    } catch {
      // ignore
    }

    return (
      this.priceCache?.data ?? {
        xrpUsd: null,
        change24hPct: null,
        source: 'offline',
        fetchedAt: Date.now(),
      }
    );
  }

  public async fetchAmendments(
    stream: XrplStreamManager
  ): Promise<{ amendments: AmendmentVoteRecord[]; source: string; fetchedAt: number }> {
    if (this.amendmentCache && Date.now() - this.amendmentCache.fetchedAt < 90_000) {
      return { ...this.amendmentCache.data, fetchedAt: this.amendmentCache.fetchedAt };
    }

    // 1) Try XRPSCAN public amendments endpoint (works even when connected to Clio)
    try {
      const rows = await fetchJsonWithTimeout<
        Array<{
          id?: string;
          name?: string;
          enabled?: boolean;
          supported?: boolean;
          count?: number;
          threshold?: number;
          validations?: number;
          vetoed?: boolean | string;
        }>
      >('https://api.xrpscan.com/api/v1/amendments', 8_000);

      if (Array.isArray(rows) && rows.length > 0) {
        const amendments: AmendmentVoteRecord[] = rows
          .filter((r) => r.name || r.id)
          .map((r) => {
            const count = Number(r.count ?? 0);
            const threshold = Number(r.threshold ?? 28) || 28;
            const total = Number(r.validations ?? Math.round(threshold / 0.8)) || 35;
            const percent = r.enabled
              ? 100
              : Math.min(100, Number(((count / Math.max(1, total)) * 100).toFixed(1)));
            return {
              id: String(r.id ?? r.name),
              name: String(r.name ?? r.id),
              enabled: Boolean(r.enabled),
              supported: r.supported !== false,
              count,
              threshold,
              percent,
              vetoed: r.vetoed === true || r.vetoed === 'Obsolete',
            };
          })
          .sort((a, b) => {
            if (a.enabled !== b.enabled) return a.enabled ? 1 : -1;
            return b.percent - a.percent;
          });

        const payload = { amendments, source: 'XRPScan Live UNL' };
        this.amendmentCache = { fetchedAt: Date.now(), data: payload };
        return { ...payload, fetchedAt: Date.now() };
      }
    } catch {
      // fall through to direct rippled `feature` RPC
    }

    // 2) Fallback: Direct `feature` RPC on connected node
    try {
      const res = await stream.request('feature', {});
      const features = ((res.result as Record<string, unknown> | undefined)?.features ??
        {}) as Record<
        string,
        {
          name?: string;
          enabled?: boolean;
          supported?: boolean;
          count?: number;
          threshold?: number;
          validations?: number;
          vetoed?: boolean | string;
        }
      >;

      const amendments: AmendmentVoteRecord[] = Object.entries(features)
        .map(([id, f]) => {
          const count = Number(f.count ?? 0);
          const threshold = Number(f.threshold ?? 28) || 28;
          const total = Number(f.validations ?? Math.round(threshold / 0.8)) || 35;
          const percent = f.enabled
            ? 100
            : Math.min(100, Number(((count / Math.max(1, total)) * 100).toFixed(1)));
          return {
            id,
            name: String(f.name ?? id.slice(0, 12)),
            enabled: Boolean(f.enabled),
            supported: f.supported !== false,
            count,
            threshold,
            percent,
            vetoed: f.vetoed === true || f.vetoed === 'Obsolete',
          };
        })
        .sort((a, b) => {
          if (a.enabled !== b.enabled) return a.enabled ? 1 : -1;
          return b.percent - a.percent;
        });

      const payload = { amendments, source: 'XRPL feature RPC' };
      this.amendmentCache = { fetchedAt: Date.now(), data: payload };
      return { ...payload, fetchedAt: Date.now() };
    } catch {
      return {
        amendments: this.amendmentCache?.data.amendments ?? [],
        source: 'unavailable',
        fetchedAt: Date.now(),
      };
    }
  }

  public async fetchValidators(networkId: NetworkId): Promise<{
    validators: ValidatorRecord[];
    topology: TopologyNode[];
    fetchedAt: number;
    source: string;
  }> {
    const cacheKey = networkId === 'testnet' ? 'testnet' : 'main';
    const cached = this.validatorCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < VALIDATOR_CACHE_TTL_MS) {
      return { ...cached.data, fetchedAt: cached.fetchedAt };
    }

    const chainSegment = networkId === 'testnet' ? 'testnet' : 'main';
    const validatorsUrl = `https://data.xrplf.org/v1/network/validators/${chainSegment}`;
    const topoUrl = `https://data.xrplf.org/v1/network/topology/nodes/${chainSegment}`;

    const [valRes, topoRes] = await Promise.allSettled([
      fetchJsonWithTimeout<{ validators?: Array<Record<string, unknown>> }>(validatorsUrl, 12_000),
      fetchJsonWithTimeout<{ nodes?: Array<Record<string, unknown>> }>(topoUrl, 12_000),
    ]);

    const validators: ValidatorRecord[] = [];
    if (valRes.status === 'fulfilled' && Array.isArray(valRes.value.validators)) {
      for (const item of valRes.value.validators) {
        const pubkey = String(item.validation_public_key ?? '');
        if (!pubkey) continue;
        const a1 = item.agreement_1h as { score?: string | number } | undefined;
        const a24 = item.agreement_24h as { score?: string | number } | undefined;
        const a30 = item.agreement_30day as { score?: string | number } | undefined;

        validators.push({
          publicKey: pubkey,
          masterKey: typeof item.master_key === 'string' ? item.master_key : undefined,
          domain: typeof item.domain === 'string' ? item.domain : undefined,
          domainVerified: Boolean(item.domain_verified ?? item.domain),
          unl: Boolean(item.unl),
          agreement1h: a1?.score !== undefined ? Number(a1.score) : null,
          agreement24h: a24?.score !== undefined ? Number(a24.score) : null,
          agreement30d: a30?.score !== undefined ? Number(a30.score) : null,
          serverVersion: typeof item.server_version === 'string' ? item.server_version : undefined,
          chain: typeof item.chain === 'string' ? item.chain : chainSegment,
        });
      }
    }

    const topology: TopologyNode[] = [];
    if (topoRes.status === 'fulfilled' && Array.isArray(topoRes.value.nodes)) {
      for (const node of topoRes.value.nodes) {
        const lat = Number(node.lat);
        const lon = Number(node.long ?? node.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        topology.push({
          pubkey: String(node.node_public_key ?? ''),
          version: typeof node.version === 'string' ? node.version : undefined,
          country: typeof node.country === 'string' ? node.country : undefined,
          lat,
          lon,
          inbound: typeof node.inbound_count === 'number' ? node.inbound_count : undefined,
          outbound: typeof node.outbound_count === 'number' ? node.outbound_count : undefined,
          uptime: typeof node.uptime === 'number' ? node.uptime : undefined,
        });
      }
    }

    validators.sort((a, b) => {
      if (a.unl !== b.unl) return a.unl ? -1 : 1;
      return (b.agreement24h ?? -1) - (a.agreement24h ?? -1);
    });

    const source = validators.length > 0 ? 'data.xrplf.org (VHS)' : 'offline-empty';
    const now = Date.now();
    this.validatorCache.set(cacheKey, {
      fetchedAt: now,
      data: { validators, topology, source },
    });

    return { validators, topology, fetchedAt: now, source };
  }

  public async fetchTokens(networkId: NetworkId): Promise<{
    tokens: TokenRecord[];
    fetchedAt: number;
    source: string;
  }> {
    if (networkId !== 'mainnet' && networkId !== 'custom') {
      return {
        tokens: [],
        fetchedAt: Date.now(),
        source: `${networkId}-live-discovery`,
      };
    }

    const cached = this.tokenCache.get('mainnet');
    if (cached && Date.now() - cached.fetchedAt < TOKEN_CACHE_TTL_MS) {
      return { ...cached.data, fetchedAt: cached.fetchedAt };
    }

    try {
      const data = await fetchJsonWithTimeout<{ tokens?: Array<Record<string, unknown>> }>(
        'https://s1.xrplmeta.org/tokens?limit=160&sort_by=trustlines&include_changes=false',
        12_000
      );

      const list: TokenRecord[] = [];
      for (const raw of data.tokens ?? []) {
        const currencyRaw = String(raw.currency ?? '');
        const issuer = String(raw.issuer ?? '');
        if (!currencyRaw || !issuer) continue;
        const meta = (raw.meta ?? {}) as Record<string, unknown>;
        const tokenMeta = (meta.token ?? {}) as Record<string, unknown>;
        const issuerMeta = (meta.issuer ?? {}) as Record<string, unknown>;
        const metrics = (raw.metrics ?? {}) as Record<string, unknown>;

        list.push({
          id: `${currencyRaw}:${issuer}`,
          currency: decodeCurrencyCode(currencyRaw),
          currencyRaw,
          issuer,
          name: typeof tokenMeta.name === 'string' ? tokenMeta.name : undefined,
          domain: typeof issuerMeta.domain === 'string' ? issuerMeta.domain : undefined,
          icon: typeof tokenMeta.icon === 'string' ? tokenMeta.icon : undefined,
          holders: Number(metrics.holders ?? 0) || 0,
          trustlines: Number(metrics.trustlines ?? 0) || 0,
          supply: Number(metrics.supply ?? 0) || 0,
          volume24hUsd: Number(metrics.volume_24h ?? 0) || 0,
          marketcapUsd: Number(metrics.marketcap ?? 0) || 0,
          priceUsd: Number(metrics.price ?? 0) || 0,
          source: 'xrplmeta',
        });
      }

      if (list.length > 0) {
        const now = Date.now();
        this.tokenCache.set('mainnet', {
          fetchedAt: now,
          data: { tokens: list, source: 's1.xrplmeta.org' },
        });
        return { tokens: list, fetchedAt: now, source: 's1.xrplmeta.org' };
      }
    } catch {
      // fall through
    }

    return {
      tokens: CURATED_FALLBACK_TOKENS,
      fetchedAt: Date.now(),
      source: 'curated-fallback',
    };
  }

  public async inspectTokenOnLedger(
    stream: XrplStreamManager,
    currencyRaw: string,
    issuer: string
  ): Promise<TokenOnLedgerReport> {
    const currency = decodeCurrencyCode(currencyRaw);
    const fetchedAt = Date.now();

    const [acctRes, gwRes, asksRes, bidsRes, ammRes] = await Promise.allSettled([
      stream.request('account_info', { account: issuer, ledger_index: 'validated' }),
      stream.request('gateway_balances', { account: issuer, ledger_index: 'validated' }),
      stream.request('book_offers', {
        taker_gets: { currency: currencyRaw, issuer },
        taker_pays: { currency: 'XRP' },
        limit: 18,
      }),
      stream.request('book_offers', {
        taker_gets: { currency: 'XRP' },
        taker_pays: { currency: currencyRaw, issuer },
        limit: 18,
      }),
      stream.request('amm_info', {
        asset: { currency: 'XRP' },
        asset2: { currency: currencyRaw, issuer },
      }),
    ]);

    let xrpBalance = '0';
    let flags = decodeIssuerRiskFlags(0);
    let error: string | undefined;

    if (acctRes.status === 'fulfilled') {
      const result = acctRes.value.result as Record<string, unknown> | undefined;
      const acctData = result?.account_data as Record<string, unknown> | undefined;
      if (acctData) {
        xrpBalance = dropsToXrpString(String(acctData.Balance ?? '0'), 2);
        flags = decodeIssuerRiskFlags(
          Number(acctData.Flags ?? 0),
          typeof acctData.RegularKey === 'string' ? acctData.RegularKey : undefined,
          typeof acctData.Domain === 'string' ? acctData.Domain : undefined
        );
      }
    } else {
      error = acctRes.reason instanceof Error ? acctRes.reason.message : 'Unable to fetch issuer account_info';
    }

    let totalObligation: string | undefined;
    if (gwRes.status === 'fulfilled') {
      const result = gwRes.value.result as Record<string, unknown> | undefined;
      const obligations = result?.obligations as Record<string, string> | undefined;
      if (obligations && obligations[currencyRaw]) {
        totalObligation = formatCompactNumber(Number(obligations[currencyRaw]));
      }
    }

    const asks: OrderbookLevel[] = [];
    if (asksRes.status === 'fulfilled') {
      const offers = ((asksRes.value.result as Record<string, unknown>)?.offers ?? []) as Array<
        Record<string, unknown>
      >;
      let running = 0;
      for (const offer of offers) {
        const gets = offer.TakerGets as { value?: string } | undefined;
        const paysXrp = dropsToXrpNumber(offer.TakerPays as string | undefined);
        const size = Number(gets?.value ?? 0);
        if (size > 0 && paysXrp > 0) {
          running += size;
          asks.push({
            price: paysXrp / size,
            size,
            total: running,
            account: String(offer.Account ?? ''),
          });
        }
      }
    }

    const bids: OrderbookLevel[] = [];
    if (bidsRes.status === 'fulfilled') {
      const offers = ((bidsRes.value.result as Record<string, unknown>)?.offers ?? []) as Array<
        Record<string, unknown>
      >;
      let running = 0;
      for (const offer of offers) {
        const getsXrp = dropsToXrpNumber(offer.TakerGets as string | undefined);
        const pays = offer.TakerPays as { value?: string } | undefined;
        const size = Number(pays?.value ?? 0);
        if (size > 0 && getsXrp > 0) {
          running += size;
          bids.push({
            price: getsXrp / size,
            size,
            total: running,
            account: String(offer.Account ?? ''),
          });
        }
      }
    }

    let amm: TokenOnLedgerReport['amm'] = null;
    if (ammRes.status === 'fulfilled') {
      const ammObj = (ammRes.value.result as Record<string, unknown>)?.amm as Record<string, unknown> | undefined;
      if (ammObj) {
        const amt1 = ammObj.amount;
        const amt2 = ammObj.amount2 as { value?: string; currency?: string } | undefined;
        const lp = ammObj.lp_token as { value?: string } | undefined;
        const asset1Numeric =
          typeof amt1 === 'string'
            ? dropsToXrpNumber(amt1)
            : Number((amt1 as { value?: string })?.value ?? 0);
        const asset2Numeric = Number(amt2?.value ?? 0);

        amm = {
          account: String(ammObj.account ?? ''),
          asset1Amount:
            typeof amt1 === 'string'
              ? `${dropsToXrpString(amt1, 2)} XRP`
              : `${formatCompactNumber(asset1Numeric)}`,
          asset2Amount: amt2?.value
            ? `${formatCompactNumber(asset2Numeric)} ${decodeCurrencyCode(amt2.currency ?? currencyRaw)}`
            : '—',
          asset1Numeric,
          asset2Numeric,
          tradingFeeBps: Number(ammObj.trading_fee ?? 0) / 10, // XRPL trading_fee 1..1000 => 0.1..100 bps
          lpTokenSupply: lp?.value ? formatCompactNumber(Number(lp.value)) : '—',
        };
      }
    }

    return {
      currency,
      currencyRaw,
      issuer,
      fetchedAt,
      xrpBalance,
      totalObligation,
      flags,
      bids,
      asks,
      amm,
      error,
    };
  }

  public async queryOracleAggregate(
    stream: XrplStreamManager,
    params: {
      baseAsset: string;
      quoteAsset: string;
      oracles: Array<{ account: string; oracleDocumentId: number }>;
    }
  ): Promise<OracleAggregateReport> {
    const baseAsset = encodeCurrencyCode(params.baseAsset);
    const quoteAsset = encodeCurrencyCode(params.quoteAsset);
    try {
      const res = await stream.request('get_aggregate_price', {
        base_asset: baseAsset,
        quote_asset: quoteAsset,
        trim: 20,
        oracles: params.oracles.map((o) => ({
          account: o.account.trim(),
          oracle_document_id: Number(o.oracleDocumentId),
        })),
      });
      const result = (res.result ?? {}) as Record<string, unknown>;
      const entire = result.entire_set as Record<string, unknown> | undefined;
      const trimmed = result.trimmed_set as Record<string, unknown> | undefined;
      return {
        ok: true,
        baseAsset: params.baseAsset,
        quoteAsset: params.quoteAsset,
        entireSetMean: entire?.mean !== undefined ? String(entire.mean) : undefined,
        trimmedMean: trimmed?.mean !== undefined ? String(trimmed.mean) : undefined,
        median: result.median !== undefined ? String(result.median) : undefined,
        size: typeof entire?.size === 'number' ? entire.size : undefined,
        time: typeof result.time === 'number' ? rippleTimeToUnixMs(result.time) : undefined,
      };
    } catch (err) {
      return {
        ok: false,
        baseAsset: params.baseAsset,
        quoteAsset: params.quoteAsset,
        error: err instanceof Error ? err.message : 'get_aggregate_price query failed',
      };
    }
  }

  public async resolveDid(stream: XrplStreamManager, address: string): Promise<DidResolutionReport> {
    const clean = address.trim();
    const network = stream.getStatus().networkId === 'testnet' ? 'testnet' : '1';
    const did = `did:xrpl:${network}:${clean}`;

    try {
      const res = await stream.request('ledger_entry', {
        did: clean,
        ledger_index: 'validated',
      });
      const node = ((res.result as Record<string, unknown>)?.node ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        did,
        address: clean,
        uri: decodeHexAscii(typeof node.URI === 'string' ? node.URI : undefined),
        didDocument: decodeHexAscii(typeof node.DIDDocument === 'string' ? node.DIDDocument : undefined),
        data: decodeHexAscii(typeof node.Data === 'string' ? node.Data : undefined),
      };
    } catch (err) {
      return {
        ok: false,
        did,
        address: clean,
        error: err instanceof Error ? err.message : 'No DID ledger object found for this account',
      };
    }
  }

  public async inspectQuery(stream: XrplStreamManager, rawQuery: string): Promise<InspectorResult> {
    const query = rawQuery.trim();
    const kind = detectQueryKind(query);

    try {
      if (kind === 'account') {
        const [infoRes, linesRes, txRes] = await Promise.allSettled([
          stream.request('account_info', { account: query, ledger_index: 'validated' }),
          stream.request('account_lines', { account: query, limit: 30, ledger_index: 'validated' }),
          stream.request('account_tx', { account: query, limit: 15 }),
        ]);

        if (infoRes.status !== 'fulfilled') {
          throw infoRes.reason;
        }

        const result = infoRes.value.result as Record<string, unknown>;
        const acct = result.account_data as Record<string, unknown>;
        const flags = decodeIssuerRiskFlags(
          Number(acct.Flags ?? 0),
          typeof acct.RegularKey === 'string' ? acct.RegularKey : undefined,
          typeof acct.Domain === 'string' ? acct.Domain : undefined
        );

        const trustlines =
          linesRes.status === 'fulfilled'
            ? (((linesRes.value.result as Record<string, unknown>)?.lines ?? []) as Array<Record<string, unknown>>).map(
                (l) => ({
                  currency: decodeCurrencyCode(String(l.currency ?? '')),
                  currencyRaw: String(l.currency ?? ''),
                  account: String(l.account ?? ''),
                  balance: String(l.balance ?? '0'),
                  limit: String(l.limit ?? '0'),
                })
              )
            : [];

        const transactions: LiveTransaction[] = [];
        if (txRes.status === 'fulfilled') {
          const txList = ((txRes.value.result as Record<string, unknown>)?.transactions ?? []) as Array<
            Record<string, unknown>
          >;
          for (const item of txList) {
            const parsed = parseLiveTransactionEvent({
              transaction: item.tx ?? item.tx_json,
              validated: item.validated ?? true,
              ledger_index: (item.tx as Record<string, unknown> | undefined)?.ledger_index,
              engine_result: (item.meta as Record<string, unknown> | undefined)?.TransactionResult,
            });
            if (parsed) transactions.push(parsed);
          }
        }

        return {
          kind: 'account',
          query,
          title: query,
          subtitle: flags.domain ? `Verified Domain: ${flags.domain}` : 'XRPL AccountRoot (Validated)',
          summary: [
            { label: 'XRP Balance', value: `${dropsToXrpString(String(acct.Balance ?? '0'), 4)} XRP`, tone: 'cyan' },
            { label: 'Sequence', value: String(acct.Sequence ?? '—'), tone: 'slate' },
            { label: 'Owner Count', value: String(acct.OwnerCount ?? 0), tone: 'slate' },
            { label: 'TrustLines Loaded', value: String(trustlines.length), tone: 'mint' },
          ],
          flags,
          trustlines,
          transactions,
          raw: result,
        };
      }

      if (kind === 'hash') {
        const res = await stream.request('tx', { transaction: query });
        const result = res.result as Record<string, unknown>;
        const txPayload = (result.tx_json ?? result) as Record<string, unknown>;
        const meta = result.meta as Record<string, unknown> | undefined;
        const parsed = parseLiveTransactionEvent({
          transaction: txPayload,
          hash: query,
          validated: result.validated,
          ledger_index: result.ledger_index,
          engine_result: meta?.TransactionResult,
        });

        return {
          kind: 'transaction',
          query,
          title: `${String(txPayload.TransactionType ?? 'Transaction')}`,
          subtitle: query,
          summary: [
            { label: 'Result', value: String(meta?.TransactionResult ?? (result.validated ? 'tesSUCCESS' : 'Pending')), tone: meta?.TransactionResult === 'tesSUCCESS' ? 'mint' : 'amber' },
            { label: 'Ledger', value: `#${String(result.ledger_index ?? '—')}`, tone: 'cyan' },
            { label: 'Amount', value: parsed?.amountDisplay ?? '—', tone: 'cyan' },
            { label: 'Fee', value: `${String(txPayload.Fee ?? '—')} drops`, tone: 'slate' },
            { label: 'Account', value: String(txPayload.Account ?? '—'), tone: 'slate' },
            ...(txPayload.Destination
              ? [{ label: 'Destination', value: String(txPayload.Destination), tone: 'slate' as const }]
              : []),
          ],
          raw: result,
        };
      }

      if (kind === 'ledger') {
        const seq = Number(query);
        const res = await stream.request('ledger', {
          ledger_index: seq,
          transactions: true,
          expand: true,
        });
        const result = res.result as Record<string, unknown>;
        const ledger = (result.ledger ?? {}) as Record<string, unknown>;
        const rawTxs = (ledger.transactions ?? []) as Array<Record<string, unknown>>;
        const transactions: LiveTransaction[] = [];
        for (const item of rawTxs.slice(0, 60)) {
          const parsed = parseLiveTransactionEvent({
            transaction: item,
            hash: item.hash,
            validated: result.validated ?? true,
            ledger_index: seq,
            engine_result: (item.metaData as Record<string, unknown> | undefined)?.TransactionResult,
          });
          if (parsed) transactions.push(parsed);
        }

        return {
          kind: 'ledger',
          query,
          title: `Ledger #${seq.toLocaleString()}`,
          subtitle: String(ledger.ledger_hash ?? ''),
          summary: [
            { label: 'Transactions', value: String(rawTxs.length), tone: 'cyan' },
            {
              label: 'Close Time',
              value: new Date(
                rippleTimeToUnixMs(typeof ledger.close_time === 'number' ? ledger.close_time : undefined)
              ).toLocaleTimeString(),
              tone: 'mint',
            },
            { label: 'Total Coins', value: `${dropsToXrpString(String(ledger.total_coins ?? '0'), 0)} XRP`, tone: 'slate' },
            { label: 'Validated', value: result.validated ? 'YES' : 'NO', tone: result.validated ? 'mint' : 'amber' },
          ],
          transactions,
          raw: { ...ledger, transactions: `[${rawTxs.length} transactions]` },
        };
      }

      return {
        kind: 'error',
        query,
        title: 'Unrecognized On-Ledger Identifier',
        subtitle: 'Enter an r-address, 64-character tx hash, or numeric ledger index.',
        summary: [],
        raw: { query },
      };
    } catch (err) {
      return {
        kind: 'error',
        query,
        title: 'Ledger Lookup Failed',
        subtitle: err instanceof Error ? err.message : 'Unknown XRPL RPC error',
        summary: [],
        raw: { query, error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}
