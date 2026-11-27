import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BellPlus,
  Coins,
  Droplets,
  Lock,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import { canonicalTokenKey, parseTokenQueryInput } from '../shared/tokenDiscoveryUtils';
import type { TokenRecord } from '../shared/types';
import { computeClobVsAmmSpread } from '../shared/v023Utils';
import { simulateAmmLpYield } from '../shared/v024Utils';
import {
  decodeCurrencyCode,
  encodeCurrencyCode,
  formatCompactNumber,
  shortenAddress,
} from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';
import { DexChartPanel } from './DexChartPanel';
import { DexDepthCanvas } from './DexDepthCanvas';

type TokenViewMode = 'all' | 'live' | 'pinned';

export const TokenExplorer: React.FC = () => {
  const tokens = useCommandStore((s) => s.tokens);
  const liveStreamTokens = useCommandStore((s) => s.liveStreamTokens);
  const pinnedTokens = useCommandStore((s) => s.pinnedTokens);
  const tokenSearchResults = useCommandStore((s) => s.tokenSearchResults);
  const tokenSearchLoading = useCommandStore((s) => s.tokenSearchLoading);
  const tokenSearchSource = useCommandStore((s) => s.tokenSearchSource);
  const tokensHasMore = useCommandStore((s) => s.tokensHasMore);
  const tokensLoading = useCommandStore((s) => s.tokensLoading);
  const tokensSource = useCommandStore((s) => s.tokensSource);
  const refreshTokens = useCommandStore((s) => s.refreshTokens);
  const loadMoreTokens = useCommandStore((s) => s.loadMoreTokens);
  const searchLedgerTokens = useCommandStore((s) => s.searchLedgerTokens);
  const clearTokenSearch = useCommandStore((s) => s.clearTokenSearch);
  const pinToken = useCommandStore((s) => s.pinToken);
  const unpinToken = useCommandStore((s) => s.unpinToken);
  const selectedToken = useCommandStore((s) => s.selectedToken);
  const tokenOnLedgerReport = useCommandStore((s) => s.tokenOnLedgerReport);
  const tokenReportLoading = useCommandStore((s) => s.tokenReportLoading);
  const selectToken = useCommandStore((s) => s.selectToken);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);
  const handoffToWallet = useCommandStore((s) => s.handoffToWallet);
  const marketPrice = useCommandStore((s) => s.marketPrice);
  const priceAlerts = useCommandStore((s) => s.priceAlerts);
  const addPriceAlert = useCommandStore((s) => s.addPriceAlert);
  const removePriceAlert = useCommandStore((s) => s.removePriceAlert);

  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<TokenViewMode>('all');
  const [sortBy, setSortBy] = useState<'trustlines' | 'volume24hUsd' | 'holders' | 'recent'>('trustlines');
  const [alertDir, setAlertDir] = useState<'above' | 'below'>('above');
  const [alertPriceInput, setAlertPriceInput] = useState('');

  // Custom On-Ledger Token Inspect & Pin form
  const [customBarOpen, setCustomBarOpen] = useState(false);
  const [customCur, setCustomCur] = useState('');
  const [customIssuer, setCustomIssuer] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Track 2: XLS-30 AMM Impermanent Loss & LP Yield Simulator state
  const [simDepositXrp, setSimDepositXrp] = useState(2500);
  const [simPriceChangePct, setSimPriceChangePct] = useState(50);
  const [simDailyVolXrp, setSimDailyVolXrp] = useState(120_000);
  const [simHoldingDays, setSimHoldingDays] = useState(90);

  // Debounced full-ledger remote search across 100,000+ XRPLMeta tokens + on-ledger RPC
  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      clearTokenSearch();
      return;
    }
    const timer = setTimeout(() => {
      void searchLedgerTokens(clean);
    }, 420);
    return () => clearTimeout(timer);
  }, [query, searchLedgerTokens, clearTokenSearch]);

  const spreadReport = useMemo(
    () => (tokenOnLedgerReport ? computeClobVsAmmSpread(tokenOnLedgerReport) : null),
    [tokenOnLedgerReport]
  );

  const lpSimResult = useMemo(() => {
    const xrpReserve = tokenOnLedgerReport?.amm?.asset1Numeric ?? 50_000;
    const feeBps = spreadReport?.ammTradingFeeBps ?? 30;
    return simulateAmmLpYield({
      depositXrpTotal: simDepositXrp,
      poolTvlXrp: xrpReserve * 2,
      dailyVolumeXrp: simDailyVolXrp,
      tradingFeeBps: feeBps,
      priceChangePct: simPriceChangePct,
      holdingDays: simHoldingDays,
    });
  }, [
    tokenOnLedgerReport,
    spreadReport,
    simDepositXrp,
    simPriceChangePct,
    simDailyVolXrp,
    simHoldingDays,
  ]);

  const pinnedKeySet = useMemo(
    () => new Set(pinnedTokens.map((t) => canonicalTokenKey(t.currencyRaw || t.currency, t.issuer))),
    [pinnedTokens]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const parsedQuery = parseTokenQueryInput(query);
    const baseList =
      viewMode === 'live'
        ? liveStreamTokens
        : viewMode === 'pinned'
          ? pinnedTokens
          : tokens;

    const list = baseList.filter((t) => {
      if (!q) return true;
      if (parsedQuery.kind === 'pair') {
        const issuerMatches = t.issuer.toLowerCase() === parsedQuery.issuer.toLowerCase();
        const curMatches =
          t.currencyRaw.toLowerCase() === parsedQuery.currencyRaw.toLowerCase() ||
          t.currency.toLowerCase() === parsedQuery.currency.toLowerCase();
        if (issuerMatches && curMatches) return true;
      }
      const pairStr = `${t.currency}:${t.issuer}`.toLowerCase();
      return (
        t.currency.toLowerCase().includes(q) ||
        t.currencyRaw.toLowerCase().includes(q) ||
        (t.name ?? '').toLowerCase().includes(q) ||
        t.issuer.toLowerCase().includes(q) ||
        (t.domain ?? '').toLowerCase().includes(q) ||
        pairStr.includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (q) {
        const aExact = a.currency.toLowerCase() === q ? 1 : 0;
        const bExact = b.currency.toLowerCase() === q ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
      }
      if (viewMode === 'live' || sortBy === 'recent') {
        const dt = (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0);
        if (dt !== 0) return dt;
        return (b.liveTxCount ?? 0) - (a.liveTxCount ?? 0);
      }
      const metricDiff = (b[sortBy] ?? 0) - (a[sortBy] ?? 0);
      if (metricDiff !== 0) return metricDiff;
      return (b.supply ?? 0) - (a.supply ?? 0);
    });
  }, [tokens, liveStreamTokens, pinnedTokens, viewMode, query, sortBy]);

  const topTiles = filtered.slice(0, 8);

  const handleInspectCustomToken = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    const cur = customCur.trim();
    const iss = customIssuer.trim();
    if (!cur || cur.toUpperCase() === 'XRP') {
      setCustomError('Enter a non-XRP currency symbol (e.g. RIP, RLUSD) or 40-char hex.');
      return;
    }
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(iss)) {
      setCustomError('Enter a valid XRPL classic issuer r-address.');
      return;
    }
    let currencyRaw: string;
    try {
      currencyRaw = encodeCurrencyCode(cur);
    } catch {
      setCustomError('Unsupported currency code format (max 20 ASCII chars or 40-char hex).');
      return;
    }
    const token: TokenRecord = {
      id: canonicalTokenKey(currencyRaw, iss),
      currency: decodeCurrencyCode(currencyRaw),
      currencyRaw,
      issuer: iss,
      holders: 0,
      trustlines: 0,
      supply: 0,
      volume24hUsd: 0,
      marketcapUsd: 0,
      priceUsd: 0,
      source: 'pinned',
      pinned: true,
      lastSeenAt: Date.now(),
    };
    pinToken(token);
    void selectToken(token);
    setCustomCur('');
    setCustomIssuer('');
    setCustomBarOpen(false);
  };

  const togglePin = (e: React.MouseEvent, t: TokenRecord) => {
    e.stopPropagation();
    const key = canonicalTokenKey(t.currencyRaw || t.currency, t.issuer);
    if (pinnedKeySet.has(key)) {
      unpinToken(key);
    } else {
      pinToken(t);
    }
  };

  return (
    <div className="space-y-4">
      {/* Visual Token Treemap Strip */}
      <div className="hud-panel rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
              XRPL Token Universe — Full Ledger Search, Live Stream &amp; Pinned Assets
            </h2>
            {tokensSource && (
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                {tokensSource} • {tokens.length} loaded
              </span>
            )}
            {liveStreamTokens.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/35 text-[10px] font-mono text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {liveStreamTokens.length} streaming live
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCustomBarOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-colors ${
                customBarOpen
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-slate-950 border-slate-700 hover:border-cyan-400/60 text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              Add / Pin Custom Token
            </button>
            <button
              type="button"
              onClick={() =>
                handoffToWallet({
                  subTab: 'dex-amm',
                  tokenCurrency: selectedToken?.currency,
                  tokenIssuer: selectedToken?.issuer,
                })
              }
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/40 hover:bg-emerald-500/25 text-xs font-mono text-emerald-200"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Quick Swap / Trade
            </button>
            <button
              type="button"
              onClick={() => void refreshTokens()}
              disabled={tokensLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 hover:border-cyan-400/60 text-xs text-slate-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${tokensLoading ? 'animate-spin text-cyan-400' : ''}`} />
              Sync Index
            </button>
          </div>
        </div>

        {/* Inline Custom On-Ledger Token Inspect & Pin Form */}
        {customBarOpen && (
          <form
            onSubmit={handleInspectCustomToken}
            className="mb-3 p-3 rounded-xl bg-slate-950/90 border border-cyan-500/35 flex flex-wrap items-center gap-2 text-xs font-mono"
          >
            <span className="text-[10px] uppercase text-cyan-300 shrink-0">Inspect &amp; Pin Any On-Ledger Token:</span>
            <input
              type="text"
              value={customCur}
              onChange={(e) => setCustomCur(e.target.value)}
              placeholder="Currency (e.g. RIP, RLUSD)"
              className="w-40 rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-400"
            />
            <input
              type="text"
              value={customIssuer}
              onChange={(e) => setCustomIssuer(e.target.value)}
              placeholder="Issuer classic address (r…)"
              className="flex-1 min-w-[230px] rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/30"
            >
              Inspect &amp; Pin
            </button>
            {customError && (
              <div className="w-full text-[11px] text-rose-300 mt-1">{customError}</div>
            )}
          </form>
        )}

        {/* Live XRP Price Target Alerts Bar (v0.2.0-beta) */}
        <div className="mb-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] uppercase text-cyan-300">
              <BellPlus className="w-3.5 h-3.5" />
              XRP Price Alerts
            </span>
            {marketPrice.xrpUsd !== null && (
              <span className="text-[11px] text-slate-400">
                Spot: <strong className="text-white">${marketPrice.xrpUsd.toFixed(4)}</strong>
              </span>
            )}
            <select
              value={alertDir}
              onChange={(e) => setAlertDir(e.target.value as 'above' | 'below')}
              className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-white"
            >
              <option value="above">Crosses Above</option>
              <option value="below">Drops Below</option>
            </select>
            <input
              type="number"
              step="0.01"
              min="0.0001"
              value={alertPriceInput}
              onChange={(e) => setAlertPriceInput(e.target.value)}
              placeholder="Target USD (e.g. 3.00)"
              className="w-36 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-white"
            />
            <button
              type="button"
              onClick={() => {
                const val = Number(alertPriceInput);
                if (Number.isFinite(val) && val > 0) {
                  addPriceAlert('XRP', alertDir, val);
                  setAlertPriceInput('');
                }
              }}
              className="px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-400/50 text-[11px] text-cyan-200 hover:bg-cyan-500/30"
            >
              Set Alert
            </button>
          </div>
          {priceAlerts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {priceAlerts.slice(0, 4).map((r) => (
                <span
                  key={r.id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${
                    r.triggeredAt
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  {r.symbol} {r.direction === 'above' ? '≥' : '≤'} ${r.targetUsd.toFixed(2)}
                  {r.triggeredAt ? ' ✓' : ''}
                  <button
                    type="button"
                    onClick={() => removePriceAlert(r.id)}
                    className="text-slate-500 hover:text-rose-300 ml-0.5"
                    title="Remove alert"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {topTiles.map((t, i) => {
            const active = selectedToken?.id === t.id;
            const palettes = [
              'from-cyan-500/20 to-sky-500/5 border-cyan-400/40',
              'from-emerald-500/20 to-teal-500/5 border-emerald-400/40',
              'from-violet-500/20 to-indigo-500/5 border-violet-400/40',
              'from-amber-500/20 to-orange-500/5 border-amber-400/40',
            ];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => void selectToken(t)}
                className={`rounded-xl p-2.5 text-left border bg-gradient-to-br transition-all hover:scale-[1.02] ${
                  active
                    ? 'ring-2 ring-cyan-400 border-cyan-300 from-cyan-500/25 to-slate-900'
                    : palettes[i % palettes.length]
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-bold text-white truncate">{t.currency}</span>
                  {(t.source === 'live-stream' || (t.liveTxCount ?? 0) > 0) && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Observed live on stream" />
                  )}
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  {t.domain ?? t.name ?? shortenAddress(t.issuer, 5, 4)}
                </div>
                <div className="mt-2 font-mono text-[10px] text-cyan-200 tabular-nums">
                  {t.trustlines > 0
                    ? `${formatCompactNumber(t.trustlines)} TL`
                    : t.liveTxCount
                      ? `${t.liveTxCount} live tx`
                      : 'On-Ledger'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Full-Width Pro OHLCV Candlestick Chart & Technical Indicators */}
      <DexChartPanel
        selectedToken={selectedToken}
        tokenOnLedgerReport={tokenOnLedgerReport}
        priceAlerts={priceAlerts}
        xrpUsdSpot={marketPrice.xrpUsd}
      />

      {/* Main Split: Directory Table + Authoritative On-Ledger Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Directory Table */}
        <div className="xl:col-span-7 hud-panel rounded-xl p-4 flex flex-col">
          {/* Discovery View Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-2.5 py-1 rounded-lg border transition-colors ${
                  viewMode === 'all'
                    ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All Ledger ({tokens.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('live')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
                  viewMode === 'live'
                    ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Radio className="w-3 h-3 text-emerald-400" />
                Live on Stream ({liveStreamTokens.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('pinned')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
                  viewMode === 'pinned'
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Star className="w-3 h-3 text-amber-400" />
                Pinned ({pinnedTokens.length})
              </button>
            </div>

            {tokenSearchLoading ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-300">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Searching full 100k+ ledger registry…
              </span>
            ) : (
              query.trim().length >= 2 &&
              tokenSearchSource && (
                <span className="text-[10px] font-mono text-emerald-300/90">
                  +{tokenSearchResults.length} matches via {tokenSearchSource}
                </span>
              )
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void searchLedgerTokens(query.trim());
            }}
            className="flex flex-wrap items-center justify-between gap-2 mb-3"
          >
            <div className="relative flex-1 min-w-[210px]">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ANY ledger token (RIP, RLUSD), rIssuer, or RIP:rIssuer…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <button
              type="submit"
              disabled={tokenSearchLoading || !query.trim()}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
            >
              Search Ledger
            </button>

            <select
              aria-label="Sort tokens"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="trustlines">Sort: Trustlines</option>
              <option value="holders">Sort: Holders</option>
              <option value="volume24hUsd">Sort: 24h Volume</option>
              <option value="recent">Sort: Live Activity</option>
            </select>
          </form>

          <div className="overflow-auto max-h-[520px]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-panel z-10 text-[10px] font-mono uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-1.5 w-7" aria-label="Pin" />
                  <th className="py-2 px-2.5">Asset</th>
                  <th className="py-2 px-2.5">Issuer / Domain</th>
                  <th className="py-2 px-2.5 text-right">Trustlines</th>
                  <th className="py-2 px-2.5 text-right">Holders</th>
                  <th className="py-2 px-2.5 text-right">Supply / Live</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center font-mono text-xs text-slate-500">
                      {tokenSearchLoading
                        ? 'Searching XRPLMeta & on-ledger issuers…'
                        : viewMode === 'live'
                          ? 'Listening for issued tokens on the live XRPL transaction stream…'
                          : viewMode === 'pinned'
                            ? 'No pinned tokens yet. Click the ★ icon on any token or use "Add / Pin Custom Token".'
                            : 'No local matches yet. Click "Search Ledger" or enter CURRENCY:rIssuer to query directly on-ledger.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => {
                    const active = selectedToken?.id === t.id;
                    const isPinned = pinnedKeySet.has(canonicalTokenKey(t.currencyRaw || t.currency, t.issuer));
                    return (
                      <tr
                        key={t.id}
                        onClick={() => void selectToken(t)}
                        className={`cursor-pointer transition-colors ${
                          active ? 'bg-cyan-500/15' : 'hover:bg-slate-900/70'
                        }`}
                      >
                        <td className="py-2 px-1.5">
                          <button
                            type="button"
                            onClick={(e) => togglePin(e, t)}
                            title={isPinned ? 'Unpin token' : 'Pin token for quick access'}
                            className={`p-1 rounded hover:bg-slate-800 ${
                              isPinned ? 'text-amber-400' : 'text-slate-600 hover:text-amber-300'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-400' : ''}`} />
                          </button>
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="font-mono font-bold text-white flex items-center gap-1.5">
                            <span>{t.currency}</span>
                            {(t.source === 'live-stream' || (t.liveTxCount ?? 0) > 0) && (
                              <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-[9px] text-emerald-300">
                                LIVE{t.liveTxCount ? ` ${t.liveTxCount}` : ''}
                              </span>
                            )}
                            {t.source === 'on-ledger' && (
                              <span className="px-1 py-0.2 rounded bg-cyan-500/20 text-[9px] text-cyan-300">
                                RPC
                              </span>
                            )}
                          </div>
                          {t.name && <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{t.name}</div>}
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="text-slate-200 text-[11px] truncate max-w-[160px]">
                            {t.domain ?? '—'}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {shortenAddress(t.issuer, 8, 5)}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-cyan-300">
                          {t.trustlines > 0 ? formatCompactNumber(t.trustlines) : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-300">
                          {t.holders > 0 ? formatCompactNumber(t.holders) : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-400">
                          {t.supply > 0
                            ? formatCompactNumber(t.supply)
                            : t.liveTxCount
                              ? `${t.liveTxCount} tx`
                              : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {viewMode === 'all' && !query.trim() && tokensHasMore && (
            <div className="pt-3 mt-2 border-t border-slate-800/80 flex justify-center">
              <button
                type="button"
                disabled={tokensLoading}
                onClick={() => void loadMoreTokens()}
                className="px-4 py-1.5 rounded-lg bg-slate-950 border border-slate-700 hover:border-cyan-400/60 text-xs font-mono text-cyan-200 disabled:opacity-50"
              >
                {tokensLoading ? 'Loading next 200 tokens…' : 'Load More Tokens from XRPLMeta (+200)'}
              </button>
            </div>
          )}
        </div>

        {/* Authoritative On-Ledger Inspector (Direct Node RPC) */}
        <div className="xl:col-span-5 hud-panel rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                On-Ledger Issuer, DEX &amp; AMM Verification
              </h3>
              <p className="text-[11px] text-slate-400">
                Queried directly from connected XRPL node (`account_info`, `book_offers`, `amm_info`)
              </p>
            </div>
          </div>

          {!selectedToken ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-14 text-slate-500">
              <Coins className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs font-mono">Select any token on the left to verify live on-ledger state</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Checks Blackhole status, GlobalFreeze, Clawback flags, live DEX depth &amp; AMM pool reserves
              </p>
            </div>
          ) : tokenReportLoading ? (
            <div className="flex-1 flex items-center justify-center py-16 text-xs font-mono text-cyan-300">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              Querying on-ledger issuer flags, orderbook &amp; AMM pool...
            </div>
          ) : tokenOnLedgerReport ? (
            <div className="space-y-4 overflow-y-auto max-h-[500px] pr-1">
              {/* Token Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-mono font-bold text-white flex items-center gap-2">
                    <span>{tokenOnLedgerReport.currency}</span>
                    {tokenOnLedgerReport.flags.domain && (
                      <span className="text-xs font-normal text-cyan-300">
                        ({tokenOnLedgerReport.flags.domain})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void inspectQuery(tokenOnLedgerReport.issuer)}
                    className="font-mono text-[11px] text-slate-400 hover:text-cyan-300 underline decoration-dotted"
                  >
                    {tokenOnLedgerReport.issuer}
                  </button>
                </div>
                <div className="text-right font-mono text-xs">
                  <div className="text-slate-500 text-[10px]">ON-LEDGER OBLIGATIONS</div>
                  <div className="text-emerald-300 font-bold">
                    {tokenOnLedgerReport.totalObligation
                      ? `${tokenOnLedgerReport.totalObligation} ${tokenOnLedgerReport.currency}`
                      : 'Verified via RPC'}
                  </div>
                </div>
              </div>

              {/* Issuer Security / Risk Flags */}
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">
                  Issuer Security &amp; Governance Flags
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono border ${
                      tokenOnLedgerReport.flags.blackholed
                        ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    {tokenOnLedgerReport.flags.blackholed ? 'Blackholed (Immutable)' : 'Active Key'}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono border ${
                      tokenOnLedgerReport.flags.globalFreeze
                        ? 'bg-rose-500/20 border-rose-400/50 text-rose-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <ShieldAlert className="w-3 h-3" />
                    GlobalFreeze: {tokenOnLedgerReport.flags.globalFreeze ? 'ON' : 'OFF'}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono border ${
                      tokenOnLedgerReport.flags.noFreeze
                        ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                        : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {tokenOnLedgerReport.flags.noFreeze ? 'NoFreeze Enforced' : 'Issuer Can Freeze'}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono border ${
                      tokenOnLedgerReport.flags.allowClawback
                        ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Clawback: {tokenOnLedgerReport.flags.allowClawback ? 'ENABLED' : 'OFF'}
                  </span>

                  {tokenOnLedgerReport.flags.defaultRipple && (
                    <span className="px-2 py-1 rounded-lg text-[11px] font-mono bg-cyan-500/10 border border-cyan-400/30 text-cyan-300">
                      DefaultRipple
                    </span>
                  )}
                </div>
              </div>

              {/* AMM Pool Card */}
              <div className="rounded-xl p-3 bg-violet-500/10 border border-violet-400/30">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-violet-300">
                    <Droplets className="w-3.5 h-3.5" />
                    XRP / {tokenOnLedgerReport.currency} AMM Pool
                  </div>
                  {tokenOnLedgerReport.amm && (
                    <span className="text-[10px] font-mono text-violet-200">
                      Fee: {tokenOnLedgerReport.amm.tradingFeeBps.toFixed(2)}%
                    </span>
                  )}
                </div>
                {tokenOnLedgerReport.amm ? (
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400">Reserve 1</div>
                      <div className="text-white">{tokenOnLedgerReport.amm.asset1Amount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Reserve 2</div>
                      <div className="text-emerald-300">{tokenOnLedgerReport.amm.asset2Amount}</div>
                    </div>
                    <div className="col-span-2 text-[10px] text-slate-400">
                      LP Supply: {tokenOnLedgerReport.amm.lpTokenSupply} • Pool:{' '}
                      {shortenAddress(tokenOnLedgerReport.amm.account, 8, 5)}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs font-mono text-slate-400">
                    No active XRP/{tokenOnLedgerReport.currency} AMM pool found on this network.
                  </div>
                )}
              </div>

              {/* Live CLOB vs. AMM Spread & Liquidity Radar */}
              {spreadReport && (
                <div className="rounded-xl p-3 bg-cyan-500/10 border border-cyan-400/30 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-cyan-300">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      CLOB vs. AMM Spread Radar
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                        spreadReport.cheaperVenue === 'AMM'
                          ? 'bg-violet-500/20 border-violet-400/40 text-violet-200'
                          : spreadReport.cheaperVenue === 'CLOB'
                            ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                            : spreadReport.cheaperVenue === 'PARITY'
                              ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                              : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      {spreadReport.cheaperVenue === 'INSUFFICIENT_DATA'
                        ? 'SINGLE VENUE'
                        : spreadReport.cheaperVenue === 'PARITY'
                          ? 'PARITY'
                          : `${spreadReport.cheaperVenue} CHEAPER`}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                    <div className="rounded-lg bg-slate-950/75 border border-slate-800 p-2">
                      <div className="text-[10px] text-slate-400">CLOB Mid</div>
                      <div className="text-white font-semibold tabular-nums">
                        {spreadReport.clobMidPriceXrp !== null
                          ? `${spreadReport.clobMidPriceXrp.toPrecision(4)} XRP`
                          : '—'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-950/75 border border-slate-800 p-2">
                      <div className="text-[10px] text-slate-400">AMM Spot</div>
                      <div className="text-violet-300 font-semibold tabular-nums">
                        {spreadReport.ammSpotPriceXrp !== null
                          ? `${spreadReport.ammSpotPriceXrp.toPrecision(4)} XRP`
                          : '—'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-950/75 border border-slate-800 p-2">
                      <div className="text-[10px] text-slate-400">Spread / LP Fee</div>
                      <div className="text-emerald-300 font-semibold tabular-nums">
                        {spreadReport.absSpreadPct !== null ? `${spreadReport.absSpreadPct.toFixed(2)}%` : '—'}
                        {spreadReport.ammTradingFeeBps !== null
                          ? ` • ${spreadReport.ammTradingFeeBps.toFixed(0)} bps`
                          : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <span className="text-[11px] font-mono text-slate-300">{spreadReport.summary}</span>
                    <button
                      type="button"
                      onClick={() =>
                        handoffToWallet({
                          subTab: 'dex-amm',
                          tokenCurrency: tokenOnLedgerReport.currency,
                          tokenIssuer: tokenOnLedgerReport.issuer,
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-[11px] font-mono text-cyan-200 hover:bg-cyan-500/30 shrink-0"
                    >
                      Swap / Provide LP →
                    </button>
                  </div>
                </div>
              )}

              {/* Track 2: XLS-30 AMM Impermanent Loss & LP Yield Simulator */}
              <div className="rounded-xl p-3 bg-emerald-500/5 border border-emerald-400/25 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-mono uppercase text-emerald-300">
                    XLS-30 AMM Impermanent Loss &amp; LP Yield Simulator
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Est. APR: <strong className="text-emerald-300">{lpSimResult.estimatedAprPct}%</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 font-mono text-[10px]">
                  <label className="space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Deposit (XRP)</span>
                      <span className="text-white">{simDepositXrp.toLocaleString()}</span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={50000}
                      step={100}
                      value={simDepositXrp}
                      onChange={(e) => setSimDepositXrp(Number(e.target.value))}
                      className="w-full accent-emerald-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Price Move</span>
                      <span className={simPriceChangePct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                        {simPriceChangePct >= 0 ? `+${simPriceChangePct}%` : `${simPriceChangePct}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-80}
                      max={400}
                      step={5}
                      value={simPriceChangePct}
                      onChange={(e) => setSimPriceChangePct(Number(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>24h Pool Vol (XRP)</span>
                      <span className="text-cyan-300">{formatCompactNumber(simDailyVolXrp)}</span>
                    </div>
                    <input
                      type="range"
                      min={5000}
                      max={2000000}
                      step={5000}
                      value={simDailyVolXrp}
                      onChange={(e) => setSimDailyVolXrp(Number(e.target.value))}
                      className="w-full accent-violet-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Horizon</span>
                      <span className="text-white">{simHoldingDays}d</span>
                    </div>
                    <input
                      type="range"
                      min={7}
                      max={365}
                      step={1}
                      value={simHoldingDays}
                      onChange={(e) => setSimHoldingDays(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                  <div className="rounded-lg bg-slate-950/75 border border-slate-800 p-2">
                    <div className="text-[9px] text-slate-400">Impermanent Loss</div>
                    <div className="text-amber-300 font-bold tabular-nums">
                      {lpSimResult.impermanentLossPct}% ({lpSimResult.impermanentLossXrp.toFixed(1)} XRP)
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-950/75 border border-slate-800 p-2">
                    <div className="text-[9px] text-slate-400">Fee Yield ({simHoldingDays}d)</div>
                    <div className="text-emerald-300 font-bold tabular-nums">
                      +{lpSimResult.projectedFeeYieldXrp.toFixed(1)} XRP
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-950/75 border border-slate-800 p-2">
                    <div className="text-[9px] text-slate-400">Net vs. HODL</div>
                    <div
                      className={`font-bold tabular-nums ${
                        lpSimResult.netVsHodlXrp >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {lpSimResult.netVsHodlXrp >= 0 ? '+' : ''}
                      {lpSimResult.netVsHodlXrp.toFixed(1)} XRP
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-slate-400 flex justify-between">
                  <span>Pool Share: {lpSimResult.poolSharePct.toFixed(3)}%</span>
                  <span>
                    IL Break-Even:{' '}
                    <strong className="text-cyan-200">
                      {lpSimResult.breakEvenDays === null
                        ? '∞'
                        : lpSimResult.breakEvenDays === 0
                          ? 'Immediate'
                          : `${lpSimResult.breakEvenDays} days`}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Interactive CLOB Depth Wall & AMM Constant-Product Curve Canvas */}
              <DexDepthCanvas
                currencyLabel={tokenOnLedgerReport.currency}
                bids={tokenOnLedgerReport.bids}
                asks={tokenOnLedgerReport.asks}
                ammReserveXrp={tokenOnLedgerReport.amm?.asset1Numeric ?? 50_000}
                ammReserveToken={tokenOnLedgerReport.amm?.asset2Numeric ?? 100_000}
                ammFeeBps={tokenOnLedgerReport.amm?.tradingFeeBps ?? 30}
              />

              {/* Live DEX Orderbook Depth (vs XRP) */}
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">
                  Live On-Ledger DEX Orderbook (vs XRP)
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2">
                    <div className="text-emerald-400 text-[10px] uppercase mb-1">Bids (Buy Token)</div>
                    {tokenOnLedgerReport.bids.length === 0 ? (
                      <div className="text-slate-500 text-[10px]">No open bids</div>
                    ) : (
                      tokenOnLedgerReport.bids.slice(0, 6).map((b, idx) => (
                        <div key={idx} className="flex justify-between py-0.5 tabular-nums">
                          <span className="text-emerald-300">{b.price.toPrecision(4)} XRP</span>
                          <span className="text-slate-400">{formatCompactNumber(b.size)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2">
                    <div className="text-rose-400 text-[10px] uppercase mb-1">Asks (Sell Token)</div>
                    {tokenOnLedgerReport.asks.length === 0 ? (
                      <div className="text-slate-500 text-[10px]">No open asks</div>
                    ) : (
                      tokenOnLedgerReport.asks.slice(0, 6).map((a, idx) => (
                        <div key={idx} className="flex justify-between py-0.5 tabular-nums">
                          <span className="text-rose-300">{a.price.toPrecision(4)} XRP</span>
                          <span className="text-slate-400">{formatCompactNumber(a.size)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
