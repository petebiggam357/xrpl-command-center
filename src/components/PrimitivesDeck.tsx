import React, { useMemo, useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  FileCode2,
  Fingerprint,
  LineChart,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import { generateXrpLedgerToml, validateXrpLedgerToml } from '../shared/studioUtils';
import type { DidResolutionReport, OracleAggregateReport } from '../shared/types';
import { useCommandStore } from '../store/useCommandStore';

type PrimSubTab = 'mpt-issuer' | 'toml' | 'oracles' | 'did';

export const PrimitivesDeck: React.FC = () => {
  const vaultStatus = useCommandStore((s) => s.vaultStatus);
  const selectedWalletId = useCommandStore((s) => s.selectedWalletId);
  const streamStatus = useCommandStore((s) => s.streamStatus);
  const openTxConfirmModal = useCommandStore((s) => s.openTxConfirmModal);

  const activeAccount =
    vaultStatus.accounts.find((a) => a.id === selectedWalletId) ?? vaultStatus.accounts[0] ?? null;
  const canSign = activeAccount?.kind === 'custodial';

  const [subTab, setSubTab] = useState<PrimSubTab>('mpt-issuer');

  // 1) MPT & Issuer Controls State
  const [mptScale, setMptScale] = useState('2');
  const [mptMaxSupply, setMptMaxSupply] = useState('100000000');
  const [mptFeeBps, setMptFeeBps] = useState('10');
  const [mptMetadata, setMptMetadata] = useState('{"name":"Treasury Bill MPT","ticker":"TBILL"}');
  const [mptCanClawback, setMptCanClawback] = useState(true);
  const [mptRequireAuth, setMptRequireAuth] = useState(false);

  const [clawCurrency, setClawCurrency] = useState('RLUSD');
  const [clawHolder, setClawHolder] = useState('');
  const [clawValue, setClawValue] = useState('');

  // 2) xrp-ledger.toml Generator State
  const [tomlDomain, setTomlDomain] = useState('issuer.example.com');
  const [tomlOrg, setTomlOrg] = useState('Example Digital Assets LLC');
  const [tomlEmail, setTomlEmail] = useState('ops@example.com');
  const [tomlCurrency, setTomlCurrency] = useState('USDX');
  const [tomlValidatorKey, setTomlValidatorKey] = useState('');
  const [copiedToml, setCopiedToml] = useState(false);

  const generatedToml = useMemo(
    () =>
      generateXrpLedgerToml({
        domain: tomlDomain,
        orgName: tomlOrg,
        orgEmail: tomlEmail,
        issuerAddress: activeAccount?.address,
        validatorPubKey: tomlValidatorKey,
        network: streamStatus.networkId,
        currencyCode: tomlCurrency,
        currencyName: `${tomlOrg} ${tomlCurrency}`,
      }),
    [tomlDomain, tomlOrg, tomlEmail, activeAccount?.address, tomlValidatorKey, streamStatus.networkId, tomlCurrency]
  );

  const tomlValidation = useMemo(() => validateXrpLedgerToml(generatedToml), [generatedToml]);

  // 3) XLS-47 Oracles State
  const [oracleQueryBase, setOracleQueryBase] = useState('XRP');
  const [oracleQueryQuote, setOracleQueryQuote] = useState('USD');
  const [oracleProviderAcct, setOracleProviderAcct] = useState('');
  const [oracleDocId, setOracleDocId] = useState('1');
  const [oracleReport, setOracleReport] = useState<OracleAggregateReport | null>(null);
  const [oracleLoading, setOracleLoading] = useState(false);

  const [pubDocId, setPubDocId] = useState('1');
  const [pubProvider, setPubProvider] = useState('XRPL-Command-Oracle');
  const [pubBase, setPubBase] = useState('XRP');
  const [pubQuote, setPubQuote] = useState('USD');
  const [pubPriceInt, setPubPriceInt] = useState('24500');
  const [pubScale, setPubScale] = useState('4');

  // 4) XLS-40 DID State
  const [didLookupAddr, setDidLookupAddr] = useState('');
  const [didReport, setDidReport] = useState<DidResolutionReport | null>(null);
  const [didLoading, setDidLoading] = useState(false);

  const [didUri, setDidUri] = useState('ipfs://bafybeididdoc');
  const [didData, setDidData] = useState('{"@context":"https://www.w3.org/ns/did/v1"}');

  const handleOracleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oracleProviderAcct.trim()) return;
    setOracleLoading(true);
    const rep = await getXrplBridge().oracleQueryAggregate({
      baseAsset: oracleQueryBase.trim(),
      quoteAsset: oracleQueryQuote.trim(),
      oracles: [{ account: oracleProviderAcct.trim(), oracleDocumentId: Number(oracleDocId) || 1 }],
    });
    setOracleReport(rep);
    setOracleLoading(false);
  };

  const handleDidLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = didLookupAddr.trim() || activeAccount?.address || '';
    if (!target) return;
    setDidLoading(true);
    const res = await getXrplBridge().didResolveAccount(target);
    setDidReport(res);
    setDidLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="hud-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Building2 className="w-4 h-4 text-cyan-400" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Next-Gen XRPL Institutional &amp; Protocol Primitives Studio
            </h2>
            <p className="text-[11px] text-slate-400">
              Multi-Purpose Tokens (`MPT`), `xrp-ledger.toml` Domain Verification, `XLS-47` Price Oracles &amp; `XLS-40` W3C DIDs
            </p>
          </div>
        </div>

        <div className="text-xs font-mono text-slate-400">
          Active Account:{' '}
          <span className="text-cyan-300">
            {activeAccount ? `${activeAccount.label} (${activeAccount.address.slice(0, 8)}…)` : 'None (Add in Wallets)'}
          </span>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'mpt-issuer', label: 'MPT & Token Issuer Studio', icon: Sparkles },
          { id: 'toml', label: 'xrp-ledger.toml Generator', icon: FileCode2 },
          { id: 'oracles', label: 'XLS-47 Price Oracles', icon: LineChart },
          { id: 'did', label: 'XLS-40 Decentralized ID', icon: Fingerprint },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id as PrimSubTab)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono border transition-colors ${
                subTab === t.id
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-panel border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: MPT & ISSUER STUDIO */}
      {subTab === 'mpt-issuer' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeAccount) return;
              void openTxConfirmModal(activeAccount.id, {
                kind: 'MPTokenIssuanceCreate',
                account: activeAccount.address,
                assetScale: Number(mptScale) || 0,
                maximumAmount: mptMaxSupply,
                transferFeeBps: Number(mptFeeBps) || 0,
                metadataText: mptMetadata,
                canTransfer: true,
                canTrade: true,
                canEscrow: true,
                canLock: true,
                canClawback: mptCanClawback,
                requireAuth: mptRequireAuth,
              });
            }}
            className="hud-panel rounded-xl p-4 space-y-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
              Issue Multi-Purpose Token (`MPTokenIssuanceCreate`)
            </h3>
            <p className="text-[11px] text-slate-400">
              Compact next-gen XRPL token standard storing balances in direct ledger objects with native metadata &amp; compliance flags.
            </p>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Asset Scale
                </label>
                <input
                  type="number"
                  min="0"
                  max="19"
                  value={mptScale}
                  onChange={(e) => setMptScale(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Max Units
                </label>
                <input
                  type="text"
                  value={mptMaxSupply}
                  onChange={(e) => setMptMaxSupply(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Fee (bps)
                </label>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  value={mptFeeBps}
                  onChange={(e) => setMptFeeBps(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                On-Ledger Metadata JSON (Hex-Encoded Automatically)
              </label>
              <input
                type="text"
                value={mptMetadata}
                onChange={(e) => setMptMetadata(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
              />
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-mono text-slate-300">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={mptCanClawback}
                  onChange={(e) => setMptCanClawback(e.target.checked)}
                />
                Enable Clawback
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={mptRequireAuth}
                  onChange={(e) => setMptRequireAuth(e.target.checked)}
                />
                Require Holder Allowlist (`RequireAuth`)
              </label>
            </div>

            <button
              type="submit"
              disabled={!canSign}
              className="w-full py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono font-semibold text-cyan-200 disabled:opacity-40"
            >
              {canSign ? 'Preview MPTokenIssuanceCreate' : 'Select a Custodial Signing Wallet First'}
            </button>
          </form>

          {/* Issuer Account Flags & Regulated Clawback */}
          <div className="hud-panel rounded-xl p-4 space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-300 mb-2">
                Issuer AccountRoot Governance Flags (`AccountSet`)
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canSign}
                  onClick={() =>
                    activeAccount &&
                    void openTxConfirmModal(activeAccount.id, {
                      kind: 'AccountSet',
                      account: activeAccount.address,
                      enableDefaultRipple: true,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-950 border border-cyan-400/40 text-xs font-mono text-cyan-200 disabled:opacity-40"
                >
                  Enable `DefaultRipple` (SetFlag 8)
                </button>
                <button
                  type="button"
                  disabled={!canSign}
                  onClick={() =>
                    activeAccount &&
                    void openTxConfirmModal(activeAccount.id, {
                      kind: 'AccountSet',
                      account: activeAccount.address,
                      enableRequireDest: true,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-950 border border-emerald-400/40 text-xs font-mono text-emerald-200 disabled:opacity-40"
                >
                  Enable `RequireDest` Tag (SetFlag 1)
                </button>
                <button
                  type="button"
                  disabled={!canSign}
                  onClick={() =>
                    activeAccount &&
                    void openTxConfirmModal(activeAccount.id, {
                      kind: 'AccountSet',
                      account: activeAccount.address,
                      enableAllowClawback: true,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-950 border border-amber-400/40 text-xs font-mono text-amber-200 disabled:opacity-40"
                >
                  Enable `AllowClawback` (SetFlag 16)
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!activeAccount) return;
                void openTxConfirmModal(activeAccount.id, {
                  kind: 'Clawback',
                  account: activeAccount.address,
                  currency: clawCurrency,
                  holder: clawHolder,
                  value: clawValue,
                });
              }}
              className="pt-3 border-t border-slate-800 space-y-2.5"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rose-300">
                <ShieldAlert className="w-3.5 h-3.5" />
                Regulated IOU Clawback (`XLS-39`)
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  required
                  type="text"
                  value={clawCurrency}
                  onChange={(e) => setClawCurrency(e.target.value)}
                  placeholder="Currency"
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
                <input
                  required
                  type="text"
                  value={clawValue}
                  onChange={(e) => setClawValue(e.target.value)}
                  placeholder="Amount"
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
                <input
                  required
                  type="text"
                  value={clawHolder}
                  onChange={(e) => setClawHolder(e.target.value)}
                  placeholder="Holder r-Address"
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <button
                type="submit"
                disabled={!canSign}
                className="w-full py-1.5 rounded-lg bg-rose-500/20 border border-rose-400/40 text-xs font-mono text-rose-200 disabled:opacity-40"
              >
                Preview Regulated Clawback
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: XRP-LEDGER.TOML GENERATOR & LINTER */}
      {subTab === 'toml' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 hud-panel rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
              Domain &amp; `xrp-ledger.toml` Builder
            </h3>
            <input
              type="text"
              value={tomlDomain}
              onChange={(e) => setTomlDomain(e.target.value)}
              placeholder="issuer.example.com"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
            />
            <input
              type="text"
              value={tomlOrg}
              onChange={(e) => setTomlOrg(e.target.value)}
              placeholder="Organization Name"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={tomlEmail}
                onChange={(e) => setTomlEmail(e.target.value)}
                placeholder="Contact Email"
                className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
              />
              <input
                type="text"
                value={tomlCurrency}
                onChange={(e) => setTomlCurrency(e.target.value)}
                placeholder="Issued Currency Code"
                className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
              />
            </div>
            <input
              type="text"
              value={tomlValidatorKey}
              onChange={(e) => setTomlValidatorKey(e.target.value)}
              placeholder="Optional Validator Public Key (nH...)"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
            />

            <button
              type="button"
              disabled={!canSign || !tomlDomain.trim()}
              onClick={() =>
                activeAccount &&
                void openTxConfirmModal(activeAccount.id, {
                  kind: 'AccountSet',
                  account: activeAccount.address,
                  domain: tomlDomain.trim(),
                })
              }
              className="w-full py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono font-semibold text-emerald-200 disabled:opacity-40"
            >
              Link `{tomlDomain}` to AccountRoot On-Ledger (`AccountSet`)
            </button>
          </div>

          <div className="lg:col-span-7 hud-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-white">
                  /.well-known/xrp-ledger.toml
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                    tomlValidation.valid
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {tomlValidation.valid ? 'LINT PASSED' : `${tomlValidation.issues.length} ISSUES`}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(generatedToml);
                  setCopiedToml(true);
                  setTimeout(() => setCopiedToml(false), 1600);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
              >
                {copiedToml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedToml ? 'Copied' : 'Copy TOML'}
              </button>
            </div>

            <pre className="rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-[11px] text-cyan-200 overflow-auto max-h-72">
              {generatedToml}
            </pre>

            {tomlValidation.issues.length > 0 && (
              <div className="text-xs font-mono text-rose-300 space-y-1">
                {tomlValidation.issues.map((iss, i) => (
                  <div key={i}>• {iss}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: XLS-47 PRICE ORACLES */}
      {subTab === 'oracles' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <form onSubmit={(e) => void handleOracleQuery(e)} className="hud-panel rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
              Query On-Ledger Price Oracle (`get_aggregate_price`)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                type="text"
                value={oracleQueryBase}
                onChange={(e) => setOracleQueryBase(e.target.value)}
                placeholder="Base (XRP)"
                className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
              />
              <input
                required
                type="text"
                value={oracleQueryQuote}
                onChange={(e) => setOracleQueryQuote(e.target.value)}
                placeholder="Quote (USD)"
                className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                required
                type="text"
                value={oracleProviderAcct}
                onChange={(e) => setOracleProviderAcct(e.target.value)}
                placeholder="Oracle Account r-address"
                className="col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
              />
              <input
                required
                type="number"
                min="0"
                value={oracleDocId}
                onChange={(e) => setOracleDocId(e.target.value)}
                placeholder="Doc ID"
                className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
              />
            </div>
            <button
              type="submit"
              disabled={oracleLoading}
              className="w-full py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200"
            >
              {oracleLoading ? 'Querying Ledger…' : 'Query Aggregate Oracle Feed'}
            </button>

            {oracleReport && (
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-xs space-y-1">
                {oracleReport.ok ? (
                  <>
                    <div className="text-emerald-300 font-bold">
                      Median: {oracleReport.median ?? '—'} {oracleReport.quoteAsset}
                    </div>
                    <div className="text-slate-300">
                      Mean: {oracleReport.entireSetMean ?? '—'} • Trimmed: {oracleReport.trimmedMean ?? '—'}
                    </div>
                  </>
                ) : (
                  <div className="text-amber-300">{oracleReport.error}</div>
                )}
              </div>
            )}
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeAccount) return;
              void openTxConfirmModal(activeAccount.id, {
                kind: 'OracleSet',
                account: activeAccount.address,
                oracleDocumentId: Number(pubDocId) || 1,
                provider: pubProvider,
                assetClass: 'currency',
                baseAsset: pubBase,
                quoteAsset: pubQuote,
                assetPrice: Number(pubPriceInt) || 0,
                scale: Number(pubScale) || 0,
              });
            }}
            className="hud-panel rounded-xl p-4 space-y-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-300">
              Publish Price Oracle Feed (`OracleSet`)
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                value={pubDocId}
                onChange={(e) => setPubDocId(e.target.value)}
                placeholder="Doc ID"
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
              />
              <input
                type="text"
                value={pubProvider}
                onChange={(e) => setPubProvider(e.target.value)}
                placeholder="Provider Name"
                className="col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <input
                type="text"
                value={pubBase}
                onChange={(e) => setPubBase(e.target.value)}
                placeholder="XRP"
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
              />
              <input
                type="text"
                value={pubQuote}
                onChange={(e) => setPubQuote(e.target.value)}
                placeholder="USD"
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
              />
              <input
                type="number"
                value={pubPriceInt}
                onChange={(e) => setPubPriceInt(e.target.value)}
                placeholder="Mantissa"
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
              />
              <input
                type="number"
                value={pubScale}
                onChange={(e) => setPubScale(e.target.value)}
                placeholder="Scale"
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
              />
            </div>
            <button
              type="submit"
              disabled={!canSign}
              className="w-full py-2 rounded-xl bg-violet-500/20 border border-violet-400/50 text-xs font-mono text-violet-200 disabled:opacity-40"
            >
              Preview OracleSet
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: XLS-40 DECENTRALIZED IDENTITY */}
      {subTab === 'did' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <form onSubmit={(e) => void handleDidLookup(e)} className="hud-panel rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
              Resolve On-Ledger W3C DID (`did:xrpl`)
            </h3>
            <input
              type="text"
              value={didLookupAddr}
              onChange={(e) => setDidLookupAddr(e.target.value)}
              placeholder={activeAccount?.address ?? 'Enter r-address…'}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
            />
            <button
              type="submit"
              disabled={didLoading}
              className="w-full py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200"
            >
              {didLoading ? 'Resolving…' : 'Resolve DID Object'}
            </button>

            {didReport && (
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-xs space-y-1.5">
                <div className="text-cyan-300 break-all">{didReport.did}</div>
                {didReport.ok ? (
                  <>
                    <div>URI: {didReport.uri ?? '—'}</div>
                    <div className="text-slate-400 break-all">Doc: {didReport.didDocument ?? '—'}</div>
                  </>
                ) : (
                  <div className="text-amber-300">{didReport.error}</div>
                )}
              </div>
            )}
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeAccount) return;
              void openTxConfirmModal(activeAccount.id, {
                kind: 'DIDSet',
                account: activeAccount.address,
                uri: didUri,
                didDocument: didData,
              });
            }}
            className="hud-panel rounded-xl p-4 space-y-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
              Anchor / Update W3C DID (`DIDSet`)
            </h3>
            <input
              type="text"
              value={didUri}
              onChange={(e) => setDidUri(e.target.value)}
              placeholder="URI (ipfs:// or https://)"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
            />
            <textarea
              rows={3}
              value={didData}
              onChange={(e) => setDidData(e.target.value)}
              placeholder="DID Document JSON"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!canSign}
                className="flex-1 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono text-emerald-200 disabled:opacity-40"
              >
                Preview DIDSet
              </button>
              <button
                type="button"
                disabled={!canSign}
                onClick={() =>
                  activeAccount &&
                  void openTxConfirmModal(activeAccount.id, {
                    kind: 'DIDDelete',
                    account: activeAccount.address,
                  })
                }
                className="px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-400/40 text-xs font-mono text-rose-200 disabled:opacity-40"
              >
                DIDDelete
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
