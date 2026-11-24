import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Clock,
  Copy,
  Droplets,
  Eye,
  KeyRound,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Wallet as WalletIcon,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import type { WalletAlgorithm, WalletCheckEntry } from '../shared/types';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

type WalletSubTab = 'portfolio' | 'send-trust' | 'dex-amm' | 'escrow-nft';

const TRUSTLINE_PRESETS = [
  { label: 'RLUSD (Ripple USD)', currency: 'RLUSD', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' },
  { label: 'SOLO (Sologenic)', currency: 'SOLO', issuer: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz' },
  { label: 'CORE (Coreum)', currency: 'CORE', issuer: 'rcoreNywaoz2ZCQ8Lg2EbSLnGuRBmun6D' },
  { label: 'USD (Bitstamp)', currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B' },
  { label: 'USD (GateHub)', currency: 'USD', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq' },
];

export const WalletDeck: React.FC = () => {
  const vaultStatus = useCommandStore((s) => s.vaultStatus);
  const selectedWalletId = useCommandStore((s) => s.selectedWalletId);
  const walletPortfolio = useCommandStore((s) => s.walletPortfolio);
  const walletPortfolioLoading = useCommandStore((s) => s.walletPortfolioLoading);
  const streamStatus = useCommandStore((s) => s.streamStatus);
  const refreshVaultStatus = useCommandStore((s) => s.refreshVaultStatus);
  const selectWallet = useCommandStore((s) => s.selectWallet);
  const refreshWalletPortfolio = useCommandStore((s) => s.refreshWalletPortfolio);
  const openTxConfirmModal = useCommandStore((s) => s.openTxConfirmModal);
  const connectNetwork = useCommandStore((s) => s.connectNetwork);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);

  const [subTab, setSubTab] = useState<WalletSubTab>('portfolio');

  // Vault setup/unlock & account onboarding modals
  const [passphrase, setPassphrase] = useState('');
  const [vaultBannerMsg, setVaultBannerMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'import' | 'watch' | 'qr' | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newAlgo, setNewAlgo] = useState<WalletAlgorithm>('ed25519');
  const [importSeedInput, setImportSeedInput] = useState('');
  const [watchAddrInput, setWatchAddrInput] = useState('');
  const [oneTimeBackup, setOneTimeBackup] = useState<{ address: string; seed: string } | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);

  // 1) Payment & TrustSet form state
  const [payDest, setPayDest] = useState('');
  const [payAssetKey, setPayAssetKey] = useState('XRP');
  const [payAmount, setPayAmount] = useState('');
  const [payDestTag, setPayDestTag] = useState('');
  const [payMemo, setPayMemo] = useState('');

  const [tlCurrency, setTlCurrency] = useState('RLUSD');
  const [tlIssuer, setTlIssuer] = useState('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De');
  const [tlLimit, setTlLimit] = useState('1000000');

  // 2) DEX & AMM form state
  const [dexSide, setDexSide] = useState<'buy' | 'sell'>('buy');
  const [dexTokenCurrency, setDexTokenCurrency] = useState('RLUSD');
  const [dexTokenIssuer, setDexTokenIssuer] = useState('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De');
  const [dexTokenAmount, setDexTokenAmount] = useState('');
  const [dexXrpTotal, setDexXrpTotal] = useState('');
  const [dexOrderMode, setDexOrderMode] = useState<'limit' | 'passive' | 'ioc' | 'fok'>('limit');

  const [ammAction, setAmmAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [ammTokenCurrency, setAmmTokenCurrency] = useState('RLUSD');
  const [ammTokenIssuer, setAmmTokenIssuer] = useState('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De');
  const [ammXrpAmount, setAmmXrpAmount] = useState('');
  const [ammTokenAmount, setAmmTokenAmount] = useState('');
  const [ammWithdrawAll, setAmmWithdrawAll] = useState(false);

  // 3) Escrow, Check & NFT form state
  const [escrowDest, setEscrowDest] = useState('');
  const [escrowXrp, setEscrowXrp] = useState('');
  const [escrowMinutes, setEscrowMinutes] = useState('60');
  const [escrowCancelHours, setEscrowCancelHours] = useState('');

  const [checkDest, setCheckDest] = useState('');
  const [checkXrp, setCheckXrp] = useState('');

  const [nftUri, setNftUri] = useState('ipfs://');
  const [nftTaxon, setNftTaxon] = useState('0');
  const [nftRoyaltyPct, setNftRoyaltyPct] = useState('5');
  const [nftTransferDest, setNftTransferDest] = useState('');
  const [nftOfferPriceXrp, setNftOfferPriceXrp] = useState('0');
  const [activeNftOfferId, setActiveNftOfferId] = useState<string | null>(null);

  useEffect(() => {
    void refreshVaultStatus();
  }, [refreshVaultStatus]);

  const activeAccount = vaultStatus.accounts.find((a) => a.id === selectedWalletId) ?? null;
  const isCustodial = activeAccount?.kind === 'custodial';

  const handleVaultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultBannerMsg(null);
    const bridge = getXrplBridge();
    const res = vaultStatus.initialized
      ? await bridge.walletUnlockVault(passphrase)
      : await bridge.walletSetupVault(passphrase);

    if (!res.ok) {
      setVaultBannerMsg({ ok: false, text: res.error ?? 'Vault operation failed' });
    } else {
      setPassphrase('');
      setVaultBannerMsg({
        ok: true,
        text: vaultStatus.initialized
          ? 'Encrypted vault unlocked in isolated Main process.'
          : 'Encrypted vault initialized with scrypt + AES-256-GCM.',
      });
      await refreshVaultStatus();
    }
  };

  const handleLockVault = async () => {
    await getXrplBridge().walletLockVault();
    setVaultBannerMsg({ ok: true, text: 'Vault locked — signing keys wiped from memory.' });
    await refreshVaultStatus();
  };

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await getXrplBridge().walletCreate(newLabel, newAlgo);
    if (!res.ok) {
      setVaultBannerMsg({ ok: false, text: res.error ?? 'Could not create wallet' });
      return;
    }
    setNewLabel('');
    setModalMode(null);
    if (res.account && res.oneTimeSeed) {
      setBackupConfirmed(false);
      setOneTimeBackup({ address: res.account.address, seed: res.oneTimeSeed });
    }
    await refreshVaultStatus();
    if (res.account) await selectWallet(res.account.id);
  };

  const handleImportSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await getXrplBridge().walletImportSeed(newLabel, importSeedInput);
    setImportSeedInput('');
    if (!res.ok) {
      setVaultBannerMsg({ ok: false, text: res.error ?? 'Seed import failed' });
      return;
    }
    setNewLabel('');
    setModalMode(null);
    setVaultBannerMsg({ ok: true, text: `Imported ${res.account?.address}` });
    await refreshVaultStatus();
    if (res.account) await selectWallet(res.account.id);
  };

  const handleAddWatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await getXrplBridge().walletAddWatchOnly(newLabel, watchAddrInput);
    if (!res.ok) {
      setVaultBannerMsg({ ok: false, text: res.error ?? 'Invalid watch address' });
      return;
    }
    setNewLabel('');
    setWatchAddrInput('');
    setModalMode(null);
    await refreshVaultStatus();
    if (res.account) await selectWallet(res.account.id);
  };

  const handleFaucet = async () => {
    if (!activeAccount) return;
    setFaucetLoading(true);
    const res = await getXrplBridge().walletFundFaucet(activeAccount.address, streamStatus.networkId);
    setFaucetLoading(false);
    setVaultBannerMsg({
      ok: res.ok,
      text: res.ok ? res.message ?? 'Funded!' : res.error ?? 'Faucet failed',
    });
    if (res.ok) {
      setTimeout(() => void refreshWalletPortfolio(), 4200);
    }
  };

  const handleCopyAddress = () => {
    if (!activeAccount) return;
    void navigator.clipboard.writeText(activeAccount.address);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 1600);
  };

  const submitPaymentForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    let asset = { currency: 'XRP', value: payAmount.trim() } as {
      currency: string;
      issuer?: string;
      value: string;
    };
    if (payAssetKey !== 'XRP') {
      const [curRaw, issuer] = payAssetKey.split(':');
      asset = { currency: curRaw, issuer, value: payAmount.trim() };
    }
    const parsedTag = payDestTag.trim() ? Number(payDestTag.trim()) : undefined;
    void openTxConfirmModal(activeAccount.id, {
      kind: 'Payment',
      account: activeAccount.address,
      destination: payDest.trim(),
      asset,
      destinationTag: parsedTag !== undefined && Number.isFinite(parsedTag) ? parsedTag : undefined,
      memoText: payMemo.trim() || undefined,
    });
  };

  const submitTrustSetForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    void openTxConfirmModal(activeAccount.id, {
      kind: 'TrustSet',
      account: activeAccount.address,
      currency: tlCurrency.trim(),
      issuer: tlIssuer.trim(),
      limit: tlLimit.trim(),
      allowRippling: false,
    });
  };

  const submitDexOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    const xrpSpec = { currency: 'XRP', value: dexXrpTotal.trim() };
    const tokSpec = {
      currency: dexTokenCurrency.trim(),
      issuer: dexTokenIssuer.trim(),
      value: dexTokenAmount.trim(),
    };
    // In XRPL OfferCreate: TakerGets = what WE give/sell; TakerPays = what WE receive/buy
    void openTxConfirmModal(activeAccount.id, {
      kind: 'OfferCreate',
      account: activeAccount.address,
      takerGets: dexSide === 'buy' ? xrpSpec : tokSpec,
      takerPays: dexSide === 'buy' ? tokSpec : xrpSpec,
      orderMode: dexOrderMode,
    });
  };

  const submitAmmForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    const asset1 = { currency: 'XRP' };
    const asset2 = { currency: ammTokenCurrency.trim(), issuer: ammTokenIssuer.trim() };

    if (ammAction === 'deposit') {
      void openTxConfirmModal(activeAccount.id, {
        kind: 'AMMDeposit',
        account: activeAccount.address,
        asset1,
        asset2,
        amount1: { currency: 'XRP', value: ammXrpAmount.trim() },
        ...(ammTokenAmount.trim()
          ? {
              amount2: {
                currency: ammTokenCurrency.trim(),
                issuer: ammTokenIssuer.trim(),
                value: ammTokenAmount.trim(),
              },
            }
          : {}),
      });
    } else {
      void openTxConfirmModal(activeAccount.id, {
        kind: 'AMMWithdraw',
        account: activeAccount.address,
        asset1,
        asset2,
        withdrawAll: ammWithdrawAll,
        ...(!ammWithdrawAll && ammXrpAmount.trim()
          ? { amount1: { currency: 'XRP', value: ammXrpAmount.trim() } }
          : {}),
      });
    }
  };

  const submitEscrowCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    const now = Date.now();
    const finishMs = now + Math.max(1, Number(escrowMinutes) || 60) * 60_000;
    const cancelMs = escrowCancelHours.trim()
      ? finishMs + Math.max(1, Number(escrowCancelHours)) * 3_600_000
      : undefined;

    void openTxConfirmModal(activeAccount.id, {
      kind: 'EscrowCreate',
      account: activeAccount.address,
      destination: escrowDest.trim() || activeAccount.address,
      amountXrp: escrowXrp.trim(),
      finishAfterUnixMs: finishMs,
      cancelAfterUnixMs: cancelMs,
    });
  };

  const submitCheckCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    void openTxConfirmModal(activeAccount.id, {
      kind: 'CheckCreate',
      account: activeAccount.address,
      destination: checkDest.trim(),
      sendMax: { currency: 'XRP', value: checkXrp.trim() },
    });
  };

  const submitCashCheck = (chk: WalletCheckEntry) => {
    if (!activeAccount) return;
    const amountSpec =
      typeof chk.sendMaxRaw === 'string'
        ? { currency: 'XRP', value: (Number(chk.sendMaxRaw) / 1_000_000).toString() }
        : {
            currency: chk.sendMaxRaw.currency,
            issuer: chk.sendMaxRaw.issuer,
            value: chk.sendMaxRaw.value,
          };
    void openTxConfirmModal(activeAccount.id, {
      kind: 'CheckCash',
      account: activeAccount.address,
      checkId: chk.index,
      amount: amountSpec,
    });
  };

  const submitNftMint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    const royaltyBps = Math.round((Number(nftRoyaltyPct) || 0) * 100);
    void openTxConfirmModal(activeAccount.id, {
      kind: 'NFTokenMint',
      account: activeAccount.address,
      uriText: nftUri.trim(),
      taxon: Number(nftTaxon) || 0,
      transferFeeBps: royaltyBps,
      transferable: true,
      burnable: true,
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Vault Security Header */}
      <div className="hud-panel rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <WalletIcon className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                  Encrypted XRPL Wallet Vault &amp; DeFi Studio
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                    vaultStatus.unlocked
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                      : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                  }`}
                >
                  {vaultStatus.unlocked
                    ? 'VAULT UNLOCKED'
                    : vaultStatus.initialized
                      ? 'VAULT LOCKED'
                      : 'VAULT UNINITIALIZED'}
                </span>
                {vaultStatus.osKeychainAvailable && (
                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/30 text-[10px] font-mono text-cyan-300">
                    OS Keyring Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Keys encrypted at rest (`scrypt` + `AES-256-GCM`) and isolated inside the Electron Main process
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {vaultStatus.unlocked && (
              <>
                <button
                  type="button"
                  onClick={() => setModalMode('create')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono text-emerald-200 hover:bg-emerald-500/30"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Wallet
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('import')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200 hover:bg-cyan-500/30"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Import Seed
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setModalMode('watch')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 hover:border-cyan-400/50"
            >
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              Watch Address
            </button>

            {vaultStatus.unlocked && (
              <button
                type="button"
                onClick={() => void handleLockVault()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-amber-400/40 text-xs font-mono text-amber-200 hover:bg-amber-500/15"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock
              </button>
            )}
          </div>
        </div>

        {/* Vault Setup / Unlock Inline Bar when Locked */}
        {!vaultStatus.unlocked && (
          <form
            onSubmit={(e) => void handleVaultSubmit(e)}
            className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-950/85 border border-slate-800"
          >
            <Unlock className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-mono text-slate-300">
              {vaultStatus.initialized
                ? 'Unlock your encrypted vault to create wallets or sign transactions:'
                : 'Set a master passphrase (8+ chars) to initialize your local encrypted signing vault:'}
            </span>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={vaultStatus.initialized ? 'Enter master passphrase…' : 'Create master passphrase (min 8 chars)…'}
              className="flex-1 min-w-[210px] rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200 hover:bg-cyan-500/30"
            >
              {vaultStatus.initialized ? 'Unlock Vault' : 'Initialize Vault'}
            </button>
          </form>
        )}

        {vaultBannerMsg && (
          <div
            className={`px-3 py-2 rounded-lg text-xs font-mono border flex items-center justify-between ${
              vaultBannerMsg.ok
                ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
            }`}
          >
            <span>{vaultBannerMsg.text}</span>
            <button
              type="button"
              onClick={() => setVaultBannerMsg(null)}
              className="text-slate-400 hover:text-white ml-3"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Main Split: Wallet Accounts Sidebar + Active Wallet Cockpit */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Account Switcher Column */}
        <div className="xl:col-span-3 hud-panel rounded-xl p-3.5 space-y-2 h-fit">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400 px-1">
            Tracked Wallets ({vaultStatus.accounts.length})
          </div>

          {vaultStatus.accounts.length === 0 ? (
            <div className="py-8 px-2 text-center text-xs font-mono text-slate-500">
              Initialize/unlock your vault to create a signing wallet, or click Watch Address above.
            </div>
          ) : (
            <div className="space-y-1.5">
              {vaultStatus.accounts.map((acct) => {
                const selected = acct.id === selectedWalletId;
                return (
                  <div
                    key={acct.id}
                    className={`group flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selected
                        ? 'bg-cyan-500/15 border-cyan-400/50 shadow-glowCyan'
                        : 'bg-slate-950/65 border-slate-800/80 hover:border-slate-700'
                    }`}
                    onClick={() => void selectWallet(acct.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {acct.kind === 'custodial' ? (
                          <KeyRound className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-white truncate">{acct.label}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {shortenAddress(acct.address, 8, 6)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void getXrplBridge()
                          .walletRemoveAccount(acct.id)
                          .then(() => refreshVaultStatus());
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400"
                      title="Remove wallet from list"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Wallet Cockpit */}
        <div className="xl:col-span-9 space-y-4">
          {!activeAccount ? (
            <div className="hud-panel rounded-xl p-12 text-center space-y-2">
              <WalletIcon className="w-9 h-9 text-cyan-400/50 mx-auto" />
              <div className="text-sm font-semibold text-white">No Wallet Selected</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Create a new encrypted XRPL wallet, import an existing family seed, or add any `r...` address in
                watch-only mode to inspect reserves, tokens, DEX orders, escrows, checks, and NFTs.
              </p>
            </div>
          ) : (
            <>
              {/* Portfolio Balance & Reserve Breakdown Header */}
              <div className="hud-panel rounded-xl p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{activeAccount.label}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          isCustodial
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {isCustodial ? `SIGNING (${activeAccount.algorithm ?? 'ed25519'})` : 'WATCH-ONLY'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-xs text-cyan-300">
                      <span>{activeAccount.address}</span>
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                        title="Copy address"
                      >
                        {copiedAddr ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModalMode('qr')}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 hover:border-cyan-400/50"
                    >
                      <QrCode className="w-3.5 h-3.5 text-cyan-400" />
                      Receive QR
                    </button>

                    {streamStatus.networkId === 'testnet' || streamStatus.networkId === 'devnet' ? (
                      <button
                        type="button"
                        disabled={faucetLoading}
                        onClick={() => void handleFaucet()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono text-emerald-200 hover:bg-emerald-500/30"
                      >
                        <Droplets className="w-3.5 h-3.5" />
                        {faucetLoading ? 'Funding…' : `Fund via ${streamStatus.networkId.toUpperCase()} Faucet`}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void connectNetwork('testnet')}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 hover:text-cyan-300"
                        title="Switch to XRPL Testnet for free test XRP faucet funding"
                      >
                        Switch to Testnet Faucet
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void refreshWalletPortfolio()}
                      disabled={walletPortfolioLoading}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 hover:border-cyan-400/50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${walletPortfolioLoading ? 'animate-spin text-cyan-400' : ''}`} />
                      Sync
                    </button>
                  </div>
                </div>

                {walletPortfolio?.error && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/30 text-xs font-mono text-amber-200">
                    {walletPortfolio.error}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
                    <div className="text-[10px] uppercase text-slate-500">Total Balance</div>
                    <div className="text-lg font-bold text-white tabular-nums mt-0.5">
                      {walletPortfolio?.totalXrpDisplay ?? '0'} XRP
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-950/80 border border-emerald-500/25 p-3">
                    <div className="text-[10px] uppercase text-slate-500">Spendable XRP</div>
                    <div className="text-lg font-bold text-emerald-300 tabular-nums mt-0.5">
                      {(walletPortfolio?.spendableXrp ?? 0).toLocaleString()} XRP
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
                    <div className="text-[10px] uppercase text-slate-500">Locked Reserve</div>
                    <div className="text-lg font-bold text-cyan-300 tabular-nums mt-0.5">
                      {(
                        (walletPortfolio?.baseReserveXrp ?? 1) +
                        (walletPortfolio?.ownerReserveXrp ?? 0)
                      ).toFixed(2)}{' '}
                      XRP
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {walletPortfolio?.baseReserveXrp ?? 1} base + {walletPortfolio?.ownerCount ?? 0} objects
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
                    <div className="text-[10px] uppercase text-slate-500">Assets &amp; NFTs</div>
                    <div className="text-lg font-bold text-violet-300 tabular-nums mt-0.5">
                      {walletPortfolio?.tokens.length ?? 0} TL • {walletPortfolio?.nfts.length ?? 0} NFT
                    </div>
                    <div className="text-[10px] text-slate-500">Seq #{walletPortfolio?.sequence ?? 0}</div>
                  </div>
                </div>
              </div>

              {/* Wallet Sub-Tabs */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'portfolio', label: 'Overview & Activity', icon: WalletIcon },
                  { id: 'send-trust', label: 'Send & TrustLines', icon: Send },
                  { id: 'dex-amm', label: 'DEX & AMM Trading', icon: ArrowLeftRight },
                  { id: 'escrow-nft', label: 'Escrows, Checks & NFTs', icon: Sparkles },
                ].map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSubTab(t.id as WalletSubTab)}
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

              {/* SUB-TAB 1: PORTFOLIO & ACTIVITY */}
              {subTab === 'portfolio' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Issued Token Balances */}
                  <div className="hud-panel rounded-xl p-4 space-y-2.5">
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                      Issued Token TrustLines ({walletPortfolio?.tokens.length ?? 0})
                    </div>
                    {(walletPortfolio?.tokens.length ?? 0) === 0 ? (
                      <div className="text-xs font-mono text-slate-500 py-6 text-center">
                        No TrustLines configured yet. Add RLUSD, SOLO, USD, or any token in Send &amp; TrustLines.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {walletPortfolio!.tokens.map((tok, i) => (
                          <div
                            key={`${tok.currencyRaw}-${tok.issuer}-${i}`}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/75 border border-slate-800 font-mono text-xs"
                          >
                            <div>
                              <div className="text-emerald-300 font-bold">{tok.currency}</div>
                              <div className="text-[10px] text-slate-500">
                                {shortenAddress(tok.issuer, 8, 5)} • Limit {tok.limit}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-semibold tabular-nums">{tok.balance}</span>
                              {isCustodial && Number(tok.balance) === 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void openTxConfirmModal(activeAccount.id, {
                                      kind: 'TrustSet',
                                      account: activeAccount.address,
                                      currency: tok.currencyRaw,
                                      issuer: tok.issuer,
                                      limit: '0',
                                    })
                                  }
                                  className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-400/30 text-[10px] text-rose-300 hover:bg-rose-500/25"
                                  title="Remove zero-balance TrustLine and reclaim 0.2 XRP reserve"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Open DEX Offers + Recent Txs */}
                  <div className="hud-panel rounded-xl p-4 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
                      Open DEX Orders ({walletPortfolio?.offers.length ?? 0})
                    </div>
                    {(walletPortfolio?.offers.length ?? 0) === 0 ? (
                      <div className="text-xs font-mono text-slate-500 py-2">No active limit orders on the DEX.</div>
                    ) : (
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {walletPortfolio!.offers.map((o) => (
                          <div
                            key={o.seq}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-xs"
                          >
                            <div>
                              <span className="text-amber-200">Give {o.takerGetsDisplay}</span>
                              <span className="text-slate-500"> → Get {o.takerPaysDisplay}</span>
                            </div>
                            {isCustodial && (
                              <button
                                type="button"
                                onClick={() =>
                                  void openTxConfirmModal(activeAccount.id, {
                                    kind: 'OfferCancel',
                                    account: activeAccount.address,
                                    offerSequence: o.seq,
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-400/40 text-[10px] text-rose-200"
                              >
                                Cancel #{o.seq}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-800">
                      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300 mb-2">
                        Recent Account Transactions
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {(walletPortfolio?.recentTransactions ?? []).map((tx) => (
                          <button
                            key={tx.id}
                            type="button"
                            onClick={() => void inspectQuery(tx.hash)}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950/70 border border-slate-800/80 hover:border-cyan-400/40 font-mono text-xs"
                          >
                            <span className="text-slate-200">{tx.txType}</span>
                            <span className="text-cyan-300 tabular-nums">{tx.amountDisplay}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: SEND & TRUSTLINES */}
              {subTab === 'send-trust' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Send XRP / Token Payment */}
                  <form onSubmit={submitPaymentForm} className="hud-panel rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                        Send XRP or Issued Token
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Automatically checks destination `RequireDest` tag enforcement and reserve requirements.
                    </p>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Asset</label>
                      <select
                        value={payAssetKey}
                        onChange={(e) => setPayAssetKey(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      >
                        <option value="XRP">XRP (Native)</option>
                        {(walletPortfolio?.tokens ?? []).map((t) => (
                          <option key={`${t.currencyRaw}:${t.issuer}`} value={`${t.currencyRaw}:${t.issuer}`}>
                            {t.currency} (Bal: {t.balance})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Destination r-Address
                      </label>
                      <input
                        required
                        type="text"
                        value={payDest}
                        onChange={(e) => setPayDest(e.target.value)}
                        placeholder="r..."
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Amount</label>
                        <input
                          required
                          type="text"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          placeholder="10.5"
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Destination Tag (Optional)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={payDestTag}
                          onChange={(e) => setPayDestTag(e.target.value)}
                          placeholder="e.g. 123456"
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Public Memo (Optional)
                      </label>
                      <input
                        type="text"
                        value={payMemo}
                        onChange={(e) => setPayMemo(e.target.value)}
                        placeholder="Invoice #42"
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!isCustodial}
                      className="w-full py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
                    >
                      {isCustodial ? 'Preview & Sign Payment' : 'Requires Custodial Signing Wallet'}
                    </button>
                  </form>

                  {/* TrustLine Manager */}
                  <form onSubmit={submitTrustSetForm} className="hud-panel rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
                        TrustLine Manager (`TrustSet`)
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {TRUSTLINE_PRESETS.map((p) => (
                        <button
                          key={`${p.currency}-${p.issuer}`}
                          type="button"
                          onClick={() => {
                            setTlCurrency(p.currency);
                            setTlIssuer(p.issuer);
                          }}
                          className="px-2 py-1 rounded bg-slate-950 border border-slate-800 hover:border-emerald-400/50 text-[10px] font-mono text-slate-300"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Currency Code
                        </label>
                        <input
                          required
                          type="text"
                          value={tlCurrency}
                          onChange={(e) => setTlCurrency(e.target.value)}
                          placeholder="RLUSD or USD"
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Trust Limit (0 = Remove)
                        </label>
                        <input
                          required
                          type="text"
                          value={tlLimit}
                          onChange={(e) => setTlLimit(e.target.value)}
                          placeholder="1000000"
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Issuer r-Address
                      </label>
                      <input
                        required
                        type="text"
                        value={tlIssuer}
                        onChange={(e) => setTlIssuer(e.target.value)}
                        placeholder="r..."
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono">
                      Enforces `tfSetNoRipple` by default and reserves 0.2 XRP while active.
                    </div>

                    <button
                      type="submit"
                      disabled={!isCustodial}
                      className="w-full py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
                    >
                      {isCustodial ? 'Preview & Sign TrustSet' : 'Requires Custodial Signing Wallet'}
                    </button>
                  </form>
                </div>
              )}

              {/* SUB-TAB 3: NATIVE DEX & AMM TRADING */}
              {subTab === 'dex-amm' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Native DEX Order Ticket */}
                  <form onSubmit={submitDexOrder} className="hud-panel rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
                        Native DEX Order (`OfferCreate`)
                      </h3>
                      <div className="flex rounded-lg overflow-hidden border border-slate-700 font-mono text-[11px]">
                        <button
                          type="button"
                          onClick={() => setDexSide('buy')}
                          className={`px-2.5 py-1 ${
                            dexSide === 'buy' ? 'bg-emerald-500/25 text-emerald-200' : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          BUY TOKEN
                        </button>
                        <button
                          type="button"
                          onClick={() => setDexSide('sell')}
                          className={`px-2.5 py-1 ${
                            dexSide === 'sell' ? 'bg-rose-500/25 text-rose-200' : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          SELL TOKEN
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Token Currency
                        </label>
                        <input
                          required
                          type="text"
                          value={dexTokenCurrency}
                          onChange={(e) => setDexTokenCurrency(e.target.value)}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Execution Mode
                        </label>
                        <select
                          value={dexOrderMode}
                          onChange={(e) => setDexOrderMode(e.target.value as typeof dexOrderMode)}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        >
                          <option value="limit">Limit (Standard)</option>
                          <option value="passive">Passive Maker</option>
                          <option value="ioc">Immediate-or-Cancel (Market)</option>
                          <option value="fok">Fill-or-Kill</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Token Issuer r-Address
                      </label>
                      <input
                        required
                        type="text"
                        value={dexTokenIssuer}
                        onChange={(e) => setDexTokenIssuer(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Token Quantity ({dexTokenCurrency || 'Token'})
                        </label>
                        <input
                          required
                          type="text"
                          value={dexTokenAmount}
                          onChange={(e) => setDexTokenAmount(e.target.value)}
                          placeholder="50"
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Total XRP {dexSide === 'buy' ? 'You Spend' : 'You Receive'}
                        </label>
                        <input
                          required
                          type="text"
                          value={dexXrpTotal}
                          onChange={(e) => setDexXrpTotal(e.target.value)}
                          placeholder="25"
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!isCustodial}
                      className="w-full py-2 rounded-xl bg-amber-500/20 border border-amber-400/50 text-xs font-mono font-semibold text-amber-200 hover:bg-amber-500/30 disabled:opacity-40"
                    >
                      {isCustodial
                        ? `Preview DEX ${dexSide.toUpperCase()} Order`
                        : 'Requires Custodial Signing Wallet'}
                    </button>
                  </form>

                  {/* AMM Liquidity Pool Actions */}
                  <form onSubmit={submitAmmForm} className="hud-panel rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-300">
                        XLS-30 AMM Pool Liquidity
                      </h3>
                      <div className="flex rounded-lg overflow-hidden border border-slate-700 font-mono text-[11px]">
                        <button
                          type="button"
                          onClick={() => setAmmAction('deposit')}
                          className={`px-2.5 py-1 ${
                            ammAction === 'deposit'
                              ? 'bg-violet-500/25 text-violet-200'
                              : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          DEPOSIT
                        </button>
                        <button
                          type="button"
                          onClick={() => setAmmAction('withdraw')}
                          className={`px-2.5 py-1 ${
                            ammAction === 'withdraw'
                              ? 'bg-cyan-500/25 text-cyan-200'
                              : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          WITHDRAW
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Pool Token
                        </label>
                        <input
                          required
                          type="text"
                          value={ammTokenCurrency}
                          onChange={(e) => setAmmTokenCurrency(e.target.value)}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Token Issuer
                        </label>
                        <input
                          required
                          type="text"
                          value={ammTokenIssuer}
                          onChange={(e) => setAmmTokenIssuer(e.target.value)}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                    </div>

                    {ammAction === 'deposit' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                            XRP Deposit Amount
                          </label>
                          <input
                            required
                            type="text"
                            value={ammXrpAmount}
                            onChange={(e) => setAmmXrpAmount(e.target.value)}
                            placeholder="10"
                            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                            Token Amount (Optional Dual)
                          </label>
                          <input
                            type="text"
                            value={ammTokenAmount}
                            onChange={(e) => setAmmTokenAmount(e.target.value)}
                            placeholder="Leave blank for single-sided"
                            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-mono text-slate-300">
                          <input
                            type="checkbox"
                            checked={ammWithdrawAll}
                            onChange={(e) => setAmmWithdrawAll(e.target.checked)}
                          />
                          Withdraw All LP Tokens (`tfWithdrawAll`)
                        </label>
                        {!ammWithdrawAll && (
                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                              Single-Asset XRP Withdraw Amount
                            </label>
                            <input
                              required
                              type="text"
                              value={ammXrpAmount}
                              onChange={(e) => setAmmXrpAmount(e.target.value)}
                              placeholder="5"
                              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={!isCustodial}
                      className="w-full py-2 rounded-xl bg-violet-500/20 border border-violet-400/50 text-xs font-mono font-semibold text-violet-200 hover:bg-violet-500/30 disabled:opacity-40"
                    >
                      {isCustodial ? `Preview AMM ${ammAction.toUpperCase()}` : 'Requires Custodial Signing Wallet'}
                    </button>
                  </form>
                </div>
              )}

              {/* SUB-TAB 4: ESCROWS, CHECKS & NFTS */}
              {subTab === 'escrow-nft' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Time-Locked XRP Escrow */}
                    <form onSubmit={submitEscrowCreate} className="hud-panel rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                          Time-Locked XRP Escrow (`EscrowCreate`)
                        </h3>
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Destination (blank = lock to self)
                        </label>
                        <input
                          type="text"
                          value={escrowDest}
                          onChange={(e) => setEscrowDest(e.target.value)}
                          placeholder={activeAccount.address}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                            XRP Amount
                          </label>
                          <input
                            required
                            type="text"
                            value={escrowXrp}
                            onChange={(e) => setEscrowXrp(e.target.value)}
                            placeholder="25"
                            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                            Unlock In (Mins)
                          </label>
                          <input
                            required
                            type="number"
                            min="1"
                            value={escrowMinutes}
                            onChange={(e) => setEscrowMinutes(e.target.value)}
                            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                            Expire +Hours
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={escrowCancelHours}
                            onChange={(e) => setEscrowCancelHours(e.target.value)}
                            placeholder="Optional"
                            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={!isCustodial}
                        className="w-full py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono font-semibold text-cyan-200 disabled:opacity-40"
                      >
                        Preview Time-Locked Escrow
                      </button>

                      {(walletPortfolio?.escrows.length ?? 0) > 0 && (
                        <div className="pt-2 border-t border-slate-800 space-y-1.5">
                          <div className="text-[10px] font-mono uppercase text-slate-400">
                            Active Escrows ({walletPortfolio!.escrows.length})
                          </div>
                          {walletPortfolio!.escrows.map((esc) => (
                            <div
                              key={esc.index}
                              className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800 font-mono text-xs"
                            >
                              <div>
                                <span className="text-cyan-300 font-bold">{esc.amountXrp} XRP</span>
                                {esc.finishAfterMs && (
                                  <span className="text-[10px] text-slate-400 ml-2">
                                    Unlocks {new Date(esc.finishAfterMs).toLocaleTimeString()}
                                  </span>
                                )}
                              </div>
                              {isCustodial && esc.offerSequence !== undefined && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void openTxConfirmModal(activeAccount.id, {
                                      kind: 'EscrowFinish',
                                      account: activeAccount.address,
                                      owner: esc.account,
                                      offerSequence: esc.offerSequence!,
                                    })
                                  }
                                  className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-[10px] text-emerald-200"
                                >
                                  Finish #{esc.offerSequence}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </form>

                    {/* Deferred XRP Checks */}
                    <form onSubmit={submitCheckCreate} className="hud-panel rounded-xl p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
                        Deferred XRPL Checks (`CheckCreate` / `CheckCash`)
                      </h3>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                            Recipient r-Address
                          </label>
                          <input
                            required
                            type="text"
                            value={checkDest}
                            onChange={(e) => setCheckDest(e.target.value)}
                            placeholder="r..."
                            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                            Max XRP
                          </label>
                          <input
                            required
                            type="text"
                            value={checkXrp}
                            onChange={(e) => setCheckXrp(e.target.value)}
                            placeholder="15"
                            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={!isCustodial}
                        className="w-full py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono font-semibold text-emerald-200 disabled:opacity-40"
                      >
                        Preview CheckCreate
                      </button>

                      {(walletPortfolio?.checks.length ?? 0) > 0 && (
                        <div className="pt-2 border-t border-slate-800 space-y-1.5">
                          <div className="text-[10px] font-mono uppercase text-slate-400">
                            Pending Checks ({walletPortfolio!.checks.length})
                          </div>
                          {walletPortfolio!.checks.map((chk) => {
                            const isRecipient = chk.destination === activeAccount.address;
                            return (
                              <div
                                key={chk.index}
                                className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800 font-mono text-xs"
                              >
                                <div>
                                  <span className="text-emerald-300 font-bold">{chk.sendMaxDisplay}</span>
                                  <span className="text-[10px] text-slate-500 ml-2">
                                    {isRecipient
                                      ? `From ${shortenAddress(chk.account, 5, 4)}`
                                      : `To ${shortenAddress(chk.destination, 5, 4)}`}
                                  </span>
                                </div>
                                {isCustodial && (
                                  <div className="flex gap-1">
                                    {isRecipient && (
                                      <button
                                        type="button"
                                        onClick={() => submitCashCheck(chk)}
                                        className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-[10px] text-emerald-200"
                                      >
                                        Cash
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void openTxConfirmModal(activeAccount.id, {
                                          kind: 'CheckCancel',
                                          account: activeAccount.address,
                                          checkId: chk.index,
                                        })
                                      }
                                      className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-400/40 text-[10px] text-rose-200"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </form>
                  </div>

                  {/* XLS-20 NFToken Studio & Gallery */}
                  <div className="hud-panel rounded-xl p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-fuchsia-300">
                        XLS-20 NFToken Studio &amp; Owned Gallery ({walletPortfolio?.nfts.length ?? 0})
                      </h3>
                    </div>

                    <form onSubmit={submitNftMint} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                      <div className="md:col-span-6">
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Metadata URI (ipfs:// or https://)
                        </label>
                        <input
                          required
                          type="text"
                          value={nftUri}
                          onChange={(e) => setNftUri(e.target.value)}
                          placeholder="ipfs://bafy..."
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Taxon
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={nftTaxon}
                          onChange={(e) => setNftTaxon(e.target.value)}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Royalty %
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="0.1"
                          value={nftRoyaltyPct}
                          onChange={(e) => setNftRoyaltyPct(e.target.value)}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <button
                          type="submit"
                          disabled={!isCustodial}
                          className="w-full py-1.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/50 text-xs font-mono font-semibold text-fuchsia-200 disabled:opacity-40"
                        >
                          Mint NFT
                        </button>
                      </div>
                    </form>

                    {(walletPortfolio?.nfts.length ?? 0) > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {walletPortfolio!.nfts.map((nft) => (
                          <div
                            key={nft.nftokenId}
                            className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-fuchsia-300 font-bold">Serial #{nft.serial}</span>
                              <span className="text-[10px] text-slate-500">Taxon {nft.taxon}</span>
                            </div>
                            <div className="text-[11px] text-slate-300 truncate">
                              {nft.uriDecoded ?? shortenAddress(nft.nftokenId, 10, 8)}
                            </div>

                            {isCustodial && (
                              <div className="flex gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveNftOfferId(
                                      activeNftOfferId === nft.nftokenId ? null : nft.nftokenId
                                    )
                                  }
                                  className="flex-1 py-1 rounded bg-cyan-500/15 border border-cyan-400/30 text-[10px] text-cyan-200"
                                >
                                  Sell / Transfer
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void openTxConfirmModal(activeAccount.id, {
                                      kind: 'NFTokenBurn',
                                      account: activeAccount.address,
                                      nftokenId: nft.nftokenId,
                                    })
                                  }
                                  className="px-2 py-1 rounded bg-rose-500/15 border border-rose-400/30 text-[10px] text-rose-200"
                                >
                                  Burn
                                </button>
                              </div>
                            )}

                            {activeNftOfferId === nft.nftokenId && (
                              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                                <input
                                  type="text"
                                  value={nftOfferPriceXrp}
                                  onChange={(e) => setNftOfferPriceXrp(e.target.value)}
                                  placeholder="Price XRP (0 = free transfer)"
                                  className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-white"
                                />
                                <input
                                  type="text"
                                  value={nftTransferDest}
                                  onChange={(e) => setNftTransferDest(e.target.value)}
                                  placeholder="Optional buyer/recipient r-address"
                                  className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void openTxConfirmModal(activeAccount.id, {
                                      kind: 'NFTokenCreateOffer',
                                      account: activeAccount.address,
                                      nftokenId: nft.nftokenId,
                                      amountXrp: nftOfferPriceXrp,
                                      destination: nftTransferDest || undefined,
                                      isSellOffer: true,
                                    })
                                  }
                                  className="w-full py-1 rounded bg-emerald-500/20 border border-emerald-400/40 text-[10px] text-emerald-200"
                                >
                                  Sign NFT Sell Offer
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Onboarding & Receive QR Modals */}
      {modalMode && (
        <div
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setModalMode(null)}
        >
          <div
            className="hud-panel rounded-2xl max-w-md w-full p-5 border border-cyan-400/40 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {modalMode === 'create' && (
              <form onSubmit={(e) => void handleCreateWallet(e)} className="space-y-3">
                <h3 className="text-sm font-bold text-white">Create Encrypted XRPL Wallet</h3>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Label</label>
                  <input
                    autoFocus
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Primary Treasury / Dev Wallet"
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                    Key Algorithm
                  </label>
                  <select
                    value={newAlgo}
                    onChange={(e) => setNewAlgo(e.target.value as WalletAlgorithm)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                  >
                    <option value="ed25519">ed25519 (Recommended XRPL Modern Default)</option>
                    <option value="ecdsa-secp256k1">ecdsa-secp256k1</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalMode(null)}
                    className="px-3 py-1.5 text-xs text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-emerald-500/25 border border-emerald-400 text-xs font-mono text-emerald-100"
                  >
                    Generate &amp; Encrypt
                  </button>
                </div>
              </form>
            )}

            {modalMode === 'import' && (
              <form onSubmit={(e) => void handleImportSeed(e)} className="space-y-3">
                <h3 className="text-sm font-bold text-white">Import XRPL Family Seed</h3>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Wallet Label"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
                <input
                  required
                  type="password"
                  value={importSeedInput}
                  onChange={(e) => setImportSeedInput(e.target.value)}
                  placeholder="sEd... or s..."
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
                <p className="text-[11px] text-slate-400">
                  Your seed is sent once over isolated IPC and encrypted directly into your local vault.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalMode(null)}
                    className="px-3 py-1.5 text-xs text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-cyan-500/25 border border-cyan-400 text-xs font-mono text-cyan-100"
                  >
                    Import &amp; Encrypt
                  </button>
                </div>
              </form>
            )}

            {modalMode === 'watch' && (
              <form onSubmit={(e) => void handleAddWatch(e)} className="space-y-3">
                <h3 className="text-sm font-bold text-white">Add Watch-Only XRPL Address</h3>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Cold Storage / Cold Vault"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
                <input
                  required
                  type="text"
                  value={watchAddrInput}
                  onChange={(e) => setWatchAddrInput(e.target.value)}
                  placeholder="r..."
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalMode(null)}
                    className="px-3 py-1.5 text-xs text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-cyan-500/25 border border-cyan-400 text-xs font-mono text-cyan-100"
                  >
                    Track Address
                  </button>
                </div>
              </form>
            )}

            {modalMode === 'qr' && activeAccount && (
              <div className="text-center space-y-3">
                <h3 className="text-sm font-bold text-white">Receive XRP &amp; Tokens</h3>
                {walletPortfolio?.qrSvg && (
                  <div
                    className="w-48 h-48 mx-auto rounded-xl overflow-hidden border border-cyan-400/40 p-2 bg-[#061022]"
                    dangerouslySetInnerHTML={{ __html: walletPortfolio.qrSvg }}
                  />
                )}
                <div className="font-mono text-xs text-cyan-300 break-all px-2">
                  {activeAccount.address}
                </div>
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 text-xs font-mono text-white"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mandatory One-Time Secret Seed Backup Modal */}
      {oneTimeBackup && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="hud-panel rounded-2xl max-w-md w-full p-5 border border-emerald-400/50 space-y-4">
            <h3 className="text-sm font-bold text-emerald-300">
              One-Time Secret Seed Backup (Write Offline Now)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              For security, XRPL Command Center **never** exposes your secret seed again after closing this
              window. Write it down offline in a safe place now:
            </p>
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-xs space-y-1.5">
              <div className="text-[10px] uppercase text-slate-500">Public Address</div>
              <div className="text-cyan-300 break-all">{oneTimeBackup.address}</div>
              <div className="text-[10px] uppercase text-slate-500 pt-2">Secret Family Seed</div>
              <div className="text-emerald-300 font-bold break-all select-all">{oneTimeBackup.seed}</div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={(e) => setBackupConfirmed(e.target.checked)}
              />
              I have backed up my secret seed offline.
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!backupConfirmed}
                onClick={() => setOneTimeBackup(null)}
                className="px-4 py-1.5 rounded-lg bg-emerald-500/25 border border-emerald-400 text-xs font-mono font-semibold text-emerald-100 disabled:opacity-40"
              >
                Wipe From Screen &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
