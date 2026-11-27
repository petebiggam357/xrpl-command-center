import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BookUser,
  Calendar,
  Check,
  Clock,
  Copy,
  Cpu,
  Download,
  Droplets,
  Eye,
  FileText,
  KeyRound,
  Lock,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Repeat,
  Route,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  Users,
  Wallet as WalletIcon,
  Wand2,
} from 'lucide-react';
import { openPrintableRecoverySheet } from '../services/hardwareWallets';
import { getXrplBridge } from '../services/xrplBridge';
import {
  checkDestinationTagSafety,
  computeReserveBreakdown,
  decodeXrplMemos,
  formatUsd,
  isXAddress,
  resolveSafeMediaUri,
} from '../shared/betaUtils';
import { assessQuantumExposure, VAULT_PQC_POSTURE } from '../shared/quantumUtils';
import type { PathFindQuote, WalletAlgorithm, WalletCheckEntry, WalletGroupTag } from '../shared/types';
import { computeGroupTotals, WALLET_GROUP_META } from '../shared/v022Utils';
import {
  buildAccountSecurityAuditMarkdown,
  buildEscrowVestingSchedule,
} from '../shared/v023Utils';
import {
  validatePaymentChannelCreate,
  validateRegularKeyRotation,
} from '../shared/v024Utils';
import { dropsToXrpString, shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';
import { AddressBookPanel } from './AddressBookPanel';
import { DexDepthCanvas } from './DexDepthCanvas';
import { HardwareWalletModal } from './HardwareWalletModal';

type WalletSubTab = 'portfolio' | 'send-trust' | 'contacts' | 'dex-amm' | 'escrow-nft' | 'multisig';

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
  const walletGroups = useCommandStore((s) => s.walletGroups);
  const setWalletGroup = useCommandStore((s) => s.setWalletGroup);
  const walletPrefill = useCommandStore((s) => s.walletPrefill);
  const clearWalletPrefill = useCommandStore((s) => s.clearWalletPrefill);
  const streamStatus = useCommandStore((s) => s.streamStatus);
  const refreshVaultStatus = useCommandStore((s) => s.refreshVaultStatus);
  const selectWallet = useCommandStore((s) => s.selectWallet);
  const refreshWalletPortfolio = useCommandStore((s) => s.refreshWalletPortfolio);
  const openTxConfirmModal = useCommandStore((s) => s.openTxConfirmModal);
  const connectNetwork = useCommandStore((s) => s.connectNetwork);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);
  const contacts = useCommandStore((s) => s.contacts);
  const marketPrice = useCommandStore((s) => s.marketPrice);
  const walletBalancesMap = useCommandStore((s) => s.walletBalancesMap);
  const refreshAllWalletBalances = useCommandStore((s) => s.refreshAllWalletBalances);

  const [subTab, setSubTab] = useState<WalletSubTab>('portfolio');
  const [txHistorySearch, setTxHistorySearch] = useState('');
  const [hardwareModalOpen, setHardwareModalOpen] = useState(false);
  const [syncingAllBalances, setSyncingAllBalances] = useState(false);

  // Vault & Onboarding
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

  // 1) Payment & TrustSet
  const [payDest, setPayDest] = useState('');
  const [payAssetKey, setPayAssetKey] = useState('XRP');
  const [payAmount, setPayAmount] = useState('');
  const [payDestTag, setPayDestTag] = useState('');
  const [payMemo, setPayMemo] = useState('');

  const [tlCurrency, setTlCurrency] = useState('RLUSD');
  const [tlIssuer, setTlIssuer] = useState('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De');
  const [tlLimit, setTlLimit] = useState('1000000');

  // 2) Pro DEX, Smart Pathfinding & AMM
  const [swapTargetCurrency, setSwapTargetCurrency] = useState('RLUSD');
  const [swapTargetIssuer, setSwapTargetIssuer] = useState('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De');
  const [swapTargetAmount, setSwapTargetAmount] = useState('25');
  const [swapSlippagePct, setSwapSlippagePct] = useState('1.0');
  const [pathQuote, setPathQuote] = useState<PathFindQuote | null>(null);
  const [pathFinding, setPathFinding] = useState(false);

  const [dexSide, setDexSide] = useState<'buy' | 'sell'>('buy');
  const [dexTokenCurrency, setDexTokenCurrency] = useState('RLUSD');
  const [dexTokenIssuer, setDexTokenIssuer] = useState('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De');
  const [dexTokenAmount, setDexTokenAmount] = useState('');
  const [dexXrpTotal, setDexXrpTotal] = useState('');
  const [dexOrderMode, setDexOrderMode] = useState<'limit' | 'passive' | 'ioc' | 'fok'>('limit');

  const [ammAction, setAmmAction] = useState<'deposit' | 'withdraw' | 'create' | 'vote'>('deposit');
  const [ammTokenCurrency, setAmmTokenCurrency] = useState('RLUSD');
  const [ammTokenIssuer, setAmmTokenIssuer] = useState('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De');
  const [ammXrpAmount, setAmmXrpAmount] = useState('');
  const [ammTokenAmount, setAmmTokenAmount] = useState('');
  const [ammFeeBpsInput, setAmmFeeBpsInput] = useState('30');
  const [ammWithdrawAll, setAmmWithdrawAll] = useState(false);

  // 3) Escrow, Check & NFT
  const [escrowDest, setEscrowDest] = useState('');
  const [escrowXrp, setEscrowXrp] = useState('');
  const [escrowMinutes, setEscrowMinutes] = useState('60');
  const [escrowCancelHours, setEscrowCancelHours] = useState('');

  // Track 3: Multi-Tranche Escrow Vesting Builder
  const [vestDest, setVestDest] = useState('');
  const [vestTotalXrp, setVestTotalXrp] = useState('1200');
  const [vestTranches, setVestTranches] = useState('6');
  const [vestIntervalDays, setVestIntervalDays] = useState('30');
  const [vestStartDate, setVestStartDate] = useState(() => {
    const nextMonth = new Date(Date.now() + 30 * 86_400_000);
    return nextMonth.toISOString().slice(0, 10);
  });
  const [vestCancelBufferDays, setVestCancelBufferDays] = useState('90');

  // Track 3 (v0.2.4-beta): Payment Channels Studio & RegularKey Rotation
  const [chDest, setChDest] = useState('');
  const [chAmountXrp, setChAmountXrp] = useState('25');
  const [chSettleDelaySec, setChSettleDelaySec] = useState('3600');
  const [chPublicKeyHex, setChPublicKeyHex] = useState('');
  const [chList, setChList] = useState<
    Array<{ channelId: string; destination: string; amountXrp: string; balanceXrp: string; settleDelay: number }>
  >([]);
  const [chLoading, setChLoading] = useState(false);
  const [chTopUpAmt, setChTopUpAmt] = useState('10');
  const [regularKeyInput, setRegularKeyInput] = useState('');

  const [checkDest, setCheckDest] = useState('');
  const [checkXrp, setCheckXrp] = useState('');

  const [nftUri, setNftUri] = useState('ipfs://');
  const [nftTaxon, setNftTaxon] = useState('0');
  const [nftRoyaltyPct, setNftRoyaltyPct] = useState('5');
  const [nftTransferDest, setNftTransferDest] = useState('');
  const [nftOfferPriceXrp, setNftOfferPriceXrp] = useState('0');
  const [activeNftOfferId, setActiveNftOfferId] = useState<string | null>(null);

  // 4) Multi-Sig & Air-Gapped Coordinator
  const [msQuorum, setMsQuorum] = useState('2');
  const [msSigner1, setMsSigner1] = useState('');
  const [msWeight1, setMsWeight1] = useState('1');
  const [msSigner2, setMsSigner2] = useState('');
  const [msWeight2, setMsWeight2] = useState('1');
  const [msUnsignedJson, setMsUnsignedJson] = useState(
    '{\n  "TransactionType": "Payment",\n  "Account": "",\n  "Destination": "",\n  "Amount": "1000000",\n  "Sequence": 1,\n  "Fee": "36"\n}'
  );
  const [msPartialBlobsText, setMsPartialBlobsText] = useState('');
  const [msStatusBanner, setMsStatusBanner] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void refreshVaultStatus();
  }, [refreshVaultStatus]);

  // v0.2.7-beta: Apply smart cross-module handoffs from Tokens & DEX or Inspector Drawer
  useEffect(() => {
    if (!walletPrefill) return;
    if (walletPrefill.subTab) setSubTab(walletPrefill.subTab);
    if (walletPrefill.sendDest) setPayDest(walletPrefill.sendDest);
    if (walletPrefill.tokenCurrency) {
      setDexTokenCurrency(walletPrefill.tokenCurrency);
      setAmmTokenCurrency(walletPrefill.tokenCurrency);
    }
    if (walletPrefill.tokenIssuer) {
      setDexTokenIssuer(walletPrefill.tokenIssuer);
      setAmmTokenIssuer(walletPrefill.tokenIssuer);
    }
    clearWalletPrefill();
  }, [walletPrefill, clearWalletPrefill]);

  const activeAccount = vaultStatus.accounts.find((a) => a.id === selectedWalletId) ?? null;
  const isCustodial = activeAccount?.kind === 'custodial';

  const [activeGroupFilter, setActiveGroupFilter] = useState<'all' | WalletGroupTag>('all');
  const [showQuantumPanel, setShowQuantumPanel] = useState(false);

  const quantumReport = useMemo(
    () => (walletPortfolio ? assessQuantumExposure(walletPortfolio) : null),
    [walletPortfolio]
  );

  const combinedVaultXrp = useMemo(() => {
    let sum = 0;
    for (const acct of vaultStatus.accounts) {
      sum += walletBalancesMap[acct.address] ?? 0;
    }
    return sum;
  }, [vaultStatus.accounts, walletBalancesMap]);

  const groupTotals = useMemo(
    () =>
      computeGroupTotals(
        vaultStatus.accounts,
        walletBalancesMap,
        walletGroups,
        marketPrice.xrpUsd
      ),
    [vaultStatus.accounts, walletBalancesMap, walletGroups, marketPrice.xrpUsd]
  );

  const filteredAccounts = useMemo(() => {
    if (activeGroupFilter === 'all') return vaultStatus.accounts;
    return vaultStatus.accounts.filter(
      (acct) => (walletGroups[acct.id] ?? 'general') === activeGroupFilter
    );
  }, [vaultStatus.accounts, walletGroups, activeGroupFilter]);

  const handleSyncAllWalletBalances = async () => {
    setSyncingAllBalances(true);
    try {
      await refreshAllWalletBalances();
    } finally {
      setSyncingAllBalances(false);
    }
  };

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

  const handleFindSwapPath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    setPathFinding(true);
    const destAsset =
      swapTargetCurrency.trim().toUpperCase() === 'XRP'
        ? { currency: 'XRP', value: swapTargetAmount.trim() }
        : {
            currency: swapTargetCurrency.trim(),
            issuer: swapTargetIssuer.trim(),
            value: swapTargetAmount.trim(),
          };
    const quote = await getXrplBridge().dexFindBestPath({
      sourceAccount: activeAccount.address,
      destinationAccount: activeAccount.address,
      destinationAsset: destAsset,
      slippagePct: Number(swapSlippagePct) || 1.0,
    });
    setPathQuote(quote);
    setPathFinding(false);
  };

  const handleExecutePathSwap = () => {
    if (!activeAccount || !pathQuote || !pathQuote.ok) return;
    void openTxConfirmModal(activeAccount.id, {
      kind: 'Payment',
      account: activeAccount.address,
      destination: activeAccount.address,
      asset: pathQuote.destinationAmountSpec,
      sendMax: pathQuote.sendMaxSpec,
      deliverMin: pathQuote.deliverMinSpec,
      paths: pathQuote.pathsComputed,
    });
  };

  const handleExportVaultBackup = async () => {
    setVaultBannerMsg(null);
    const res = await getXrplBridge().walletExportBackup();
    if (res.cancelled) return;
    setVaultBannerMsg({
      ok: res.ok,
      text: res.ok
        ? `${res.message ?? 'Encrypted backup exported'} (${res.filePath ?? ''})`
        : res.error ?? 'Backup export failed.',
    });
  };

  const handleImportVaultBackup = async () => {
    setVaultBannerMsg(null);
    const res = await getXrplBridge().walletImportBackup();
    if (res.cancelled) return;
    if (res.ok) {
      await refreshVaultStatus();
    }
    setVaultBannerMsg({
      ok: res.ok,
      text: res.ok
        ? res.message ?? 'Encrypted vault restored. Unlock with your backup master passphrase.'
        : res.error ?? 'Backup restore failed.',
    });
  };

  const handleDecodePayXAddress = async () => {
    if (!isXAddress(payDest)) return;
    const dec = await getXrplBridge().decodeXAddress(payDest);
    if (dec.ok && dec.classicAddress) {
      setPayDest(dec.classicAddress);
      if (dec.tag !== null && dec.tag !== undefined) {
        setPayDestTag(String(dec.tag));
      }
      setVaultBannerMsg({
        ok: true,
        text: `Decoded X-Address → ${dec.classicAddress}${dec.tag !== null && dec.tag !== undefined ? ` (Tag ${dec.tag})` : ''}`,
      });
    } else {
      setVaultBannerMsg({ ok: false, text: dec.error ?? 'Invalid X-Address' });
    }
  };

  const destTagGuard = useMemo(
    () => checkDestinationTagSafety(payDest, payDestTag, contacts),
    [payDest, payDestTag, contacts]
  );

  const reserveBreakdown = useMemo(
    () =>
      computeReserveBreakdown(
        walletPortfolio?.totalXrp ?? 0,
        walletPortfolio?.baseReserveXrp ?? 1,
        walletPortfolio?.ownerCount ?? 0,
        0.2
      ),
    [walletPortfolio]
  );

  const vestingPlan = useMemo(() => {
    if (!activeAccount) return null;
    const startMs = Date.parse(`${vestStartDate}T12:00:00Z`);
    return buildEscrowVestingSchedule({
      account: activeAccount.address,
      destination: vestDest.trim() || activeAccount.address,
      totalXrp: Number(vestTotalXrp),
      trancheCount: Number(vestTranches),
      intervalDays: Number(vestIntervalDays),
      startUnixMs: Number.isFinite(startMs) ? startMs : Date.now() + 30 * 86_400_000,
      cancelBufferDays: Number(vestCancelBufferDays) > 0 ? Number(vestCancelBufferDays) : undefined,
    });
  }, [activeAccount, vestDest, vestTotalXrp, vestTranches, vestIntervalDays, vestStartDate, vestCancelBufferDays]);

  const handleExportSecurityAudit = async () => {
    if (!activeAccount || !walletPortfolio) {
      setVaultBannerMsg({ ok: false, text: 'Sync the active wallet first before exporting a security audit.' });
      return;
    }
    const markdown = buildAccountSecurityAuditMarkdown(walletPortfolio, {
      label: activeAccount.label,
      networkLabel: `${streamStatus.networkId.toUpperCase()} (${streamStatus.endpoint})`,
      xrpUsd: marketPrice.xrpUsd,
    });
    const defaultFilename = `xrpl-security-audit-${activeAccount.address.slice(0, 10)}-${new Date().toISOString().slice(0, 10)}.md`;
    const res = await getXrplBridge().walletExportSecurityAudit({ defaultFilename, markdown });
    if (res.cancelled) return;
    setVaultBannerMsg({
      ok: res.ok,
      text: res.ok
        ? `Security & Reserve Audit exported → ${res.filePath}`
        : res.error ?? 'Failed to export security audit.',
    });
  };

  const handleLoadPaymentChannels = async () => {
    if (!activeAccount) return;
    setChLoading(true);
    try {
      const res = await getXrplBridge().rpcRequest('account_channels', {
        account: activeAccount.address,
        ledger_index: 'validated',
      });
      if (res.status === 'error') {
        setVaultBannerMsg({
          ok: false,
          text: String(res.error_message ?? res.error ?? 'Unable to query account_channels'),
        });
        return;
      }
      const result = (res.result ?? res) as Record<string, unknown>;
      const rows = Array.isArray(result.channels) ? result.channels : [];
      setChList(
        rows.map((r) => {
          const obj = (r ?? {}) as Record<string, unknown>;
          return {
            channelId: String(obj.channel_id ?? ''),
            destination: String(obj.destination_account ?? ''),
            amountXrp: dropsToXrpString(String(obj.amount ?? '0'), 4),
            balanceXrp: dropsToXrpString(String(obj.balance ?? '0'), 4),
            settleDelay: Number(obj.settle_delay ?? 0),
          };
        })
      );
    } catch (err) {
      setVaultBannerMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Unable to query account_channels',
      });
    } finally {
      setChLoading(false);
    }
  };

  const submitPaymentChannelCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    const pub = chPublicKeyHex.trim();
    const check = validatePaymentChannelCreate({
      destination: chDest,
      amountXrp: chAmountXrp,
      settleDelaySec: Number(chSettleDelaySec),
      publicKeyHex: pub,
    });
    if (!check.ok) {
      setVaultBannerMsg({ ok: false, text: check.error ?? 'Invalid payment channel parameters' });
      return;
    }
    void openTxConfirmModal(activeAccount.id, {
      kind: 'PaymentChannelCreate',
      account: activeAccount.address,
      destination: chDest.trim(),
      amountXrp: chAmountXrp.trim(),
      settleDelaySec: Number(chSettleDelaySec),
      publicKeyHex: pub,
    });
  };

  const regularKeyCheck = useMemo(
    () =>
      activeAccount
        ? validateRegularKeyRotation({
            account: activeAccount.address,
            regularKey: regularKeyInput,
          })
        : null,
    [activeAccount, regularKeyInput]
  );

  const filteredRecentTxs = useMemo(() => {
    const list = walletPortfolio?.recentTransactions ?? [];
    const q = txHistorySearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((tx) => {
      const memos = decodeXrplMemos(tx.raw).map((m) => `${m.type ?? ''} ${m.data ?? ''}`).join(' ').toLowerCase();
      return (
        tx.txType.toLowerCase().includes(q) ||
        tx.amountDisplay.toLowerCase().includes(q) ||
        tx.account.toLowerCase().includes(q) ||
        (tx.destination ?? '').toLowerCase().includes(q) ||
        tx.hash.toLowerCase().includes(q) ||
        memos.includes(q)
      );
    });
  }, [walletPortfolio, txHistorySearch]);

  const submitPaymentForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    let resolvedDest = payDest.trim();
    let parsedTag = payDestTag.trim() ? Number(payDestTag.trim()) : undefined;

    if (isXAddress(resolvedDest)) {
      const dec = await getXrplBridge().decodeXAddress(resolvedDest);
      if (!dec.ok || !dec.classicAddress) {
        setVaultBannerMsg({ ok: false, text: dec.error ?? 'Invalid X-Address destination.' });
        return;
      }
      resolvedDest = dec.classicAddress;
      if (dec.tag !== null && dec.tag !== undefined) {
        parsedTag = dec.tag;
      }
    }

    let asset = { currency: 'XRP', value: payAmount.trim() } as {
      currency: string;
      issuer?: string;
      value: string;
    };
    if (payAssetKey !== 'XRP') {
      const [curRaw, issuer] = payAssetKey.split(':');
      asset = { currency: curRaw, issuer, value: payAmount.trim() };
    }
    void openTxConfirmModal(activeAccount.id, {
      kind: 'Payment',
      account: activeAccount.address,
      destination: resolvedDest,
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

    if (ammAction === 'create') {
      void openTxConfirmModal(activeAccount.id, {
        kind: 'AMMCreate',
        account: activeAccount.address,
        amount1: { currency: 'XRP', value: ammXrpAmount.trim() },
        amount2: {
          currency: ammTokenCurrency.trim(),
          issuer: ammTokenIssuer.trim(),
          value: ammTokenAmount.trim(),
        },
        tradingFeeBps: Number(ammFeeBpsInput) || 30,
      });
    } else if (ammAction === 'vote') {
      void openTxConfirmModal(activeAccount.id, {
        kind: 'AMMVote',
        account: activeAccount.address,
        asset1,
        asset2,
        tradingFeeBps: Number(ammFeeBpsInput) || 30,
      });
    } else if (ammAction === 'deposit') {
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

  const handlePartialMultisigSign = async () => {
    if (!activeAccount) return;
    setMsStatusBanner(null);
    try {
      const parsed = JSON.parse(msUnsignedJson) as Record<string, unknown>;
      const res = await getXrplBridge().walletSignMultisigPartial(activeAccount.id, parsed);
      if (!res.ok || !res.txBlob) {
        setMsStatusBanner({ ok: false, text: res.error ?? 'Partial signature failed' });
        return;
      }
      setMsPartialBlobsText((prev) => (prev.trim() ? `${prev.trim()}\n${res.txBlob}` : res.txBlob!));
      setMsStatusBanner({
        ok: true,
        text: `Appended partial multi-signature from ${res.signerAddress}`,
      });
    } catch {
      setMsStatusBanner({ ok: false, text: 'Invalid JSON in unsigned tx_json editor' });
    }
  };

  const handleCombineMultisig = async () => {
    setMsStatusBanner(null);
    const blobs = msPartialBlobsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await getXrplBridge().walletCombineAndSubmitMultisig(blobs);
    setMsStatusBanner({
      ok: res.ok,
      text: res.ok
        ? `Multisigned tx broadcast (${res.engineResult ?? 'submitted'}): ${res.hash ?? ''}`
        : res.error ?? 'Combine failed',
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
                  Encrypted XRPL Wallet Vault, Hardware USB &amp; Pro DeFi Studio
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
                {vaultStatus.backend === 'rust-sidecar' ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-[10px] font-mono text-emerald-200">
                    RUST SIDECAR • Argon2id + Zeroize {vaultStatus.sidecarPid ? `(PID ${vaultStatus.sidecarPid})` : ''}
                  </span>
                ) : (
                  vaultStatus.osKeychainAvailable && (
                    <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/30 text-[10px] font-mono text-cyan-300">
                      OS Keyring Active
                    </span>
                  )
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {vaultStatus.backend === 'rust-sidecar'
                  ? 'Process-isolated Rust vault (Argon2id + AES-256-GCM + deterministic RAM zeroing), Ledger USB, Air-Gapped QR & Multi-Sig'
                  : 'Encrypted local vault, Ledger USB WebHID, Air-Gapped QR, Multi-Sig & Smart Pathfinding'}
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
              onClick={() => setHardwareModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/15 border border-violet-400/40 text-xs font-mono text-violet-200 hover:bg-violet-500/25"
            >
              <Cpu className="w-3.5 h-3.5" />
              Cold / Hardware
            </button>

            <button
              type="button"
              onClick={() => setModalMode('watch')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 hover:border-cyan-400/50"
            >
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              Watch Address
            </button>

            <button
              type="button"
              onClick={() => void handleExportVaultBackup()}
              title="Export encrypted .xrplvault backup (Argon2id + AES-256-GCM ciphertext only)"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 hover:border-emerald-400/50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Backup
            </button>

            <button
              type="button"
              onClick={() => void handleImportVaultBackup()}
              title="Restore an encrypted .xrplvault backup file"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 hover:border-amber-400/50"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              Restore
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

      {/* Main Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-3 hud-panel rounded-xl p-3.5 space-y-2.5 h-fit">
          <div className="flex items-center justify-between px-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">
              Tracked Wallets ({vaultStatus.accounts.length})
            </div>
            {vaultStatus.accounts.length > 0 && (
              <button
                type="button"
                disabled={syncingAllBalances}
                onClick={() => void handleSyncAllWalletBalances()}
                className="text-[10px] font-mono text-cyan-300 hover:text-cyan-200 flex items-center gap-1 disabled:opacity-50"
                title="Refresh combined XRP net worth across all wallets"
              >
                <RefreshCw className={`w-3 h-3 ${syncingAllBalances ? 'animate-spin' : ''}`} />
                Sync All
              </button>
            )}
          </div>

          {vaultStatus.accounts.length > 0 && (
            <div className="rounded-xl bg-slate-950/90 border border-cyan-400/25 px-3 py-2 font-mono">
              <div className="text-[9px] uppercase tracking-wider text-slate-500">
                Combined Portfolio Net Worth
              </div>
              <div className="text-sm font-bold text-white tabular-nums mt-0.5">
                {combinedVaultXrp.toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP
              </div>
              {marketPrice.xrpUsd !== null && (
                <div className="text-[10px] text-emerald-300 tabular-nums">
                  ≈ {formatUsd(combinedVaultXrp * marketPrice.xrpUsd)} USD
                </div>
              )}
            </div>
          )}

          {vaultStatus.accounts.length > 0 && groupTotals.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setActiveGroupFilter('all')}
                  className={`px-2 py-0.5 rounded-md border text-[10px] font-mono ${
                    activeGroupFilter === 'all'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({vaultStatus.accounts.length})
                </button>
                {groupTotals.map((gt) => (
                  <button
                    key={gt.group}
                    type="button"
                    onClick={() => setActiveGroupFilter(gt.group)}
                    className={`px-2 py-0.5 rounded-md border text-[10px] font-mono ${
                      activeGroupFilter === gt.group
                        ? WALLET_GROUP_META[gt.group].badgeClass
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                    title={
                      gt.totalUsd !== null
                        ? `${gt.totalXrp.toLocaleString()} XRP (≈ ${formatUsd(gt.totalUsd)})`
                        : `${gt.totalXrp.toLocaleString()} XRP`
                    }
                  >
                    {WALLET_GROUP_META[gt.group].label} ({gt.count}) • {gt.totalXrp.toLocaleString(undefined, { maximumFractionDigits: 1 })} XRP
                    {gt.totalUsd !== null ? ` · ${formatUsd(gt.totalUsd)}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {vaultStatus.accounts.length === 0 ? (
            <div className="py-8 px-2 text-center text-xs font-mono text-slate-500">
              Initialize/unlock your vault, connect a Ledger USB device, or add a Watch Address.
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredAccounts.map((acct) => {
                const selected = acct.id === selectedWalletId;
                const grp: WalletGroupTag = walletGroups[acct.id] ?? 'general';
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
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {acct.kind === 'custodial' ? (
                          <KeyRound className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : acct.kind === 'hardware-ledger' ? (
                          <Cpu className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-white truncate">{acct.label}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {shortenAddress(acct.address, 8, 6)}
                      </div>
                      <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                        <select
                          aria-label={`Portfolio group for ${acct.label}`}
                          value={grp}
                          onChange={(e) => setWalletGroup(acct.id, e.target.value as WalletGroupTag)}
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-mono focus:outline-none ${WALLET_GROUP_META[grp].badgeClass}`}
                        >
                          {(Object.keys(WALLET_GROUP_META) as WalletGroupTag[]).map((k) => (
                            <option key={k} value={k} className="bg-slate-950 text-slate-200">
                              {WALLET_GROUP_META[k].label}
                            </option>
                          ))}
                        </select>
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

        <div className="xl:col-span-9 space-y-4">
          {!activeAccount ? (
            <div className="hud-panel rounded-xl p-12 text-center space-y-2">
              <WalletIcon className="w-9 h-9 text-cyan-400/50 mx-auto" />
              <div className="text-sm font-semibold text-white">No Wallet Selected</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Create a new encrypted XRPL wallet, import a seed, connect a Ledger USB device, or track a watch-only address.
              </p>
            </div>
          ) : (
            <>
              <div className="hud-panel rounded-xl p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{activeAccount.label}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          isCustodial
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                            : activeAccount.kind === 'hardware-ledger'
                              ? 'bg-violet-500/20 text-violet-200 border border-violet-400/40'
                              : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {isCustodial
                          ? `SIGNING (${activeAccount.algorithm ?? 'ed25519'})`
                          : activeAccount.kind === 'hardware-ledger'
                            ? 'LEDGER HARDWARE'
                            : 'WATCH-ONLY / QR'}
                      </span>
                      {walletPortfolio?.signerList && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-[10px] font-mono text-amber-200">
                          Multi-Sig Quorum {walletPortfolio.signerList.signerQuorum}
                        </span>
                      )}
                      {quantumReport && (
                        <button
                          type="button"
                          onClick={() => setShowQuantumPanel((v) => !v)}
                          title="Inspect Post-Quantum Public-Key Exposure & Vault Readiness"
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                            !quantumReport.pubKeyExposed
                              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25'
                              : 'bg-amber-500/15 border-amber-400/40 text-amber-200 hover:bg-amber-500/25'
                          }`}
                        >
                          PQ: {quantumReport.pubKeyExposed ? 'PUBKEY EXPOSED' : 'SHIELDED'} ({quantumReport.score}/100)
                        </button>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-xs text-cyan-300">
                      <span>{activeAccount.address}</span>
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
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

                    <button
                      type="button"
                      onClick={() => {
                        const opened = openPrintableRecoverySheet(activeAccount, walletPortfolio?.qrSvg);
                        if (!opened) {
                          setVaultBannerMsg({
                            ok: false,
                            text: 'Pop-up window blocked — unable to open Printable Cold Recovery Sheet.',
                          });
                        }
                      }}
                      title="Open offline printable Cold Recovery Sheet (leaves secret seed blank for handwriting)"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 hover:border-emerald-400/50"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-400" />
                      Paper Sheet
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleExportSecurityAudit()}
                      disabled={!walletPortfolio}
                      title="Export a redacted Markdown Account Security & Reserve Audit report"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 hover:border-cyan-400/50 disabled:opacity-50"
                    >
                      <FileText className="w-3.5 h-3.5 text-cyan-400" />
                      Security Audit (.md)
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
                      >
                        Switch to Testnet Faucet
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void refreshWalletPortfolio()}
                      disabled={walletPortfolioLoading}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
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
                    {marketPrice.xrpUsd !== null && walletPortfolio && (
                      <div className="text-[10px] text-emerald-300/90 tabular-nums mt-0.5">
                        ≈ {formatUsd(walletPortfolio.totalXrp * marketPrice.xrpUsd)} USD
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl bg-slate-950/80 border border-emerald-500/25 p-3">
                    <div className="text-[10px] uppercase text-slate-500">Spendable XRP</div>
                    <div className="text-lg font-bold text-emerald-300 tabular-nums mt-0.5">
                      {(walletPortfolio?.spendableXrp ?? 0).toLocaleString()} XRP
                    </div>
                    {marketPrice.xrpUsd !== null && walletPortfolio && (
                      <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                        ≈ {formatUsd(walletPortfolio.spendableXrp * marketPrice.xrpUsd)} available
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
                    <div className="text-[10px] uppercase text-slate-500">Locked Reserve</div>
                    <div className="text-lg font-bold text-cyan-300 tabular-nums mt-0.5">
                      {reserveBreakdown.lockedXrp.toFixed(2)} XRP
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {reserveBreakdown.baseReserveXrp} base + {reserveBreakdown.ownerCount} objects ({reserveBreakdown.ownerReserveXrp.toFixed(1)})
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

                {/* Visual XRPL Reserve Breakdown Bar */}
                {walletPortfolio && walletPortfolio.totalXrp > 0 && (
                  <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-3 py-2 space-y-1.5 font-mono">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">
                        XRPL Reserve Meter: <span className="text-cyan-300">{reserveBreakdown.lockedXrp} XRP locked</span> ({reserveBreakdown.lockedPct}%) •{' '}
                        <span className="text-emerald-300">{reserveBreakdown.spendableXrp.toLocaleString()} XRP spendable</span> ({reserveBreakdown.spendablePct}%)
                      </span>
                      <span className="text-slate-500 hidden sm:inline">
                        Removing unused TrustLines frees 0.2 XRP each
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
                      <div
                        className="bg-cyan-400 h-full"
                        style={{ width: `${reserveBreakdown.lockedPct}%` }}
                      />
                      <div
                        className="bg-emerald-400 h-full"
                        style={{ width: `${reserveBreakdown.spendablePct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* v0.2.9-beta: Post-Quantum Exposure & Crypto-Agility Drawer */}
                {showQuantumPanel && quantumReport && (
                  <div className="rounded-xl bg-slate-950/90 border border-cyan-400/35 p-3.5 space-y-2.5 font-mono text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className={`w-4 h-4 ${quantumReport.pubKeyExposed ? 'text-amber-300' : 'text-emerald-300'}`} />
                        <span className="text-[11px] uppercase tracking-[0.14em] text-cyan-300 font-semibold">
                          Post-Quantum Exposure &amp; Vault Readiness ({quantumReport.score}/100)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewLabel('PQ Cold Vault (Receive-Only)');
                          setNewAlgo('ed25519');
                          setModalMode('create');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-[10px] text-emerald-200 hover:bg-emerald-500/30"
                      >
                        + Create Fresh PQ-Shielded Cold Vault
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-200">{quantumReport.headline}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
                      <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-emerald-200">
                        <div className="text-slate-500 uppercase">Local Vault At Rest</div>
                        <div>{VAULT_PQC_POSTURE.atRestCipher}</div>
                      </div>
                      <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-cyan-200">
                        <div className="text-slate-500 uppercase">Backup Seal &amp; Migration</div>
                        <div>{VAULT_PQC_POSTURE.backupIntegrity}</div>
                      </div>
                    </div>
                    <ul className="space-y-1 text-[10px] text-slate-300 list-disc pl-4">
                      {quantumReport.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Sub-Tabs */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'portfolio', label: 'Overview & Activity', icon: WalletIcon },
                  { id: 'send-trust', label: 'Send & TrustLines', icon: Send },
                  { id: 'contacts', label: `Address Book (${contacts.length})`, icon: BookUser },
                  { id: 'dex-amm', label: 'Pro DEX, PathSwap & AMM', icon: ArrowLeftRight },
                  { id: 'escrow-nft', label: 'Escrows, Checks & NFTs', icon: Sparkles },
                  { id: 'multisig', label: 'Multi-Sig & Air-Gapped', icon: Users },
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

              {/* SUB-TAB 1: PORTFOLIO */}
              {subTab === 'portfolio' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="hud-panel rounded-xl p-4 space-y-2.5">
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                      Issued Token TrustLines ({walletPortfolio?.tokens.length ?? 0})
                    </div>
                    {(walletPortfolio?.tokens.length ?? 0) === 0 ? (
                      <div className="text-xs font-mono text-slate-500 py-6 text-center">
                        No TrustLines configured yet.
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
                              {Number(tok.balance) === 0 && (
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
                                  className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-400/30 text-[10px] text-rose-300"
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

                  <div className="hud-panel rounded-xl p-4 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
                      Open DEX Orders ({walletPortfolio?.offers.length ?? 0})
                    </div>
                    {(walletPortfolio?.offers.length ?? 0) === 0 ? (
                      <div className="text-xs font-mono text-slate-500 py-2">No active limit orders.</div>
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
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                          Account Transaction History ({filteredRecentTxs.length})
                        </div>
                        <div className="relative">
                          <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1.5" />
                          <input
                            type="text"
                            value={txHistorySearch}
                            onChange={(e) => setTxHistorySearch(e.target.value)}
                            placeholder="Filter type, memo, addr…"
                            className="pl-6 pr-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200 w-44 focus:outline-none focus:border-cyan-400"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {filteredRecentTxs.map((tx) => {
                          const memos = decodeXrplMemos(tx.raw);
                          const isOutgoingPayment =
                            tx.txType === 'Payment' &&
                            tx.account === activeAccount.address &&
                            Boolean(tx.destination);
                          return (
                            <div
                              key={tx.id}
                              className="px-2.5 py-2 rounded-lg bg-slate-950/75 border border-slate-800/80 hover:border-cyan-400/40 font-mono text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => void inspectQuery(tx.hash)}
                                  className="text-left flex items-center gap-2 min-w-0 hover:text-cyan-300"
                                >
                                  <span className="text-slate-200 font-semibold">{tx.txType}</span>
                                  {tx.destination && (
                                    <span className="text-[10px] text-slate-500 truncate">
                                      → {shortenAddress(tx.destination, 5, 4)}
                                    </span>
                                  )}
                                </button>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-cyan-300 tabular-nums">{tx.amountDisplay}</span>
                                  {isOutgoingPayment && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPayDest(tx.destination ?? '');
                                        setPayAmount(
                                          tx.currency === 'XRP'
                                            ? String(tx.amountXrpEstimate || '')
                                            : ''
                                        );
                                        setSubTab('send-trust');
                                      }}
                                      title="Repeat this payment"
                                      className="p-1 rounded bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/25"
                                    >
                                      <Repeat className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {memos.length > 0 && (
                                <div className="text-[10px] text-emerald-300/90 bg-emerald-500/5 border border-emerald-400/20 rounded px-2 py-0.5 truncate">
                                  Memo: {memos.map((m) => m.data ?? m.type).filter(Boolean).join(' • ')}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 1B: ADDRESS BOOK */}
              {subTab === 'contacts' && (
                <AddressBookPanel
                  onSendToContact={(address, defaultTag) => {
                    setPayDest(address);
                    setPayDestTag(defaultTag !== undefined ? String(defaultTag) : '');
                    setSubTab('send-trust');
                  }}
                />
              )}

              {/* SUB-TAB 2: SEND & TRUSTLINES */}
              {subTab === 'send-trust' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <form onSubmit={submitPaymentForm} className="hud-panel rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                        Send XRP or Issued Token
                      </h3>
                    </div>

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

                    {contacts.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono uppercase text-slate-500">Quick Contact:</span>
                        {contacts.slice(0, 5).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setPayDest(c.address);
                              if (c.defaultTag !== undefined) setPayDestTag(String(c.defaultTag));
                            }}
                            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-cyan-400/50 text-[10px] font-mono text-slate-300"
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase text-slate-400">
                          Destination (r-Address or X-Address)
                        </span>
                        {isXAddress(payDest) && (
                          <button
                            type="button"
                            onClick={() => void handleDecodePayXAddress()}
                            className="flex items-center gap-1 text-[10px] font-mono text-emerald-300 hover:underline"
                          >
                            <Wand2 className="w-3 h-3" />
                            Decode X-Address
                          </button>
                        )}
                      </div>
                      <input
                        required
                        type="text"
                        value={payDest}
                        onChange={(e) => setPayDest(e.target.value)}
                        placeholder="Destination r-Address or X-Address"
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>

                    {destTagGuard.level !== 'ok' && destTagGuard.message && (
                      <div
                        className={`p-2.5 rounded-xl border text-[11px] font-mono flex items-start gap-2 ${
                          destTagGuard.level === 'danger'
                            ? 'bg-rose-500/15 border-rose-400/50 text-rose-200'
                            : 'bg-amber-500/15 border-amber-400/50 text-amber-200'
                        }`}
                      >
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div>{destTagGuard.message}</div>
                          {destTagGuard.suggestedTag !== undefined && (
                            <button
                              type="button"
                              onClick={() => setPayDestTag(String(destTagGuard.suggestedTag))}
                              className="mt-1 px-2 py-0.5 rounded bg-slate-950 border border-amber-400/40 text-[10px] text-amber-200 hover:bg-amber-500/20"
                            >
                              Apply Saved Tag #{destTagGuard.suggestedTag}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        required
                        type="text"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="Amount"
                        className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        type="number"
                        min="0"
                        value={payDestTag}
                        onChange={(e) => setPayDestTag(e.target.value)}
                        placeholder="Dest Tag (Optional)"
                        className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>

                    <input
                      type="text"
                      value={payMemo}
                      onChange={(e) => setPayMemo(e.target.value)}
                      placeholder="Optional Memo"
                      className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                    />

                    <button
                      type="submit"
                      className="w-full py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono font-semibold text-cyan-200 hover:bg-cyan-500/30"
                    >
                      Preview Payment (Vault or Air-Gapped QR)
                    </button>
                  </form>

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
                      <input
                        required
                        type="text"
                        value={tlCurrency}
                        onChange={(e) => setTlCurrency(e.target.value)}
                        placeholder="Currency"
                        className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        required
                        type="text"
                        value={tlLimit}
                        onChange={(e) => setTlLimit(e.target.value)}
                        placeholder="Limit"
                        className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>

                    <input
                      required
                      type="text"
                      value={tlIssuer}
                      onChange={(e) => setTlIssuer(e.target.value)}
                      placeholder="Issuer r-Address"
                      className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                    />

                    <button
                      type="submit"
                      className="w-full py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono font-semibold text-emerald-200 hover:bg-emerald-500/30"
                    >
                      Preview TrustSet
                    </button>
                  </form>
                </div>
              )}

              {/* SUB-TAB 3: PRO DEX, SMART PATHFINDING & AMM */}
              {subTab === 'dex-amm' && (
                <div className="space-y-4">
                  {/* Smart Auto-Bridging Pathfinding Swap */}
                  <div className="hud-panel rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Route className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
                          Smart Auto-Bridging Pathfinding Swap (`ripple_path_find`)
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        Routes across XRP Auto-Bridge + CLOB + AMM with `DeliverMin` slippage guard
                      </span>
                    </div>

                    <form onSubmit={(e) => void handleFindSwapPath(e)} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                      <input
                        required
                        type="text"
                        value={swapTargetCurrency}
                        onChange={(e) => setSwapTargetCurrency(e.target.value)}
                        placeholder="Receive Asset (RLUSD)"
                        className="md:col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        type="text"
                        value={swapTargetIssuer}
                        onChange={(e) => setSwapTargetIssuer(e.target.value)}
                        placeholder="Issuer r-Address (blank for XRP)"
                        className="md:col-span-4 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        required
                        type="text"
                        value={swapTargetAmount}
                        onChange={(e) => setSwapTargetAmount(e.target.value)}
                        placeholder="Target Amount"
                        className="md:col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <select
                        value={swapSlippagePct}
                        onChange={(e) => setSwapSlippagePct(e.target.value)}
                        className="md:col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs font-mono text-white"
                      >
                        <option value="0.5">0.5% Slippage</option>
                        <option value="1.0">1.0% Slippage</option>
                        <option value="2.5">2.5% Slippage</option>
                      </select>
                      <button
                        type="submit"
                        disabled={pathFinding}
                        className="md:col-span-2 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono text-emerald-200"
                      >
                        {pathFinding ? 'Routing…' : 'Find Best Route'}
                      </button>
                    </form>

                    {pathQuote && (
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
                        {pathQuote.ok ? (
                          <>
                            <div>
                              <span className="text-slate-400">Est. Input: </span>
                              <strong className="text-cyan-300">{pathQuote.sourceAmountDisplay}</strong>
                              <span className="text-slate-500 ml-2">({pathQuote.hopsSummary})</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleExecutePathSwap}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-500/25 border border-emerald-400 text-emerald-100 font-semibold"
                            >
                              Preview Protected Swap
                            </button>
                          </>
                        ) : (
                          <span className="text-amber-300">{pathQuote.error}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <form onSubmit={submitDexOrder} className="hud-panel rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
                          CLOB Order (`OfferCreate`)
                        </h3>
                        <div className="flex rounded-lg overflow-hidden border border-slate-700 font-mono text-[11px]">
                          <button
                            type="button"
                            onClick={() => setDexSide('buy')}
                            className={`px-2.5 py-1 ${
                              dexSide === 'buy' ? 'bg-emerald-500/25 text-emerald-200' : 'bg-slate-950 text-slate-400'
                            }`}
                          >
                            BUY
                          </button>
                          <button
                            type="button"
                            onClick={() => setDexSide('sell')}
                            className={`px-2.5 py-1 ${
                              dexSide === 'sell' ? 'bg-rose-500/25 text-rose-200' : 'bg-slate-950 text-slate-400'
                            }`}
                          >
                            SELL
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          required
                          type="text"
                          value={dexTokenCurrency}
                          onChange={(e) => setDexTokenCurrency(e.target.value)}
                          placeholder="Token"
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                        <select
                          value={dexOrderMode}
                          onChange={(e) => setDexOrderMode(e.target.value as typeof dexOrderMode)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        >
                          <option value="limit">Limit</option>
                          <option value="passive">Passive Maker</option>
                          <option value="ioc">IOC (Market)</option>
                          <option value="fok">Fill-or-Kill</option>
                        </select>
                      </div>

                      <input
                        required
                        type="text"
                        value={dexTokenIssuer}
                        onChange={(e) => setDexTokenIssuer(e.target.value)}
                        placeholder="Issuer r-Address"
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          required
                          type="text"
                          value={dexTokenAmount}
                          onChange={(e) => setDexTokenAmount(e.target.value)}
                          placeholder="Token Qty"
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                        <input
                          required
                          type="text"
                          value={dexXrpTotal}
                          onChange={(e) => setDexXrpTotal(e.target.value)}
                          placeholder="Total XRP"
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2 rounded-xl bg-amber-500/20 border border-amber-400/50 text-xs font-mono font-semibold text-amber-200"
                      >
                        Preview DEX {dexSide.toUpperCase()} Order
                      </button>
                    </form>

                    <form onSubmit={submitAmmForm} className="hud-panel rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-300">
                          XLS-30 AMM Pool Desk
                        </h3>
                        <select
                          value={ammAction}
                          onChange={(e) => setAmmAction(e.target.value as typeof ammAction)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-[11px] font-mono text-violet-200"
                        >
                          <option value="deposit">Deposit Liquidity</option>
                          <option value="withdraw">Withdraw Liquidity</option>
                          <option value="create">Create New AMM Pool</option>
                          <option value="vote">Vote Pool Fee (`AMMVote`)</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <input
                          required
                          type="text"
                          value={ammTokenCurrency}
                          onChange={(e) => setAmmTokenCurrency(e.target.value)}
                          placeholder="Token"
                          className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                        <input
                          required
                          type="text"
                          value={ammTokenIssuer}
                          onChange={(e) => setAmmTokenIssuer(e.target.value)}
                          placeholder="Issuer r-Address"
                          className="col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                      </div>

                      {(ammAction === 'deposit' || ammAction === 'create') && (
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            required
                            type="text"
                            value={ammXrpAmount}
                            onChange={(e) => setAmmXrpAmount(e.target.value)}
                            placeholder="XRP Amount"
                            className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                          />
                          <input
                            required={ammAction === 'create'}
                            type="text"
                            value={ammTokenAmount}
                            onChange={(e) => setAmmTokenAmount(e.target.value)}
                            placeholder={ammAction === 'create' ? 'Seed Token Amount' : 'Optional Dual Token'}
                            className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                          />
                        </div>
                      )}

                      {(ammAction === 'create' || ammAction === 'vote') && (
                        <input
                          required
                          type="number"
                          min="0"
                          max="100"
                          value={ammFeeBpsInput}
                          onChange={(e) => setAmmFeeBpsInput(e.target.value)}
                          placeholder="Trading Fee bps (0..100 bps)"
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                      )}

                      {ammAction === 'withdraw' && (
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs font-mono text-slate-300">
                            <input
                              type="checkbox"
                              checked={ammWithdrawAll}
                              onChange={(e) => setAmmWithdrawAll(e.target.checked)}
                            />
                            Withdraw All LP Tokens
                          </label>
                          {!ammWithdrawAll && (
                            <input
                              required
                              type="text"
                              value={ammXrpAmount}
                              onChange={(e) => setAmmXrpAmount(e.target.value)}
                              placeholder="XRP Withdraw Amount"
                              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                            />
                          )}
                        </div>
                      )}

                      <button
                        type="submit"
                        className="w-full py-2 rounded-xl bg-violet-500/20 border border-violet-400/50 text-xs font-mono font-semibold text-violet-200"
                      >
                        Preview AMM {ammAction.toUpperCase()}
                      </button>
                    </form>
                  </div>

                  {/* Interactive AMM Curve & Depth Simulator */}
                  <DexDepthCanvas
                    currencyLabel={ammTokenCurrency || 'TOKEN'}
                    bids={[]}
                    asks={[]}
                    simulatedSwapXrpIn={Number(ammXrpAmount) || 2_500}
                    ammFeeBps={Number(ammFeeBpsInput) || 30}
                  />
                </div>
              )}

              {/* SUB-TAB 4: ESCROWS, CHECKS & NFTS */}
              {subTab === 'escrow-nft' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <form onSubmit={submitEscrowCreate} className="hud-panel rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                          Time-Locked XRP Escrow (`EscrowCreate`)
                        </h3>
                      </div>
                      <input
                        type="text"
                        value={escrowDest}
                        onChange={(e) => setEscrowDest(e.target.value)}
                        placeholder={`Destination (blank = ${shortenAddress(activeAccount.address)})`}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          required
                          type="text"
                          value={escrowXrp}
                          onChange={(e) => setEscrowXrp(e.target.value)}
                          placeholder="XRP"
                          className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                        <input
                          required
                          type="number"
                          min="1"
                          value={escrowMinutes}
                          onChange={(e) => setEscrowMinutes(e.target.value)}
                          placeholder="Mins"
                          className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                        <input
                          type="number"
                          min="1"
                          value={escrowCancelHours}
                          onChange={(e) => setEscrowCancelHours(e.target.value)}
                          placeholder="+Exp Hrs"
                          className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono font-semibold text-cyan-200"
                      >
                        Preview Time-Locked Escrow
                      </button>

                      {(walletPortfolio?.escrows.length ?? 0) > 0 && (
                        <div className="pt-2 border-t border-slate-800 space-y-1.5">
                          {walletPortfolio!.escrows.map((esc) => (
                            <div
                              key={esc.index}
                              className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800 font-mono text-xs"
                            >
                              <span className="text-cyan-300 font-bold">{esc.amountXrp} XRP</span>
                              {esc.offerSequence !== undefined && (
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

                    <form onSubmit={submitCheckCreate} className="hud-panel rounded-xl p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
                        Deferred XRPL Checks (`CheckCreate` / `CheckCash`)
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          required
                          type="text"
                          value={checkDest}
                          onChange={(e) => setCheckDest(e.target.value)}
                          placeholder="Recipient r-Address"
                          className="col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                        />
                        <input
                          required
                          type="text"
                          value={checkXrp}
                          onChange={(e) => setCheckXrp(e.target.value)}
                          placeholder="Max XRP"
                          className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono font-semibold text-emerald-200"
                      >
                        Preview CheckCreate
                      </button>

                      {(walletPortfolio?.checks.length ?? 0) > 0 && (
                        <div className="pt-2 border-t border-slate-800 space-y-1.5">
                          {walletPortfolio!.checks.map((chk) => {
                            const isRecipient = chk.destination === activeAccount.address;
                            return (
                              <div
                                key={chk.index}
                                className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800 font-mono text-xs"
                              >
                                <span className="text-emerald-300 font-bold">{chk.sendMaxDisplay}</span>
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
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </form>
                  </div>

                  {/* Track 3: Multi-Tranche Escrow Vesting Schedule Builder */}
                  <div className="hud-panel rounded-xl p-4 space-y-3 border border-cyan-400/25">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                          Multi-Tranche Escrow Vesting Schedule Builder
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        Generates itemized on-ledger EscrowCreate tranches (pre-flighted via TxConfirmModal)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                      <input
                        type="text"
                        value={vestDest}
                        onChange={(e) => setVestDest(e.target.value)}
                        placeholder={`Beneficiary r-Address (blank = self)`}
                        className="md:col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={vestTotalXrp}
                        onChange={(e) => setVestTotalXrp(e.target.value)}
                        placeholder="Total XRP"
                        title="Total XRP to split across tranches"
                        className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <select
                        aria-label="Vesting tranche count"
                        value={vestTranches}
                        onChange={(e) => setVestTranches(e.target.value)}
                        className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      >
                        {[2, 3, 4, 6, 8, 12, 24].map((n) => (
                          <option key={n} value={n}>
                            {n} Tranches
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Vesting interval"
                        value={vestIntervalDays}
                        onChange={(e) => setVestIntervalDays(e.target.value)}
                        className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      >
                        <option value="7">Weekly (7d)</option>
                        <option value="14">Bi-Weekly (14d)</option>
                        <option value="30">Monthly (30d)</option>
                        <option value="90">Quarterly (90d)</option>
                      </select>
                      <input
                        type="date"
                        value={vestStartDate}
                        onChange={(e) => setVestStartDate(e.target.value)}
                        title="First tranche unlock date (UTC)"
                        className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                      <div className="flex items-center gap-3 text-slate-300">
                        <span>
                          Cancel Buffer:{' '}
                          <input
                            type="number"
                            min="0"
                            value={vestCancelBufferDays}
                            onChange={(e) => setVestCancelBufferDays(e.target.value)}
                            className="w-16 rounded bg-slate-950 border border-slate-700 px-1.5 py-0.5 text-[11px] text-cyan-200"
                          />{' '}
                          days after unlock
                        </span>
                      </div>
                      {vestingPlan?.ok && (
                        <div className="text-cyan-300">
                          Total: <strong>{vestingPlan.totalXrp.toLocaleString()} XRP</strong> • Reserve:{' '}
                          <strong>+{vestingPlan.additionalReserveXrp} XRP</strong> • Est. Fees:{' '}
                          <strong>{vestingPlan.estimatedNetworkFeeXrp} XRP</strong>
                        </div>
                      )}
                    </div>

                    {vestingPlan && !vestingPlan.ok ? (
                      <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-400/40 text-xs font-mono text-rose-200">
                        {vestingPlan.error}
                      </div>
                    ) : vestingPlan && vestingPlan.tranches.length > 0 ? (
                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                        {vestingPlan.tranches.map((tr) => (
                          <div
                            key={tr.index}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/30 text-[10px] text-cyan-200">
                                #{tr.index}/{vestingPlan.tranches.length}
                              </span>
                              <span className="text-white font-bold tabular-nums">{tr.amountXrp} XRP</span>
                              <span className="text-slate-400">Unlock: {tr.unlockDateIso} UTC</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => void openTxConfirmModal(activeAccount.id, tr.intent)}
                              className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-[11px] text-cyan-200 hover:bg-cyan-500/30"
                            >
                              Preview &amp; Sign Tranche #{tr.index}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Track 3 (v0.2.4-beta): Streaming Payment Channels Studio */}
                  <div className="hud-panel rounded-xl p-4 space-y-3 border border-emerald-400/25">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Repeat className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
                          Streaming Payment Channels (`PaymentChannelCreate` / `Fund`)
                        </h3>
                      </div>
                      <button
                        type="button"
                        disabled={chLoading}
                        onClick={() => void handleLoadPaymentChannels()}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-emerald-200 hover:border-emerald-400/50"
                      >
                        <RefreshCw className={`w-3 h-3 ${chLoading ? 'animate-spin' : ''}`} />
                        Load Active Channels ({chList.length})
                      </button>
                    </div>

                    <form onSubmit={submitPaymentChannelCreate} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                      <input
                        required
                        type="text"
                        value={chDest}
                        onChange={(e) => setChDest(e.target.value)}
                        placeholder="Recipient r-Address"
                        className="md:col-span-4 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        required
                        type="text"
                        value={chAmountXrp}
                        onChange={(e) => setChAmountXrp(e.target.value)}
                        placeholder="XRP Deposit"
                        className="md:col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        required
                        type="number"
                        min="60"
                        value={chSettleDelaySec}
                        onChange={(e) => setChSettleDelaySec(e.target.value)}
                        placeholder="Settle (s)"
                        title="SettleDelay in seconds (minimum 60)"
                        className="md:col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        required
                        type="text"
                        value={chPublicKeyHex}
                        onChange={(e) => setChPublicKeyHex(e.target.value)}
                        placeholder="66-hex PublicKey (ED... / 02... / 03...)"
                        className="md:col-span-4 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <button
                        type="submit"
                        className="md:col-span-12 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono font-semibold text-emerald-200 hover:bg-emerald-500/30"
                      >
                        Preview PaymentChannelCreate
                      </button>
                    </form>

                    {chList.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-800">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span>Active Outgoing Channels</span>
                          <span>
                            Top-Up Amount:{' '}
                            <input
                              type="text"
                              value={chTopUpAmt}
                              onChange={(e) => setChTopUpAmt(e.target.value)}
                              className="w-16 rounded bg-slate-950 border border-slate-700 px-1.5 py-0.5 text-[10px] text-emerald-200"
                            />{' '}
                            XRP
                          </span>
                        </div>
                        {chList.map((ch) => (
                          <div
                            key={ch.channelId}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-xs"
                          >
                            <div>
                              <div className="text-emerald-300 font-bold">
                                {ch.amountXrp} XRP funded • {ch.balanceXrp} XRP claimed
                              </div>
                              <div className="text-[10px] text-slate-400">
                                To {shortenAddress(ch.destination, 8, 6)} • Delay {ch.settleDelay}s • ID{' '}
                                {shortenAddress(ch.channelId, 8, 6)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                void openTxConfirmModal(activeAccount.id, {
                                  kind: 'PaymentChannelFund',
                                  account: activeAccount.address,
                                  channelId: ch.channelId,
                                  amountXrp: chTopUpAmt.trim() || '10',
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-[11px] text-emerald-200"
                            >
                              + Top Up {chTopUpAmt} XRP
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="hud-panel rounded-xl p-4 space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-fuchsia-300">
                      XLS-20 NFToken Studio &amp; Owned Gallery ({walletPortfolio?.nfts.length ?? 0})
                    </h3>

                    <form onSubmit={submitNftMint} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                      <input
                        required
                        type="text"
                        value={nftUri}
                        onChange={(e) => setNftUri(e.target.value)}
                        placeholder="ipfs://bafy..."
                        className="md:col-span-6 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        type="number"
                        min="0"
                        value={nftTaxon}
                        onChange={(e) => setNftTaxon(e.target.value)}
                        placeholder="Taxon"
                        className="md:col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.1"
                        value={nftRoyaltyPct}
                        onChange={(e) => setNftRoyaltyPct(e.target.value)}
                        placeholder="Royalty %"
                        className="md:col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <button
                        type="submit"
                        className="md:col-span-2 py-1.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/50 text-xs font-mono font-semibold text-fuchsia-200"
                      >
                        Mint NFT
                      </button>
                    </form>

                    {(walletPortfolio?.nfts.length ?? 0) > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {walletPortfolio!.nfts.map((nft) => {
                          const media = resolveSafeMediaUri(nft.uriDecoded);
                          return (
                          <div
                            key={nft.nftokenId}
                            className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs space-y-2"
                          >
                            {media.gatewayUrl && media.isImageLikely && (
                              <div className="h-28 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center">
                                <img
                                  src={media.gatewayUrl}
                                  alt={`NFT #${nft.serial}`}
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-fuchsia-300 font-bold">Serial #{nft.serial}</span>
                              <span className="text-[10px] text-slate-500">Taxon {nft.taxon}</span>
                            </div>
                            <div className="text-[11px] text-slate-300 truncate" title={media.displayUri || nft.nftokenId}>
                              {nft.uriDecoded ?? shortenAddress(nft.nftokenId, 10, 8)}
                            </div>
                            <div className="flex gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveNftOfferId(activeNftOfferId === nft.nftokenId ? null : nft.nftokenId)
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

                            {activeNftOfferId === nft.nftokenId && (
                              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                                <input
                                  type="text"
                                  value={nftOfferPriceXrp}
                                  onChange={(e) => setNftOfferPriceXrp(e.target.value)}
                                  placeholder="Price XRP (0 = free)"
                                  className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-white"
                                />
                                <input
                                  type="text"
                                  value={nftTransferDest}
                                  onChange={(e) => setNftTransferDest(e.target.value)}
                                  placeholder="Optional recipient r-address"
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
                                  Preview NFT Offer
                                </button>
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 5: MULTI-SIG, KEY ROTATION & AIR-GAPPED COORDINATOR */}
              {subTab === 'multisig' && (
                <div className="space-y-4">
                  {/* Track 3 (v0.2.4-beta): RegularKey Rotation & Key Hygiene Studio */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!regularKeyCheck?.ok) return;
                      void openTxConfirmModal(activeAccount.id, {
                        kind: 'SetRegularKey',
                        account: activeAccount.address,
                        regularKey: regularKeyInput.trim() || undefined,
                      });
                    }}
                    className="hud-panel rounded-xl p-4 space-y-3 border border-cyan-400/25"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                          RegularKey Rotation &amp; Key Hygiene (`SetRegularKey`)
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        Active RegularKey:{' '}
                        <strong className="text-cyan-200">
                          {walletPortfolio?.flags.regularKey
                            ? shortenAddress(walletPortfolio.flags.regularKey, 8, 6)
                            : 'None (Master Key)'}
                        </strong>
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={regularKeyInput}
                        onChange={(e) => setRegularKeyInput(e.target.value)}
                        placeholder="New RegularKey r-Address (leave blank to remove RegularKey)"
                        className="flex-1 min-w-[260px] rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                      <button
                        type="submit"
                        disabled={!regularKeyCheck?.ok}
                        className="px-4 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50"
                      >
                        {regularKeyInput.trim() ? 'Preview SetRegularKey' : 'Preview Remove RegularKey'}
                      </button>
                    </div>

                    {regularKeyCheck?.error && (
                      <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-400/40 text-[11px] font-mono text-rose-200">
                        {regularKeyCheck.error}
                      </div>
                    )}
                    {regularKeyCheck?.warning && (
                      <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-400/40 text-[11px] font-mono text-amber-200">
                        {regularKeyCheck.warning}
                      </div>
                    )}
                  </form>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const signers = [
                        { account: msSigner1.trim(), weight: Number(msWeight1) || 1 },
                        ...(msSigner2.trim()
                          ? [{ account: msSigner2.trim(), weight: Number(msWeight2) || 1 }]
                          : []),
                      ].filter((s) => s.account);
                      void openTxConfirmModal(activeAccount.id, {
                        kind: 'SignerListSet',
                        account: activeAccount.address,
                        signerQuorum: Number(msQuorum) || 1,
                        signers,
                      });
                    }}
                    className="hud-panel rounded-xl p-4 space-y-3"
                  >
                    <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
                      Configure Account Multi-Sign Quorum (`SignerListSet`)
                    </h3>
                    <div>
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Required SignerQuorum (0 = Delete SignerList)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={msQuorum}
                        onChange={(e) => setMsQuorum(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={msSigner1}
                        onChange={(e) => setMsSigner1(e.target.value)}
                        placeholder="Signer 1 r-Address"
                        className="col-span-3 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        type="number"
                        min="1"
                        value={msWeight1}
                        onChange={(e) => setMsWeight1(e.target.value)}
                        placeholder="Wt"
                        className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={msSigner2}
                        onChange={(e) => setMsSigner2(e.target.value)}
                        placeholder="Signer 2 r-Address"
                        className="col-span-3 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <input
                        type="number"
                        min="1"
                        value={msWeight2}
                        onChange={(e) => setMsWeight2(e.target.value)}
                        placeholder="Wt"
                        className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 rounded-xl bg-amber-500/20 border border-amber-400/50 text-xs font-mono font-semibold text-amber-200"
                    >
                      Preview SignerListSet
                    </button>
                  </form>

                  <div className="hud-panel rounded-xl p-4 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                      Multi-Sign Partial Signer &amp; Combiner (`xrpl.multisign`)
                    </h3>
                    {msStatusBanner && (
                      <div
                        className={`p-2 rounded text-xs font-mono border ${
                          msStatusBanner.ok
                            ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                            : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                        }`}
                      >
                        {msStatusBanner.text}
                      </div>
                    )}
                    <div>
                      <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Unsigned Multi-Sig tx_json (Fee = (1 + N) × BaseFee)
                      </div>
                      <textarea
                        rows={4}
                        value={msUnsignedJson}
                        onChange={(e) => setMsUnsignedJson(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2 font-mono text-[11px] text-white"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!isCustodial || !vaultStatus.unlocked}
                      onClick={() => void handlePartialMultisigSign()}
                      className="w-full py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-xs font-mono text-cyan-200 disabled:opacity-40"
                    >
                      Add Partial Signature With Selected Vault Wallet
                    </button>
                    <div>
                      <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Collected Partial Signed Blobs (One Per Line)
                      </div>
                      <textarea
                        rows={3}
                        value={msPartialBlobsText}
                        onChange={(e) => setMsPartialBlobsText(e.target.value)}
                        placeholder="Paste partial multi-signed hex blobs here…"
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2 font-mono text-[11px] text-emerald-200"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCombineMultisig()}
                      className="w-full py-2 rounded-xl bg-emerald-500/25 border border-emerald-400 text-xs font-mono font-semibold text-emerald-100"
                    >
                      Combine Signatures &amp; Broadcast to XRPL
                    </button>
                  </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Onboarding & QR Modals */}
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
                <input
                  autoFocus
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Primary Treasury / Dev Wallet"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
                <select
                  value={newAlgo}
                  onChange={(e) => setNewAlgo(e.target.value as WalletAlgorithm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                >
                  <option value="ed25519">ed25519 (Recommended Modern Default)</option>
                  <option value="ecdsa-secp256k1">ecdsa-secp256k1</option>
                </select>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setModalMode(null)} className="px-3 py-1.5 text-xs text-slate-400">
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
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setModalMode(null)} className="px-3 py-1.5 text-xs text-slate-400">
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
                <h3 className="text-sm font-bold text-white">Add Watch-Only / Air-Gapped XRPL Address</h3>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Cold Storage / Xaman Wallet"
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
                  <button type="button" onClick={() => setModalMode(null)} className="px-3 py-1.5 text-xs text-slate-400">
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

      {/* One-Time Seed Backup Modal */}
      {oneTimeBackup && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="hud-panel rounded-2xl max-w-md w-full p-5 border border-emerald-400/50 space-y-4">
            <h3 className="text-sm font-bold text-emerald-300">
              One-Time Secret Seed Backup (Write Offline Now)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              XRPL Command Center never exposes your secret seed again after closing this window.
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

      <HardwareWalletModal
        open={hardwareModalOpen}
        onClose={() => setHardwareModalOpen(false)}
        onPaired={(accountId, message) => {
          void refreshVaultStatus().then(() => selectWallet(accountId));
          setVaultBannerMsg({ ok: true, text: message });
        }}
      />
    </div>
  );
};
