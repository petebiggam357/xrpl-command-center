import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Landmark,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import {
  getVaultLendingAmendmentStatus,
  isValidLedgerObjectHex,
  type ParsedVaultSnapshot,
  parseVaultInfoRpc,
  simulateVaultYieldAndWaterfall,
} from '../shared/vaultLendingUtils';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

type VaultTab = 'vaults' | 'lending' | 'simulator' | 'guide';

export const VaultLendingDeck: React.FC = () => {
  const amendments = useCommandStore((s) => s.amendments);
  const streamStatus = useCommandStore((s) => s.streamStatus);
  const connectNetwork = useCommandStore((s) => s.connectNetwork);
  const vaultStatus = useCommandStore((s) => s.vaultStatus);
  const selectedWalletId = useCommandStore((s) => s.selectedWalletId);
  const selectWallet = useCommandStore((s) => s.selectWallet);
  const openTxConfirmModal = useCommandStore((s) => s.openTxConfirmModal);
  const setActiveTab = useCommandStore((s) => s.setActiveTab);

  const [tab, setTab] = useState<VaultTab>('vaults');
  const activeAccount =
    vaultStatus.accounts.find((a) => a.id === selectedWalletId) ?? vaultStatus.accounts[0] ?? null;

  const amendmentStatus = useMemo(() => getVaultLendingAmendmentStatus(amendments), [amendments]);

  // ============================================================================
  // Sub-Tab 1: XLS-65 Single Asset Vaults (Create / Deposit / Withdraw / Inspect)
  // ============================================================================
  const [vaultAssetCurrency, setVaultAssetCurrency] = useState('RLUSD');
  const [vaultAssetIssuer, setVaultAssetIssuer] = useState('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De');
  const [vaultMaxAssets, setVaultMaxAssets] = useState('1000000');
  const [vaultPrivate, setVaultPrivate] = useState(false);
  const [vaultDomainId, setVaultDomainId] = useState('');
  const [vaultDataText, setVaultDataText] = useState('Institutional Single-Asset Yield Vault');

  const [actionVaultId, setActionVaultId] = useState('');
  const [actionAmount, setActionAmount] = useState('1000');
  const [actionCurrency, setActionCurrency] = useState('XRP');
  const [actionIssuer, setActionIssuer] = useState('');

  const [inspectVaultId, setInspectVaultId] = useState('');
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectedVault, setInspectedVault] = useState<ParsedVaultSnapshot | null>(null);

  const handleInspectVault = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = inspectVaultId.trim();
    if (!isValidLedgerObjectHex(id)) {
      setInspectError('Enter a valid 64-character hex XLS-65 VaultID.');
      return;
    }
    setInspectLoading(true);
    setInspectError(null);
    setInspectedVault(null);
    try {
      const res = await getXrplBridge().rpcRequest('vault_info', {
        vault_id: id,
        ledger_index: 'validated',
      });
      if (res.status === 'error') {
        setInspectError(String(res.error_message ?? res.error ?? 'Vault query failed'));
        return;
      }
      const parsed = parseVaultInfoRpc(res, id);
      if (!parsed) {
        setInspectError('Vault not found on this network (or SingleAssetVault amendment not yet active).');
      } else {
        setInspectedVault(parsed);
      }
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : String(err));
    } finally {
      setInspectLoading(false);
    }
  };

  // ============================================================================
  // Sub-Tab 2: XLS-66 Lending Protocol (LoanBrokerSet / LoanPay / Inspect)
  // ============================================================================
  const [brokerVaultId, setBrokerVaultId] = useState('');
  const [brokerMgmtFeePct, setBrokerMgmtFeePct] = useState('10');
  const [brokerDebtMax, setBrokerDebtMax] = useState('500000');
  const [brokerCoverMinPct, setBrokerCoverMinPct] = useState('10');
  const [brokerCoverLiqPct, setBrokerCoverLiqPct] = useState('50');
  const [brokerDataText, setBrokerDataText] = useState('Institutional Fixed-Term Credit Desk');

  const [payLoanId, setPayLoanId] = useState('');
  const [payLoanAmount, setPayLoanAmount] = useState('500');
  const [payLoanCurrency, setPayLoanCurrency] = useState('XRP');
  const [payLoanIssuer, setPayLoanIssuer] = useState('');

  const [inspectLoanId, setInspectLoanId] = useState('');
  const [loanLookupOutput, setLoanLookupOutput] = useState<string | null>(null);
  const [loanLookupErr, setLoanLookupErr] = useState<string | null>(null);
  const [loanLookupLoading, setLoanLookupLoading] = useState(false);

  const handleInspectLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = inspectLoanId.trim();
    if (!isValidLedgerObjectHex(id)) {
      setLoanLookupErr('Enter a valid 64-character hex Loan or LoanBroker ledger index.');
      return;
    }
    setLoanLookupLoading(true);
    setLoanLookupErr(null);
    setLoanLookupOutput(null);
    try {
      const res = await getXrplBridge().rpcRequest('ledger_entry', {
        index: id,
        ledger_index: 'validated',
      });
      if (res.status === 'error') {
        setLoanLookupErr(String(res.error_message ?? res.error ?? 'Ledger entry query failed'));
        return;
      }
      setLoanLookupOutput(JSON.stringify(res.result ?? res, null, 2));
    } catch (err) {
      setLoanLookupErr(err instanceof Error ? err.message : String(err));
    } finally {
      setLoanLookupLoading(false);
    }
  };

  // ============================================================================
  // Sub-Tab 3: XLS-65 + XLS-66 Yield & First-Loss Cover Waterfall Simulator
  // ============================================================================
  const [simVaultTvl, setSimVaultTvl] = useState(500_000);
  const [simYourDeposit, setSimYourDeposit] = useState(25_000);
  const [simUtilization, setSimUtilization] = useState(80);
  const [simLoanApr, setSimLoanApr] = useState(9.5);
  const [simTermDays, setSimTermDays] = useState(90);
  const [simMgmtFeePct, setSimMgmtFeePct] = useState(10);
  const [simFirstLossCover, setSimFirstLossCover] = useState(60_000);
  const [simDefaultShockPct, setSimDefaultShockPct] = useState(10);

  const simResult = useMemo(
    () =>
      simulateVaultYieldAndWaterfall({
        vaultTotalAssets: simVaultTvl,
        yourDeposit: simYourDeposit,
        loanUtilizationPct: simUtilization,
        loanAprPct: simLoanApr,
        termDays: simTermDays,
        brokerManagementFeePct: simMgmtFeePct,
        brokerFirstLossCover: simFirstLossCover,
        defaultShockPct: simDefaultShockPct,
      }),
    [
      simVaultTvl,
      simYourDeposit,
      simUtilization,
      simLoanApr,
      simTermDays,
      simMgmtFeePct,
      simFirstLossCover,
      simDefaultShockPct,
    ]
  );

  const renderAmendmentPill = (badge: typeof amendmentStatus.singleAssetVault) => (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-[11px] ${
        badge.status === 'enabled'
          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
          : badge.status === 'voting'
            ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
            : 'bg-slate-950 border-slate-700 text-slate-300'
      }`}
    >
      {badge.status === 'enabled' ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
      )}
      <span>
        <strong>{badge.xls}</strong> ({badge.name}):{' '}
        {badge.status === 'enabled'
          ? 'ENABLED'
          : badge.status === 'voting'
            ? `VOTING ${badge.votePct.toFixed(1)}% (${badge.count}/${badge.threshold})`
            : 'PENDING ACTIVATION'}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header + Live XLS-65 & XLS-66 Amendment Readiness Banner */}
      <div className="hud-panel rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-300">
                XLS-65 Single Asset Vaults &amp; XLS-66 Native Lending Protocol
              </h2>
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-cyan-300 uppercase">
                {streamStatus.networkId}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Create &amp; inspect protocol-native Single Asset Vaults (`XLS-65`), configure Fixed-Term Lending Brokers
              with First-Loss Cover (`XLS-66`), and stress-test depositor yield vs. default waterfalls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {vaultStatus.accounts.length > 0 ? (
              <select
                aria-label="Select signing wallet"
                value={activeAccount?.id ?? ''}
                onChange={(e) => selectWallet(e.target.value)}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
              >
                {vaultStatus.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({shortenAddress(a.address, 6, 4)})
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('wallets')}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono text-emerald-200"
              >
                Create / Unlock Wallet →
              </button>
            )}
          </div>
        </div>

        {/* Live Amendment Status Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
          <div className="flex flex-wrap gap-2">
            {renderAmendmentPill(amendmentStatus.singleAssetVault)}
            {renderAmendmentPill(amendmentStatus.lendingProtocol)}
          </div>
          <div className="flex items-center gap-2">
            {streamStatus.networkId !== 'devnet' && (
              <button
                type="button"
                onClick={() => void connectNetwork('devnet')}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-[11px] font-mono text-cyan-200 hover:bg-cyan-500/25"
              >
                Test on Devnet
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('validators')}
              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-300 hover:text-white"
            >
              Amendment Radar →
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'vaults', label: 'XLS-65 Single Asset Vaults', icon: Layers },
          { id: 'lending', label: 'XLS-66 Loan Broker & Repay', icon: Landmark },
          { id: 'simulator', label: 'Yield & First-Loss Waterfall Simulator', icon: Sliders },
          { id: 'guide', label: 'How XLS-65 + XLS-66 Work', icon: ShieldCheck },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as VaultTab)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono border transition-colors ${
                active
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                  : 'bg-panel border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* ==================================================================== */}
      {/* SUB-TAB 1: XLS-65 SINGLE ASSET VAULTS                                */}
      {/* ==================================================================== */}
      {tab === 'vaults' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Create Vault */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeAccount) return;
              void openTxConfirmModal(activeAccount.id, {
                kind: 'VaultCreate',
                account: activeAccount.address,
                asset:
                  vaultAssetCurrency.trim().toUpperCase() === 'XRP'
                    ? { currency: 'XRP' }
                    : { currency: vaultAssetCurrency.trim(), issuer: vaultAssetIssuer.trim() },
                assetsMaximum: vaultMaxAssets.trim() || undefined,
                domainId: vaultPrivate && vaultDomainId.trim() ? vaultDomainId.trim() : undefined,
                dataText: vaultDataText.trim() || undefined,
                isPrivate: vaultPrivate,
              });
            }}
            className="xl:col-span-6 hud-panel rounded-xl p-4 space-y-3"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
              Create XLS-65 Single Asset Vault (`VaultCreate`)
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Vault Asset (XRP or IOU)
                </label>
                <input
                  required
                  type="text"
                  value={vaultAssetCurrency}
                  onChange={(e) => setVaultAssetCurrency(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Assets Maximum Cap
                </label>
                <input
                  type="text"
                  value={vaultMaxAssets}
                  onChange={(e) => setVaultMaxAssets(e.target.value)}
                  placeholder="Blank = Uncapped"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
            </div>

            {vaultAssetCurrency.trim().toUpperCase() !== 'XRP' && (
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  IOU Issuer r-Address
                </label>
                <input
                  required
                  type="text"
                  value={vaultAssetIssuer}
                  onChange={(e) => setVaultAssetIssuer(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-cyan-200"
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-xs font-mono text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={vaultPrivate}
                onChange={(e) => setVaultPrivate(e.target.checked)}
              />
              Private / Permissioned Vault (`tfVaultPrivate` + XLS-80 DomainID)
            </label>

            {vaultPrivate && (
              <input
                type="text"
                value={vaultDomainId}
                onChange={(e) => setVaultDomainId(e.target.value)}
                placeholder="64-hex Permissioned DomainID"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-amber-200"
              />
            )}

            <input
              type="text"
              value={vaultDataText}
              onChange={(e) => setVaultDataText(e.target.value)}
              placeholder="Vault Metadata / Description (hex-encoded into Data field)"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-slate-200"
            />

            <button
              type="submit"
              disabled={!activeAccount}
              className="w-full py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
            >
              Preview VaultCreate
            </button>
          </form>

          {/* Deposit / Withdraw + Live Vault Inspector */}
          <div className="xl:col-span-6 space-y-4">
            <div className="hud-panel rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                Deposit or Withdraw Vault Liquidity (`VaultDeposit` / `VaultWithdraw`)
              </div>
              <input
                type="text"
                value={actionVaultId}
                onChange={(e) => setActionVaultId(e.target.value)}
                placeholder="64-hex VaultID"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-cyan-200"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  placeholder="Amount"
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={actionCurrency}
                  onChange={(e) => setActionCurrency(e.target.value)}
                  placeholder="XRP / RLUSD"
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={actionIssuer}
                  onChange={(e) => setActionIssuer(e.target.value)}
                  placeholder="Issuer (if IOU)"
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!activeAccount || !isValidLedgerObjectHex(actionVaultId)}
                  onClick={() =>
                    activeAccount &&
                    void openTxConfirmModal(activeAccount.id, {
                      kind: 'VaultDeposit',
                      account: activeAccount.address,
                      vaultId: actionVaultId.trim(),
                      amount: {
                        currency: actionCurrency.trim() || 'XRP',
                        issuer: actionCurrency.trim().toUpperCase() === 'XRP' ? undefined : actionIssuer.trim(),
                        value: actionAmount.trim(),
                      },
                    })
                  }
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200 disabled:opacity-40"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  VaultDeposit
                </button>
                <button
                  type="button"
                  disabled={!activeAccount || !isValidLedgerObjectHex(actionVaultId)}
                  onClick={() =>
                    activeAccount &&
                    void openTxConfirmModal(activeAccount.id, {
                      kind: 'VaultWithdraw',
                      account: activeAccount.address,
                      vaultId: actionVaultId.trim(),
                      amount: {
                        currency: actionCurrency.trim() || 'XRP',
                        issuer: actionCurrency.trim().toUpperCase() === 'XRP' ? undefined : actionIssuer.trim(),
                        value: actionAmount.trim(),
                      },
                    })
                  }
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-500/20 border border-violet-400/50 text-xs font-mono text-violet-200 disabled:opacity-40"
                >
                  <ArrowUpFromLine className="w-3.5 h-3.5" />
                  VaultWithdraw
                </button>
              </div>
            </div>

            {/* Live On-Ledger Vault Inspector */}
            <form onSubmit={(e) => void handleInspectVault(e)} className="hud-panel rounded-xl p-4 space-y-2.5">
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">
                On-Ledger Vault Inspector (`vault_info` RPC)
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inspectVaultId}
                  onChange={(e) => setInspectVaultId(e.target.value)}
                  placeholder="Paste 64-hex XLS-65 VaultID…"
                  className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
                <button
                  type="submit"
                  disabled={inspectLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200"
                >
                  {inspectLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Inspect
                </button>
              </div>
              {inspectError && (
                <div className="p-2 rounded bg-rose-500/15 border border-rose-400/40 text-[11px] font-mono text-rose-200">
                  {inspectError}
                </div>
              )}
              {inspectedVault && (
                <div className="grid grid-cols-2 gap-2 font-mono text-xs pt-1">
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-500">Asset / Mode</div>
                    <div className="text-emerald-300 font-bold">
                      {inspectedVault.assetLabel} • {inspectedVault.isPrivate ? 'Private' : 'Public'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-500">Assets Total / Avail</div>
                    <div className="text-white font-bold">
                      {inspectedVault.assetsTotal} / {inspectedVault.assetsAvailable}
                    </div>
                  </div>
                  <div className="col-span-2 p-2 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-400 truncate">
                    Owner: {inspectedVault.owner} • Share MPT: {inspectedVault.shareMptId}
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 2: XLS-66 LOAN BROKER & REPAYMENT                            */}
      {/* ==================================================================== */}
      {tab === 'lending' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeAccount) return;
              void openTxConfirmModal(activeAccount.id, {
                kind: 'LoanBrokerSet',
                account: activeAccount.address,
                vaultId: brokerVaultId.trim(),
                managementFeeRateBps: Math.round((Number(brokerMgmtFeePct) || 0) * 100),
                debtMaximum: brokerDebtMax.trim() || '0',
                coverRateMinimumPct: Number(brokerCoverMinPct) || 10,
                coverRateLiquidationPct: Number(brokerCoverLiqPct) || 50,
                dataText: brokerDataText.trim() || undefined,
              });
            }}
            className="xl:col-span-6 hud-panel rounded-xl p-4 space-y-3"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
              Configure XLS-66 Loan Broker (`LoanBrokerSet`)
            </div>
            <input
              required
              type="text"
              value={brokerVaultId}
              onChange={(e) => setBrokerVaultId(e.target.value)}
              placeholder="Linked XLS-65 64-hex VaultID"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-cyan-200"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Management Fee %
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={brokerMgmtFeePct}
                  onChange={(e) => setBrokerMgmtFeePct(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Debt Maximum Cap
                </label>
                <input
                  type="text"
                  value={brokerDebtMax}
                  onChange={(e) => setBrokerDebtMax(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  First-Loss Cover Min %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={brokerCoverMinPct}
                  onChange={(e) => setBrokerCoverMinPct(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-emerald-200"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Cover Liquidation %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={brokerCoverLiqPct}
                  onChange={(e) => setBrokerCoverLiqPct(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-amber-200"
                />
              </div>
            </div>
            <input
              type="text"
              value={brokerDataText}
              onChange={(e) => setBrokerDataText(e.target.value)}
              placeholder="Underwriter / Desk Memo (Data)"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-slate-200"
            />
            <button
              type="submit"
              disabled={!activeAccount || !isValidLedgerObjectHex(brokerVaultId)}
              className="w-full py-2 rounded-xl bg-amber-500/20 border border-amber-400/50 text-xs font-mono font-semibold text-amber-200 disabled:opacity-40"
            >
              Preview LoanBrokerSet
            </button>
          </form>

          <div className="xl:col-span-6 space-y-4">
            {/* Borrower Repayment */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!activeAccount) return;
                void openTxConfirmModal(activeAccount.id, {
                  kind: 'LoanPay',
                  account: activeAccount.address,
                  loanId: payLoanId.trim(),
                  amount: {
                    currency: payLoanCurrency.trim() || 'XRP',
                    issuer: payLoanCurrency.trim().toUpperCase() === 'XRP' ? undefined : payLoanIssuer.trim(),
                    value: payLoanAmount.trim(),
                  },
                });
              }}
              className="hud-panel rounded-xl p-4 space-y-3"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
                Borrower Loan Repayment (`LoanPay`)
              </div>
              <input
                required
                type="text"
                value={payLoanId}
                onChange={(e) => setPayLoanId(e.target.value)}
                placeholder="64-hex LoanID"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-cyan-200"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  required
                  type="text"
                  value={payLoanAmount}
                  onChange={(e) => setPayLoanAmount(e.target.value)}
                  placeholder="Amount"
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={payLoanCurrency}
                  onChange={(e) => setPayLoanCurrency(e.target.value)}
                  placeholder="XRP / RLUSD"
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={payLoanIssuer}
                  onChange={(e) => setPayLoanIssuer(e.target.value)}
                  placeholder="Issuer (if IOU)"
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <button
                type="submit"
                disabled={!activeAccount || !isValidLedgerObjectHex(payLoanId)}
                className="w-full py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono font-semibold text-emerald-200 disabled:opacity-40"
              >
                Preview LoanPay
              </button>
            </form>

            {/* On-Ledger Loan / Broker Inspector */}
            <form onSubmit={(e) => void handleInspectLoan(e)} className="hud-panel rounded-xl p-4 space-y-2.5">
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">
                Inspect On-Ledger Loan / LoanBroker Object (`ledger_entry`)
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inspectLoanId}
                  onChange={(e) => setInspectLoanId(e.target.value)}
                  placeholder="64-hex Loan or LoanBroker ledger index…"
                  className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
                <button
                  type="submit"
                  disabled={loanLookupLoading}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200"
                >
                  {loanLookupLoading ? 'Loading…' : 'Query'}
                </button>
              </div>
              {loanLookupErr && (
                <div className="p-2 rounded bg-rose-500/15 border border-rose-400/40 text-[11px] font-mono text-rose-200">
                  {loanLookupErr}
                </div>
              )}
              {loanLookupOutput && (
                <pre className="rounded-lg bg-slate-950 border border-slate-800 p-2.5 text-[10px] font-mono text-cyan-100 max-h-48 overflow-auto">
                  {loanLookupOutput}
                </pre>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 3: YIELD & FIRST-LOSS COVER WATERFALL SIMULATOR              */}
      {/* ==================================================================== */}
      {tab === 'simulator' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-6 hud-panel rounded-xl p-4 space-y-3 font-mono text-xs">
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
              Vault &amp; Credit Pool Parameters
            </div>

            {[
              { label: 'Existing Vault TVL', val: simVaultTvl, set: setSimVaultTvl, min: 10000, max: 5000000, step: 10000, fmt: (v: number) => `${v.toLocaleString()}` },
              { label: 'Your Deposit', val: simYourDeposit, set: setSimYourDeposit, min: 500, max: 500000, step: 500, fmt: (v: number) => `${v.toLocaleString()}` },
              { label: 'Loan Utilization %', val: simUtilization, set: setSimUtilization, min: 0, max: 100, step: 5, fmt: (v: number) => `${v}%` },
              { label: 'Fixed Loan APR %', val: simLoanApr, set: setSimLoanApr, min: 1, max: 25, step: 0.5, fmt: (v: number) => `${v}%` },
              { label: 'Loan Term (Days)', val: simTermDays, set: setSimTermDays, min: 7, max: 365, step: 1, fmt: (v: number) => `${v}d` },
              { label: 'Broker Mgmt Fee %', val: simMgmtFeePct, set: setSimMgmtFeePct, min: 0, max: 30, step: 1, fmt: (v: number) => `${v}%` },
              { label: 'Broker First-Loss Cover', val: simFirstLossCover, set: setSimFirstLossCover, min: 0, max: 500000, step: 5000, fmt: (v: number) => `${v.toLocaleString()}` },
              { label: 'Simulated Default Shock %', val: simDefaultShockPct, set: setSimDefaultShockPct, min: 0, max: 50, step: 1, fmt: (v: number) => `${v}%` },
            ].map((ctrl) => (
              <label key={ctrl.label} className="block space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">{ctrl.label}</span>
                  <span className="text-white font-semibold">{ctrl.fmt(ctrl.val)}</span>
                </div>
                <input
                  type="range"
                  min={ctrl.min}
                  max={ctrl.max}
                  step={ctrl.step}
                  value={ctrl.val}
                  onChange={(e) => ctrl.set(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
              </label>
            ))}
          </div>

          <div className="xl:col-span-6 hud-panel rounded-xl p-4 space-y-4 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
                Projected Depositor Return &amp; Loss Waterfall
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-[11px] text-emerald-200">
                Net APY: {simResult.netDepositorApyPct}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500">Your Vault Share</div>
                <div className="text-base font-bold text-cyan-300">{simResult.yourSharePct.toFixed(2)}%</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500">Your Interest Earned</div>
                <div className="text-base font-bold text-emerald-300">
                  +{simResult.yourProjectedInterest.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500">Broker Cover Absorbed</div>
                <div className="text-base font-bold text-amber-300">
                  {simResult.brokerCoverAbsorbed.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500">Your Net Ending Balance</div>
                <div
                  className={`text-base font-bold ${
                    simResult.yourNetPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {simResult.yourNetEndingBalance.toLocaleString()} ({simResult.yourNetPnl >= 0 ? '+' : ''}
                  {simResult.yourNetPnl.toLocaleString()})
                </div>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border text-xs ${
                simResult.coverProtectedDepositors
                  ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-200'
                  : simResult.depositorPrincipalLoss > 0
                    ? 'bg-rose-500/10 border-rose-400/40 text-rose-200'
                    : 'bg-cyan-500/10 border-cyan-400/35 text-cyan-200'
              }`}
            >
              {simResult.defaultLossPrincipal === 0
                ? 'Zero default shock simulated — full principal + net interest flows cleanly to XLS-65 vault shares.'
                : simResult.coverProtectedDepositors
                  ? `FIRST-LOSS SHIELD HELD: The Loan Broker's First-Loss Cover absorbed the entire ${simResult.defaultLossPrincipal.toLocaleString()} default loss — depositors lost 0 principal!`
                  : `COVER EXCEEDED: Default loss (${simResult.defaultLossPrincipal.toLocaleString()}) exceeded Broker Cover (${simResult.brokerCoverAbsorbed.toLocaleString()}), spilling ${simResult.depositorPrincipalLoss.toLocaleString()} onto vault depositors (your share: -${simResult.yourPrincipalLoss.toLocaleString()}).`}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 4: ARCHITECTURE GUIDE                                        */}
      {/* ==================================================================== */}
      {tab === 'guide' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="hud-panel rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-emerald-300">1. XLS-65 Single Asset Vaults</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Protocol-native pooled accounts holding one asset (XRP, IOU like RLUSD, or XLS-33 MPT). Depositors
              receive native <strong>XLS-33 MPT Vault Shares</strong>. Vaults can be open to anyone or gated via{' '}
              <strong>XLS-80 Permissioned Domains</strong> for compliant KYC/AML pools.
            </p>
          </div>
          <div className="hud-panel rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-amber-300">2. XLS-66 Native Lending Protocol</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Plugs directly into XLS-65 Vaults for <strong>fixed-term, fixed-rate</strong> institutional credit.
              Underwriters operate as <strong>Loan Brokers</strong>, posting on-ledger <strong>First-Loss Cover</strong>{' '}
              that absorbs borrower defaults before regular depositors take any loss.
            </p>
          </div>
          <div className="hud-panel rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-cyan-300">3. Zero Smart-Contract Risk</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Because vault accounting, share minting, interest accrual, and default waterfalls run natively in{' '}
              <code>rippled</code> consensus C++, there are no re-entrancy exploits, flash-loan drains, or gas wars —
              just ~3.5s deterministic settlement.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
