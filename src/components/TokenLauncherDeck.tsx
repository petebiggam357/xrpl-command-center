import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  FileCode2,
  FlaskConical,
  Rocket,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { generateXrpLedgerToml, validateXrpLedgerToml } from '../shared/studioUtils';
import {
  buildTokenLaunchSteps,
  computeInitialAmmPrice,
  DEFAULT_TOKEN_LAUNCH_DRAFT,
  estimateTokenLaunchCost,
  TOKEN_LAUNCH_PRESETS,
  type TokenLaunchDraft,
  type TokenLaunchStep,
  validateCurrencyCode,
} from '../shared/tokenLauncherUtils';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';
import { BatchAirdropPanel } from './BatchAirdropPanel';

const STORAGE_KEY = 'xrpl-cc-token-launcher-draft-v1';

const WIZARD_STEPS = [
  { num: 1, label: 'Standard & Preset' },
  { num: 2, label: 'Identity & Supply' },
  { num: 3, label: 'Wallets & Flags' },
  { num: 4, label: 'AMM & TOML' },
  { num: 5, label: 'Review & Launch' },
] as const;

function loadDraft(): TokenLaunchDraft {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TOKEN_LAUNCH_DRAFT };
    return { ...DEFAULT_TOKEN_LAUNCH_DRAFT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_TOKEN_LAUNCH_DRAFT };
  }
}

export const TokenLauncherDeck: React.FC = () => {
  const vaultStatus = useCommandStore((s) => s.vaultStatus);
  const streamStatus = useCommandStore((s) => s.streamStatus);
  const marketPrice = useCommandStore((s) => s.marketPrice);
  const openTxConfirmModal = useCommandStore((s) => s.openTxConfirmModal);
  const setActiveTab = useCommandStore((s) => s.setActiveTab);

  const [step, setStep] = useState<number>(1);
  const [draft, setDraft] = useState<TokenLaunchDraft>(() => loadDraft());
  const [completedStepIds, setCompletedStepIds] = useState<Record<string, boolean>>({});
  const [copiedToml, setCopiedToml] = useState(false);

  const custodialAccounts = useMemo(
    () => vaultStatus.accounts.filter((a) => a.kind === 'custodial'),
    [vaultStatus.accounts]
  );

  // Auto-select first two custodial wallets if draft addresses are empty
  useEffect(() => {
    if (custodialAccounts.length === 0) return;
    setDraft((prev) => {
      const nextIssuer = prev.issuerAddress || custodialAccounts[0]?.address || '';
      const nextDist =
        prev.distributorAddress ||
        custodialAccounts[1]?.address ||
        custodialAccounts[0]?.address ||
        '';
      if (nextIssuer === prev.issuerAddress && nextDist === prev.distributorAddress) return prev;
      return { ...prev, issuerAddress: nextIssuer, distributorAddress: nextDist };
    });
  }, [custodialAccounts]);

  // Persist draft in localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  }, [draft]);

  const updateDraft = (patch: Partial<TokenLaunchDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const currencyCheck = useMemo(
    () => validateCurrencyCode(draft.currencyCode),
    [draft.currencyCode]
  );

  const costEstimate = useMemo(() => estimateTokenLaunchCost(draft), [draft]);

  const ammPrice = useMemo(
    () =>
      computeInitialAmmPrice(
        draft.ammTokenAmount,
        draft.ammXrpAmount,
        draft.totalSupply,
        marketPrice.xrpUsd ?? undefined
      ),
    [draft.ammTokenAmount, draft.ammXrpAmount, draft.totalSupply, marketPrice.xrpUsd]
  );

  const launchSteps = useMemo(() => buildTokenLaunchSteps(draft), [draft]);

  const generatedToml = useMemo(
    () =>
      generateXrpLedgerToml({
        domain: draft.domain || 'example.com',
        orgName: draft.orgName || draft.tokenName || 'XRPL Issuer',
        orgEmail: draft.orgEmail || 'ops@example.com',
        issuerAddress: draft.issuerAddress || undefined,
        network: streamStatus.networkId,
        currencyCode: currencyCheck.displayCode || draft.currencyCode || 'TOKEN',
        currencyName: draft.tokenName || currencyCheck.displayCode || 'XRPL Token',
      }),
    [
      draft.domain,
      draft.orgName,
      draft.orgEmail,
      draft.issuerAddress,
      draft.tokenName,
      draft.currencyCode,
      currencyCheck.displayCode,
      streamStatus.networkId,
    ]
  );

  const tomlValidation = useMemo(() => validateXrpLedgerToml(generatedToml), [generatedToml]);

  const isSameWalletForIou =
    draft.standard === 'IOU' &&
    Boolean(draft.issuerAddress) &&
    draft.issuerAddress === draft.distributorAddress;

  const issuerAccount = vaultStatus.accounts.find((a) => a.address === draft.issuerAddress);
  const distributorAccount = vaultStatus.accounts.find((a) => a.address === draft.distributorAddress);

  const canLaunchStep = (s: TokenLaunchStep): { ok: boolean; walletId?: string; reason?: string } => {
    if (!currencyCheck.valid) return { ok: false, reason: currencyCheck.error };
    if (isSameWalletForIou) {
      return { ok: false, reason: 'IOU Issuer and Distributor must be two distinct wallets.' };
    }
    const acct = s.signerRole === 'issuer' ? issuerAccount : distributorAccount;
    if (!acct) {
      return { ok: false, reason: `Select a ${s.signerRole} wallet in Step 3.` };
    }
    if (acct.kind !== 'custodial') {
      return { ok: false, reason: `${s.signerRole} wallet is watch-only.` };
    }
    return { ok: true, walletId: acct.id };
  };

  const handleTriggerStep = (s: TokenLaunchStep) => {
    const check = canLaunchStep(s);
    if (!check.ok || !check.walletId) return;
    openTxConfirmModal(check.walletId, s.intent);
  };

  const handleReset = () => {
    setDraft({
      ...DEFAULT_TOKEN_LAUNCH_DRAFT,
      issuerAddress: custodialAccounts[0]?.address || '',
      distributorAddress: custodialAccounts[1]?.address || custodialAccounts[0]?.address || '',
    });
    setCompletedStepIds({});
    setStep(1);
  };

  const handleCopyToml = async () => {
    try {
      await navigator.clipboard.writeText(generatedToml);
      setCopiedToml(true);
      setTimeout(() => setCopiedToml(false), 1800);
    } catch {
      // ignore
    }
  };

  const completedCount = launchSteps.filter((s) => completedStepIds[s.id]).length;

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="hud-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center">
            <Rocket className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
              XRPL Token Launcher & Guided Wizard
            </h2>
            <p className="text-[11px] font-mono text-slate-400">
              Launch native XRPL IOUs (with optional XLS-30 AMM pool) or XLS-33 Multi-Purpose Tokens step-by-step
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span
            className={`px-2.5 py-1 rounded-lg border ${
              streamStatus.networkId === 'mainnet'
                ? 'bg-amber-500/10 border-amber-400/40 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-400/40 text-emerald-300'
            }`}
          >
            Network: {streamStatus.networkId.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-400/50 hover:text-white"
            title="Reset wizard draft"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Draft
          </button>
        </div>
      </div>

      {/* Mainnet Safety Reminder */}
      {streamStatus.networkId === 'mainnet' && (
        <div className="rounded-xl p-3 bg-amber-500/10 border border-amber-400/35 flex items-center justify-between gap-3 font-mono text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              You are on <strong>Mainnet</strong>. Every signed step spends real XRP reserves &amp; fees. Test your launch flow on <strong>Testnet</strong> first!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('wallets')}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-[11px] hover:bg-amber-500/30"
          >
            <FlaskConical className="w-3 h-3" />
            Testnet Playground
          </button>
        </div>
      )}

      {/* 5-Step Progress Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {WIZARD_STEPS.map((ws) => {
          const active = step === ws.num;
          const done = step > ws.num;
          return (
            <button
              key={ws.num}
              type="button"
              onClick={() => setStep(ws.num)}
              className={`px-3 py-2.5 rounded-xl border text-left font-mono transition-all ${
                active
                  ? 'bg-cyan-500/15 border-cyan-400/60 text-white shadow-glowCyan'
                  : done
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
                    : 'bg-panel/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-75">Step {ws.num}</div>
              <div className="text-xs font-semibold truncate mt-0.5">{ws.label}</div>
            </button>
          );
        })}
      </div>

      {/* Step 1: Standard & Preset */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 hud-panel rounded-xl p-4 space-y-4">
            <div className="text-xs font-mono uppercase tracking-[0.15em] text-cyan-300">
              1. Choose XRPL Token Standard
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => updateDraft({ standard: 'IOU' })}
                className={`p-4 rounded-xl border text-left transition-all ${
                  draft.standard === 'IOU'
                    ? 'bg-cyan-500/15 border-cyan-400/60 text-white'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Classic XRPL IOU</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200">
                    DEX + AMM Ready
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Issuer + Distributor two-wallet architecture. Supported by every XRPL wallet, CLOB orderbook, and XLS-30 AMM pool.
                </p>
              </button>

              <button
                type="button"
                onClick={() => updateDraft({ standard: 'MPT', seedAmmPool: false })}
                className={`p-4 rounded-xl border text-left transition-all ${
                  draft.standard === 'MPT'
                    ? 'bg-purple-500/15 border-purple-400/60 text-white'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Multi-Purpose Token (MPT)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-200">
                    XLS-33 Native
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Compact on-ledger institutional token with fixed integer scale, hard max supply cap, and native JSON metadata.
                </p>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 hud-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.15em] text-emerald-300">
              <Sparkles className="w-3.5 h-3.5" />
              Quick-Start Launch Presets
            </div>
            <div className="space-y-2">
              {TOKEN_LAUNCH_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    updateDraft(preset.patch);
                    setStep(2);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-emerald-400/50 text-left transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">{preset.label}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                      {preset.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{preset.summary}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Identity & Tokenomics */}
      {step === 2 && (
        <div className="hud-panel rounded-xl p-4 space-y-4 font-mono">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.15em] text-cyan-300">
              2. Token Identity &amp; Supply Parameters ({draft.standard})
            </div>
            {currencyCheck.valid ? (
              <span className="text-[11px] px-2.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-300">
                Valid {currencyCheck.kind === 'standard-3' ? '3-Char Standard' : '160-Bit Hex'}
              </span>
            ) : (
              <span className="text-[11px] px-2.5 py-0.5 rounded bg-rose-500/15 border border-rose-400/40 text-rose-300">
                {currencyCheck.error}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400">Currency Code / Ticker</span>
              <input
                type="text"
                value={draft.currencyCode}
                onChange={(e) => updateDraft({ currencyCode: e.target.value })}
                placeholder="e.g. USD, RLUSD, PULSE"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-cyan-400 focus:outline-none"
              />
              {currencyCheck.encodedCode && (
                <div className="text-[10px] text-slate-500 truncate" title={currencyCheck.encodedCode}>
                  On-ledger: <span className="text-cyan-300">{currencyCheck.encodedCode}</span>
                </div>
              )}
            </label>

            <label className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400">Token Display Name</span>
              <input
                type="text"
                value={draft.tokenName}
                onChange={(e) => updateDraft({ tokenName: e.target.value })}
                placeholder="My XRPL Token"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-cyan-400 focus:outline-none"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400">Total Supply</span>
              <input
                type="text"
                value={draft.totalSupply}
                onChange={(e) => updateDraft({ totalSupply: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="1000000"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-cyan-400 focus:outline-none"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400">
                Transfer Fee % ({draft.standard === 'MPT' ? '0–50%' : '0–100%'})
              </span>
              <input
                type="number"
                min={0}
                max={draft.standard === 'MPT' ? 50 : 100}
                step={0.05}
                value={draft.transferFeePercent}
                onChange={(e) => updateDraft({ transferFeePercent: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-cyan-400 focus:outline-none"
              />
            </label>

            {draft.standard === 'IOU' ? (
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-400">DEX TickSize (0 or 3–15)</span>
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={draft.tickSize}
                  onChange={(e) => updateDraft({ tickSize: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-cyan-400 focus:outline-none"
                />
              </label>
            ) : (
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-400">MPT Asset Scale (0–19 decimals)</span>
                <input
                  type="number"
                  min={0}
                  max={19}
                  value={draft.assetScale}
                  onChange={(e) => updateDraft({ assetScale: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-cyan-400 focus:outline-none"
                />
              </label>
            )}

            <label className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400">Issuer Domain (xrp-ledger.toml)</span>
              <input
                type="text"
                value={draft.domain}
                onChange={(e) => updateDraft({ domain: e.target.value })}
                placeholder="example.com"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-cyan-400 focus:outline-none"
              />
            </label>
          </div>

          <label className="block space-y-1 text-xs">
            <span className="text-[10px] uppercase text-slate-400">Token Description</span>
            <input
              type="text"
              value={draft.description}
              onChange={(e) => updateDraft({ description: e.target.value })}
              placeholder="Short description for metadata & TOML"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-cyan-400 focus:outline-none"
            />
          </label>
        </div>
      )}

      {/* Step 3: Wallets & Governance Flags */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 font-mono">
          <div className="lg:col-span-6 hud-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.15em] text-cyan-300 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                3. Issuer &amp; Distributor Wallets
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('wallets')}
                className="text-[11px] text-cyan-300 hover:underline"
              >
                Manage Vault Wallets →
              </button>
            </div>

            {custodialAccounts.length === 0 ? (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-400/35 text-xs text-amber-200">
                No custodial wallets found in your Rust Vault. Open <strong>Wallets &amp; DeFi</strong> to unlock or create wallets first.
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase text-slate-400">
                    Issuer Wallet (Cold / Issuing Account)
                  </span>
                  <select
                    value={draft.issuerAddress}
                    onChange={(e) => updateDraft({ issuerAddress: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    {custodialAccounts.map((a) => (
                      <option key={a.id} value={a.address}>
                        {a.label} ({shortenAddress(a.address, 8, 6)})
                      </option>
                    ))}
                  </select>
                </label>

                {draft.standard === 'IOU' && (
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase text-slate-400">
                      Distributor Wallet (Hot / Operational Account)
                    </span>
                    <select
                      value={draft.distributorAddress}
                      onChange={(e) => updateDraft({ distributorAddress: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                    >
                      {custodialAccounts.map((a) => (
                        <option key={a.id} value={a.address}>
                          {a.label} ({shortenAddress(a.address, 8, 6)})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {isSameWalletForIou && (
                  <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-400/40 text-[11px] text-rose-200 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>
                      XRPL requires <strong>two distinct accounts</strong> for IOU issuance (an Issuer cannot open a TrustLine to itself). Create or select a second wallet for the Distributor.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-6 hud-panel rounded-xl p-4 space-y-3">
            <div className="text-xs uppercase tracking-[0.15em] text-cyan-300">
              Governance &amp; Compliance Flags
            </div>
            <div className="space-y-2 text-xs">
              {draft.standard === 'IOU' && (
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.enableDefaultRipple}
                    onChange={(e) => updateDraft({ enableDefaultRipple: e.target.checked })}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-white font-semibold">DefaultRipple (asfDefaultRipple — Recommended)</div>
                    <div className="text-[11px] text-slate-400">
                      Allows holders to freely transfer your IOU to each other and trade on the XRPL DEX/AMM.
                    </div>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.enableClawback}
                  onChange={(e) =>
                    updateDraft({
                      enableClawback: e.target.checked,
                      ...(e.target.checked && draft.standard === 'IOU' ? { enableNoFreeze: false } : {}),
                    })
                  }
                  className="mt-0.5"
                />
                <div>
                  <div className="text-white font-semibold">Allow Clawback (XLS-39 / Regulated Assets)</div>
                  <div className="text-[11px] text-slate-400">
                    Permits issuer to claw back tokens for regulatory compliance. Must be set before any TrustLines exist (mutually exclusive with NoFreeze).
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.enableRequireAuth}
                  onChange={(e) => updateDraft({ enableRequireAuth: e.target.checked })}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-white font-semibold">RequireAuth (KYC Allowlist)</div>
                  <div className="text-[11px] text-slate-400">
                    Only explicitly authorized accounts can hold this token. Adds an Issuer tfSetfAuth approval step before minting.
                  </div>
                </div>
              </label>

              {draft.standard === 'IOU' && (
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.enableNoFreeze}
                    onChange={(e) =>
                      updateDraft({
                        enableNoFreeze: e.target.checked,
                        ...(e.target.checked ? { enableClawback: false } : {}),
                      })
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-amber-200 font-semibold">NoFreeze (Irreversible Decentralization)</div>
                    <div className="text-[11px] text-slate-400">
                      Permanently renounces freeze authority on this issuer. Cannot be undone once set (mutually exclusive with Clawback).
                    </div>
                  </div>
                </label>
              )}

              {draft.standard === 'MPT' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(
                    [
                      ['mptCanTransfer', 'Can Transfer'],
                      ['mptCanTrade', 'Can Trade (DEX)'],
                      ['mptCanEscrow', 'Can Escrow'],
                      ['mptCanLock', 'Can Lock'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/70 border border-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={draft[key]}
                        onChange={(e) => updateDraft({ [key]: e.target.checked })}
                      />
                      <span className="text-slate-200">{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Optional AMM Pool & xrp-ledger.toml */}
      {step === 4 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 font-mono">
          <div className="lg:col-span-6 hud-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.15em] text-cyan-300 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" />
                4. Optional XLS-30 AMM Liquidity Pool
              </span>
              {draft.standard === 'IOU' && (
                <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.seedAmmPool}
                    onChange={(e) => updateDraft({ seedAmmPool: e.target.checked })}
                  />
                  Seed AMM Pool
                </label>
              )}
            </div>

            {draft.standard === 'MPT' ? (
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-400">
                XLS-30 AMM pool seeding in this wizard applies to classic XRPL IOUs. You can still configure and host your <code className="text-cyan-300">xrp-ledger.toml</code> on the right.
              </div>
            ) : !draft.seedAmmPool ? (
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-400">
                Toggle <strong>Seed AMM Pool</strong> above to automatically append an <code className="text-cyan-300">AMMCreate</code> step pairing your new token with XRP right after minting.
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-2.5">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase text-slate-400">
                      Initial {currencyCheck.displayCode || 'Token'}
                    </span>
                    <input
                      type="text"
                      value={draft.ammTokenAmount}
                      onChange={(e) =>
                        updateDraft({ ammTokenAmount: e.target.value.replace(/[^0-9.]/g, '') })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase text-slate-400">Initial XRP</span>
                    <input
                      type="text"
                      value={draft.ammXrpAmount}
                      onChange={(e) =>
                        updateDraft({ ammXrpAmount: e.target.value.replace(/[^0-9.]/g, '') })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase text-slate-400">LP Fee (0–100 bps)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.ammTradingFeeBps}
                      onChange={(e) => updateDraft({ ammTradingFeeBps: Number(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                    />
                  </label>
                </div>

                {ammPrice.valid && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-400/30 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="text-slate-400 text-[10px]">Initial Price</div>
                      <div className="text-emerald-300 font-semibold">
                        {ammPrice.xrpPerToken.toPrecision(4)} XRP
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">Tokens / 1 XRP</div>
                      <div className="text-white font-semibold">
                        {ammPrice.tokensPerXrp.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">Implied FDV</div>
                      <div className="text-cyan-300 font-semibold">
                        {ammPrice.impliedFdvXrp.toLocaleString(undefined, { maximumFractionDigits: 0 })} XRP
                        {ammPrice.impliedFdvUsd
                          ? ` ($${ammPrice.impliedFdvUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })})`
                          : ''}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-6 hud-panel rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.15em] text-cyan-300 flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5" />
                /.well-known/xrp-ledger.toml
              </span>
              <button
                type="button"
                onClick={() => void handleCopyToml()}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-200 hover:border-cyan-400/50"
              >
                {copiedToml ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedToml ? 'Copied' : 'Copy TOML'}
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-cyan-200 overflow-x-auto max-h-48">
              {generatedToml}
            </pre>
            <div className="text-[10px] text-slate-400">
              Linter:{' '}
              {tomlValidation.valid ? (
                <span className="text-emerald-300">PASS — Ready to host over HTTPS</span>
              ) : (
                <span className="text-amber-300">{tomlValidation.issues.join(' · ')}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Review, Reserve Breakdown & Guided Execution */}
      {step === 5 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 font-mono">
          {/* Reserve & Cost Summary */}
          <div className="lg:col-span-4 hud-panel rounded-xl p-4 space-y-3">
            <div className="text-xs uppercase tracking-[0.15em] text-cyan-300">
              XRP Reserve &amp; Fee Estimate
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Issuer Base Reserve</span>
                <span>{costEstimate.issuerReserveXrp} XRP</span>
              </div>
              {costEstimate.distributorReserveXrp > 0 && (
                <div className="flex justify-between text-slate-300">
                  <span>Distributor + TrustLine</span>
                  <span>{costEstimate.distributorReserveXrp} XRP</span>
                </div>
              )}
              {costEstimate.ammReserveAndLiquidityXrp > 0 && (
                <div className="flex justify-between text-slate-300">
                  <span>AMM Reserve + Liquidity</span>
                  <span>{costEstimate.ammReserveAndLiquidityXrp} XRP</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>Est. Network Fees ({costEstimate.stepCount} tx)</span>
                <span>~{costEstimate.estimatedTxFeesXrp} XRP</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-bold text-emerald-300">
                <span>Total XRP Needed</span>
                <span>{costEstimate.totalXrpNeeded} XRP</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div>
                Progress:{' '}
                <strong className="text-white">
                  {completedCount} / {launchSteps.length}
                </strong>{' '}
                steps marked complete
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{
                    width: `${launchSteps.length > 0 ? (completedCount / launchSteps.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Guided Execution Checklist */}
          <div className="lg:col-span-8 hud-panel rounded-xl p-4 space-y-3">
            <div className="text-xs uppercase tracking-[0.15em] text-cyan-300">
              5. Guided On-Ledger Execution ({launchSteps.length} Transactions)
            </div>
            <div className="space-y-2.5">
              {launchSteps.map((s) => {
                const check = canLaunchStep(s);
                const done = Boolean(completedStepIds[s.id]);
                return (
                  <div
                    key={s.id}
                    className={`p-3 rounded-xl border transition-all ${
                      done
                        ? 'bg-emerald-500/10 border-emerald-500/35'
                        : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[10px]">
                            #{s.order} {s.txType}
                          </span>
                          <span className="text-xs font-semibold text-white">{s.title}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">{s.subtitle}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Signer ({s.signerRole}):{' '}
                          <span className="text-slate-300">
                            {s.signerAddress ? shortenAddress(s.signerAddress, 8, 6) : 'Unselected'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setCompletedStepIds((prev) => ({ ...prev, [s.id]: !prev[s.id] }))
                          }
                          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] ${
                            done
                              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {done ? 'Done' : 'Mark Done'}
                        </button>
                        <button
                          type="button"
                          disabled={!check.ok}
                          onClick={() => handleTriggerStep(s)}
                          title={check.reason || `Sign & submit ${s.txType}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-[11px] text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Rocket className="w-3.5 h-3.5" />
                          Sign &amp; Submit
                        </button>
                      </div>
                    </div>

                    {s.warning && (
                      <div className="mt-2 px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-400/30 text-[10px] text-amber-200">
                        ⚠ {s.warning}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer Step Navigation */}
      <div className="flex items-center justify-between pt-1 font-mono text-xs">
        <button
          type="button"
          disabled={step <= 1}
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50 disabled:opacity-40"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Previous
        </button>

        <div className="text-[11px] text-slate-400">
          Step {step} of {WIZARD_STEPS.length} • {draft.standard} ({currencyCheck.displayCode || '—'})
        </div>

        <button
          type="button"
          disabled={step >= WIZARD_STEPS.length}
          onClick={() => setStep((s) => Math.min(WIZARD_STEPS.length, s + 1))}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
        >
          Next
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Track 2: Batch Airdrop & Multi-Recipient Payout Studio */}
      <BatchAirdropPanel />
    </div>
  );
};
