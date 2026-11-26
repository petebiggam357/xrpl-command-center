import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Image as ImageIcon,
  Layers,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import { formatUsd, resolveSafeMediaUri } from '../shared/betaUtils';
import {
  analyzeCollectionRarity,
  buildNftMintReceiptCsv,
  buildXls24dMetadata,
  type CollectionMintItem,
  estimateNftCollectionCosts,
  generateSequentialCollectionItems,
  lintNftMintConfig,
  type NftTrait,
  parseNftCollectionCsv,
  parseNftOfferBatchCsv,
  XRPL_NFT_LAUNCH_CHECKLIST,
  XRPL_NFT_PLAYBOOK_CATEGORIES,
} from '../shared/nftStudioUtils';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

type NftStudioTab = 'single' | 'collection' | 'rarity-offers' | 'playbook';

const CHECKLIST_STORAGE_KEY = 'xrpl-cc-nft-checklist-v1';

function loadChecklistState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function downloadTextFile(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const NftStudioDeck: React.FC = () => {
  const vaultStatus = useCommandStore((s) => s.vaultStatus);
  const selectedWalletId = useCommandStore((s) => s.selectedWalletId);
  const selectWallet = useCommandStore((s) => s.selectWallet);
  const openTxConfirmModal = useCommandStore((s) => s.openTxConfirmModal);
  const setActiveTab = useCommandStore((s) => s.setActiveTab);
  const streamStatus = useCommandStore((s) => s.streamStatus);
  const marketPrice = useCommandStore((s) => s.marketPrice);

  const [tab, setTab] = useState<NftStudioTab>('single');

  const activeAccount =
    vaultStatus.accounts.find((a) => a.id === selectedWalletId) ?? vaultStatus.accounts[0] ?? null;

  // ============================================================================
  // Sub-Tab 1: Single 1-of-1 NFT Mint & XLS-24d Metadata Builder
  // ============================================================================
  const [nftName, setNftName] = useState('Genesis XRPL Voyager #1');
  const [nftDescription, setNftDescription] = useState(
    'Original 1-of-1 XLS-20 collectible minted natively on the XRP Ledger with immutable IPFS metadata.'
  );
  const [collectionName, setCollectionName] = useState('XRPL Voyagers');
  const [imageUri, setImageUri] = useState('ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
  const [metadataUri, setMetadataUri] = useState('ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/1.json');
  const [externalUrl, setExternalUrl] = useState('');
  const [taxon, setTaxon] = useState('1001');
  const [royaltyPct, setRoyaltyPct] = useState('5');
  const [transferable, setTransferable] = useState(true);
  const [burnable, setBurnable] = useState(true);
  const [onlyXrp, setOnlyXrp] = useState(false);
  const [traits, setTraits] = useState<NftTrait[]>([
    { trait_type: 'Edition', value: 'Genesis 1/1' },
    { trait_type: 'Background', value: 'Deep Space Cyan' },
    { trait_type: 'Utility', value: 'Founder Pass' },
  ]);
  const [copiedMeta, setCopiedMeta] = useState(false);

  const metadataJsonObj = useMemo(
    () =>
      buildXls24dMetadata({
        name: nftName,
        description: nftDescription,
        imageUri,
        externalUrl,
        collectionName,
        attributes: traits,
      }),
    [nftName, nftDescription, imageUri, externalUrl, collectionName, traits]
  );

  const metadataJsonText = useMemo(() => JSON.stringify(metadataJsonObj, null, 2), [metadataJsonObj]);

  const mintLint = useMemo(
    () =>
      lintNftMintConfig({
        name: nftName,
        uriText: metadataUri,
        taxon: Number(taxon),
        royaltyPct: Number(royaltyPct),
        transferable,
        onlyXrp,
      }),
    [nftName, metadataUri, taxon, royaltyPct, transferable, onlyXrp]
  );

  const previewMedia = useMemo(() => resolveSafeMediaUri(imageUri), [imageUri]);

  const handleMintSingle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount || !mintLint.ok) return;
    void openTxConfirmModal(activeAccount.id, {
      kind: 'NFTokenMint',
      account: activeAccount.address,
      uriText: metadataUri.trim(),
      taxon: Math.max(0, Math.floor(Number(taxon) || 0)),
      transferFeeBps: Math.round((Number(royaltyPct) || 0) * 100),
      transferable,
      burnable,
      onlyXrp,
    });
  };

  // ============================================================================
  // Sub-Tab 2: Collection Batch Minter & NFTokenPage Reserve Estimator
  // ============================================================================
  const [colSourceMode, setColSourceMode] = useState<'sequential' | 'csv'>('sequential');
  const [colName, setColName] = useState('XRPL Cyber Founders');
  const [colBaseUri, setColBaseUri] = useState('ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
  const [colCount, setColCount] = useState('25');
  const [colTaxon, setColTaxon] = useState('2026');
  const [colRoyaltyPct, setColRoyaltyPct] = useState('5');
  const [colIncludeOffers, setColIncludeOffers] = useState(true);
  const [colCsvText, setColCsvText] = useState(
    'Cyber Founder #1,ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/1.json,Tier:Mythic|Visor:Gold|Background:Nebula\n' +
      'Cyber Founder #2,ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/2.json,Tier:Rare|Visor:Cyan|Background:Nebula\n' +
      'Cyber Founder #3,ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/3.json,Tier:Common|Visor:Cyan|Background:Midnight\n' +
      'Cyber Founder #4,ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/4.json,Tier:Common|Visor:Emerald|Background:Midnight'
  );

  const [batchRunning, setBatchRunning] = useState(false);
  const batchAbortRef = useRef(false);
  const [batchResults, setBatchResults] = useState<
    Array<{ index: number; name: string; uriText: string; status: 'pending' | 'minted' | 'failed'; txHash?: string; error?: string }>
  >([]);

  const parsedCsvCollection = useMemo(() => parseNftCollectionCsv(colCsvText), [colCsvText]);

  const collectionItems: CollectionMintItem[] = useMemo(() => {
    if (colSourceMode === 'csv') return parsedCsvCollection.items;
    return generateSequentialCollectionItems({
      collectionName: colName,
      baseUri: colBaseUri,
      count: Number(colCount) || 1,
      startIndex: 1,
    });
  }, [colSourceMode, parsedCsvCollection.items, colName, colBaseUri, colCount]);

  const collectionCosts = useMemo(
    () => estimateNftCollectionCosts(collectionItems.length || 1, colIncludeOffers),
    [collectionItems.length, colIncludeOffers]
  );

  const runBatchMint = async () => {
    if (!activeAccount || collectionItems.length === 0) return;
    if (activeAccount.kind !== 'custodial' || !vaultStatus.unlocked) {
      // Fall back to opening the first item in TxConfirmModal for hardware/watch-only wallets
      void openTxConfirmModal(activeAccount.id, {
        kind: 'NFTokenMint',
        account: activeAccount.address,
        uriText: collectionItems[0].uriText,
        taxon: Math.max(0, Math.floor(Number(colTaxon) || 0)),
        transferFeeBps: Math.round((Number(colRoyaltyPct) || 0) * 100),
        transferable,
        burnable,
        onlyXrp,
      });
      return;
    }

    batchAbortRef.current = false;
    setBatchRunning(true);
    const initial: Array<{
      index: number;
      name: string;
      uriText: string;
      status: 'pending' | 'minted' | 'failed';
      txHash?: string;
      error?: string;
    }> = collectionItems.map((it) => ({
      index: it.index,
      name: it.name,
      uriText: it.uriText,
      status: 'pending',
    }));
    setBatchResults(initial);

    const bridge = getXrplBridge();
    const updated = [...initial];

    for (let i = 0; i < collectionItems.length; i++) {
      if (batchAbortRef.current) break;
      const item = collectionItems[i];
      try {
        const res = await bridge.walletSignAndSubmitTx(activeAccount.id, {
          kind: 'NFTokenMint',
          account: activeAccount.address,
          uriText: item.uriText,
          taxon: Math.max(0, Math.floor(Number(colTaxon) || 0)),
          transferFeeBps: Math.round((Number(colRoyaltyPct) || 0) * 100),
          transferable,
          burnable,
          onlyXrp,
        });
        updated[i] = {
          ...updated[i],
          status: res.ok ? 'minted' : 'failed',
          txHash: res.hash,
          error: res.ok ? undefined : res.error ?? res.engineResult ?? 'Rejected',
        };
      } catch (err) {
        updated[i] = {
          ...updated[i],
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        };
      }
      setBatchResults([...updated]);
    }
    setBatchRunning(false);
  };

  // ============================================================================
  // Sub-Tab 3: Trait Rarity Analyzer & Bulk Sell-Offer / Whitelist Airdrop Queue
  // ============================================================================
  const rarityReport = useMemo(
    () => analyzeCollectionRarity(parsedCsvCollection.items),
    [parsedCsvCollection.items]
  );

  const [offerBatchCsv, setOfferBatchCsv] = useState(
    '# Format: 64-hex NFTokenID, price_xrp, [optional_whitelist_rAddress]\n' +
      '# Set price_xrp = 0 + destination r-address for a free Whitelist Airdrop!\n'
  );

  const parsedOffers = useMemo(
    () => parseNftOfferBatchCsv(activeAccount?.address ?? '', offerBatchCsv),
    [activeAccount?.address, offerBatchCsv]
  );

  // ============================================================================
  // Sub-Tab 4: Creator Playbook Checklist
  // ============================================================================
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>(() => loadChecklistState());
  const toggleChecklistStep = (id: string) => {
    const next = { ...checkedSteps, [id]: !checkedSteps[id] };
    setCheckedSteps(next);
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const completedChecklistCount = XRPL_NFT_LAUNCH_CHECKLIST.filter((c) => checkedSteps[c.id]).length;

  return (
    <div className="space-y-4">
      {/* Studio Header */}
      <div className="hud-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-fuchsia-400" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-fuchsia-300">
              XRPL XLS-20 NFT Studio &amp; Collection Launchpad
            </h2>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-cyan-300 uppercase">
              {streamStatus.networkId}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Launch 1-of-1 artwork or full XLS-20 collections with XLS-24d metadata linting, exact NFTokenPage reserve
            math, trait rarity analysis, bulk sell offers/airdrops, and an XRPL Creator Playbook.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {vaultStatus.accounts.length > 0 ? (
            <select
              aria-label="Select minting wallet"
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
              className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/50 text-xs font-mono text-fuchsia-200"
            >
              Create / Unlock Wallet First →
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'single', label: '1-of-1 Mint & Live Preview', icon: ImageIcon },
          { id: 'collection', label: 'Collection Batch Minter', icon: Layers },
          { id: 'rarity-offers', label: 'Rarity Analyzer & Bulk Offers', icon: Award },
          {
            id: 'playbook',
            label: `Creator Playbook (${completedChecklistCount}/${XRPL_NFT_LAUNCH_CHECKLIST.length})`,
            icon: BookOpen,
          },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as NftStudioTab)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono border transition-colors ${
                active
                  ? 'bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-200'
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
      {/* SUB-TAB 1: SINGLE 1-OF-1 MINT & LIVE MARKETPLACE PREVIEW             */}
      {/* ==================================================================== */}
      {tab === 'single' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <form onSubmit={handleMintSingle} className="xl:col-span-7 hud-panel rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-fuchsia-300">
              XLS-24d Metadata &amp; On-Ledger Mint Parameters
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">NFT Name</label>
                <input
                  required
                  type="text"
                  value={nftName}
                  onChange={(e) => setNftName(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Collection Name</label>
                <input
                  type="text"
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Description</label>
              <textarea
                rows={2}
                value={nftDescription}
                onChange={(e) => setNftDescription(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Artwork / Media URI (`ipfs://...`)
                </label>
                <input
                  type="text"
                  value={imageUri}
                  onChange={(e) => setImageUri(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-cyan-200"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  On-Ledger Metadata URI ({mintLint.uriByteLength}/256 bytes)
                </label>
                <input
                  required
                  type="text"
                  value={metadataUri}
                  onChange={(e) => setMetadataUri(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-emerald-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  NFTokenTaxon (Collection ID)
                </label>
                <input
                  type="number"
                  min={0}
                  value={taxon}
                  onChange={(e) => setTaxon(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Royalty % (Sweet Spot: 2.5–7.5%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={royaltyPct}
                  onChange={(e) => setRoyaltyPct(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  External URL (Optional)
                </label>
                <input
                  type="text"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://yourproject.xyz"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
            </div>

            {/* XRPL XLS-20 Flags */}
            <div className="flex flex-wrap gap-4 pt-1 text-xs font-mono text-slate-200">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={transferable}
                  onChange={(e) => setTransferable(e.target.checked)}
                />
                tfTransferable (Resellable)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={burnable}
                  onChange={(e) => setBurnable(e.target.checked)}
                />
                tfBurnable (Issuer Redeem/Burn)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyXrp}
                  onChange={(e) => setOnlyXrp(e.target.checked)}
                />
                tfOnlyXRP (XRP-Only Offers)
              </label>
            </div>

            {/* Traits Builder */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-slate-400">
                  Metadata Traits ({traits.length})
                </span>
                <button
                  type="button"
                  onClick={() => setTraits([...traits, { trait_type: '', value: '' }])}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-[10px] font-mono text-cyan-200"
                >
                  <Plus className="w-3 h-3" />
                  Add Trait
                </button>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {traits.map((t, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={t.trait_type}
                      onChange={(e) =>
                        setTraits(traits.map((x, i) => (i === idx ? { ...x, trait_type: e.target.value } : x)))
                      }
                      placeholder="Trait Type (e.g. Rarity)"
                      className="flex-1 rounded bg-slate-950 border border-slate-700 px-2.5 py-1 text-xs font-mono text-white"
                    />
                    <input
                      type="text"
                      value={t.value}
                      onChange={(e) =>
                        setTraits(traits.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))
                      }
                      placeholder="Value (e.g. Mythic)"
                      className="flex-1 rounded bg-slate-950 border border-slate-700 px-2.5 py-1 text-xs font-mono text-emerald-200"
                    />
                    <button
                      type="button"
                      onClick={() => setTraits(traits.filter((_, i) => i !== idx))}
                      className="p-1 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(metadataJsonText);
                  setCopiedMeta(true);
                  setTimeout(() => setCopiedMeta(false), 1500);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 hover:border-cyan-400/50"
              >
                {copiedMeta ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedMeta ? 'Copied XLS-24d JSON' : 'Copy XLS-24d JSON'}
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(`${(nftName || 'nft').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, metadataJsonText)
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-cyan-200 hover:border-cyan-400/50"
              >
                <Download className="w-3.5 h-3.5" />
                Download JSON for IPFS
              </button>
              <button
                type="submit"
                disabled={!activeAccount || !mintLint.ok}
                className="flex-1 py-2 px-4 rounded-xl bg-fuchsia-500/25 border border-fuchsia-400/60 text-xs font-mono font-semibold text-fuchsia-100 hover:bg-fuchsia-500/35 disabled:opacity-40"
              >
                Preview &amp; Mint 1-of-1 NFT on XRPL
              </button>
            </div>
          </form>

          {/* Right: Live Marketplace Card Preview & XLS-24d Linter */}
          <div className="xl:col-span-5 space-y-4">
            <div className="hud-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-cyan-300">
                  Live Marketplace Card Preview
                </span>
                <span className="text-[10px] font-mono text-slate-400">Taxon #{taxon || 0}</span>
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                <div className="h-44 bg-gradient-to-br from-fuchsia-500/15 via-slate-950 to-cyan-500/15 flex items-center justify-center relative overflow-hidden">
                  {previewMedia.gatewayUrl ? (
                    <img
                      src={previewMedia.gatewayUrl}
                      alt={nftName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <ImageIcon className="w-10 h-10 text-slate-600" />
                  )}
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/70 border border-fuchsia-400/40 text-[10px] font-mono text-fuchsia-200">
                    Royalty {royaltyPct}%
                  </span>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-white truncate">{nftName || 'Untitled NFT'}</div>
                    <span className="text-[10px] font-mono text-cyan-300 shrink-0">{collectionName}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{nftDescription}</p>
                  {traits.filter((t) => t.trait_type && t.value).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {traits
                        .filter((t) => t.trait_type && t.value)
                        .map((t, i) => (
                          <div
                            key={i}
                            className="px-2 py-1 rounded bg-slate-900 border border-slate-800 font-mono text-[10px]"
                          >
                            <span className="text-slate-500">{t.trait_type}: </span>
                            <span className="text-emerald-300">{t.value}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Live XLS-24d Linter */}
            <div className="hud-panel rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-emerald-300">
                  XLS-20 / XLS-24d Preflight Linter
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                    mintLint.ok
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/40'
                      : 'bg-rose-500/15 text-rose-300 border border-rose-400/40'
                  }`}
                >
                  {mintLint.ok ? 'READY TO MINT' : 'FIX ERRORS'}
                </span>
              </div>
              <div className="space-y-1.5">
                {mintLint.issues.map((iss, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2 p-2 rounded-lg text-[11px] font-mono border ${
                      iss.severity === 'error'
                        ? 'bg-rose-500/10 border-rose-400/40 text-rose-200'
                        : iss.severity === 'warning'
                          ? 'bg-amber-500/10 border-amber-400/35 text-amber-200'
                          : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                    }`}
                  >
                    {iss.severity === 'pass' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    )}
                    <span>{iss.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 2: COLLECTION BATCH MINTER & RESERVE CALCULATOR              */}
      {/* ==================================================================== */}
      {tab === 'collection' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7 hud-panel rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-fuchsia-300">
                  Collection Manifest Source ({collectionItems.length} NFTs)
                </span>
                <div className="flex gap-1.5 font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={() => setColSourceMode('sequential')}
                    className={`px-2.5 py-1 rounded border ${
                      colSourceMode === 'sequential'
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Sequential IPFS CID
                  </button>
                  <button
                    type="button"
                    onClick={() => setColSourceMode('csv')}
                    className={`px-2.5 py-1 rounded border ${
                      colSourceMode === 'csv'
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    CSV Manifest + Traits
                  </button>
                </div>
              </div>

              {colSourceMode === 'sequential' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={colName}
                    onChange={(e) => setColName(e.target.value)}
                    placeholder="Collection Name"
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                  />
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={colCount}
                    onChange={(e) => setColCount(e.target.value)}
                    placeholder="Supply (1-500)"
                    className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                  />
                  <input
                    type="text"
                    value={colBaseUri}
                    onChange={(e) => setColBaseUri(e.target.value)}
                    placeholder="Base IPFS URI (e.g. ipfs://<CID>)"
                    className="md:col-span-2 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-cyan-200"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono text-slate-400">
                    Format: <code className="text-cyan-300">Name, ipfs://.../1.json, Trait1:Val1|Trait2:Val2</code>
                  </div>
                  <textarea
                    rows={6}
                    value={colCsvText}
                    onChange={(e) => setColCsvText(e.target.value)}
                    spellCheck={false}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2.5 text-xs font-mono text-emerald-200"
                  />
                  {parsedCsvCollection.errors.length > 0 && (
                    <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-400/40 text-[11px] font-mono text-rose-200">
                      {parsedCsvCollection.errors.slice(0, 3).join(' • ')}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Collection Taxon</label>
                  <input
                    type="number"
                    min={0}
                    value={colTaxon}
                    onChange={(e) => setColTaxon(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Royalty %</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={colRoyaltyPct}
                    onChange={(e) => setColRoyaltyPct(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const bundle = collectionItems.map((it) =>
                      buildXls24dMetadata({
                        name: it.name,
                        description: nftDescription,
                        imageUri: it.uriText.replace(/\.json$/i, '.png'),
                        collectionName: colName,
                        attributes: it.traits,
                      })
                    );
                    downloadTextFile(
                      `${(colName || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-metadata-bundle.json`,
                      JSON.stringify(bundle, null, 2)
                    );
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-cyan-200 hover:border-cyan-400/50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Metadata Bundle (.json)
                </button>

                {!batchRunning ? (
                  <button
                    type="button"
                    disabled={!activeAccount || collectionItems.length === 0}
                    onClick={() => void runBatchMint()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-fuchsia-500/25 border border-fuchsia-400/60 text-xs font-mono font-semibold text-fuchsia-100 hover:bg-fuchsia-500/35 disabled:opacity-40"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {activeAccount?.kind === 'custodial' && vaultStatus.unlocked
                      ? `Batch Mint ${collectionItems.length} NFTs`
                      : `Preview First NFT in TxConfirmModal`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      batchAbortRef.current = true;
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-rose-500/25 border border-rose-400 text-xs font-mono font-semibold text-rose-100"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Abort Batch Mint
                  </button>
                )}
              </div>
            </div>

            {/* Exact XLS-20 NFTokenPage Reserve Calculator */}
            <div className="xl:col-span-5 hud-panel rounded-xl p-4 space-y-3 border border-cyan-400/25">
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                XLS-20 NFTokenPage Reserve &amp; Cost Planner
              </div>
              <p className="text-[11px] text-slate-400">
                XRPL packs <strong>16–32 NFTs per 0.2 XRP NFTokenPage</strong> — making collections dramatically
                cheaper than per-object reserves.
              </p>

              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500">NFTokenPages Needed</div>
                  <div className="text-white font-bold">
                    {collectionCosts.minPages} – {collectionCosts.maxPages} pages
                  </div>
                </div>
                <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500">Page Reserve (Refundable)</div>
                  <div className="text-cyan-300 font-bold">
                    {collectionCosts.minPageReserveXrp} – {collectionCosts.maxPageReserveXrp} XRP
                  </div>
                </div>
                <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500">Est. Network Burn Fees</div>
                  <div className="text-emerald-300 font-bold">{collectionCosts.estimatedNetworkFeesXrp} XRP</div>
                </div>
                <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500">Simultaneous Offer Reserve</div>
                  <div className="text-amber-300 font-bold">{collectionCosts.optionalOfferReserveXrp} XRP</div>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={colIncludeOffers}
                  onChange={(e) => setColIncludeOffers(e.target.checked)}
                />
                Include simultaneous Sell-Offer reserve (+0.2 XRP/listed NFT)
              </label>

              <div className="rounded-xl bg-cyan-500/10 border border-cyan-400/30 p-3 font-mono flex items-center justify-between">
                <span className="text-xs text-slate-300">Conservative Total Required</span>
                <div className="text-right">
                  <div className="text-sm font-bold text-cyan-200">{collectionCosts.totalConservativeXrp} XRP</div>
                  {marketPrice.xrpUsd !== null && (
                    <div className="text-[10px] text-emerald-300">
                      ≈ {formatUsd(collectionCosts.totalConservativeXrp * marketPrice.xrpUsd)} USD
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {batchResults.length > 0 && (
            <div className="hud-panel rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-emerald-300">
                  Mint Execution Log ({batchResults.filter((r) => r.status === 'minted').length}/{batchResults.length}{' '}
                  minted)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      `xrpl-nft-mint-receipt-${new Date().toISOString().slice(0, 10)}.csv`,
                      buildNftMintReceiptCsv(batchResults),
                      'text/csv'
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono text-cyan-200"
                >
                  <Download className="w-3 h-3" />
                  Export Receipt CSV
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[11px]">
                {batchResults.map((r) => (
                  <div
                    key={r.index}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950/80 border border-slate-800"
                  >
                    <span className="text-white truncate">{r.name}</span>
                    <span
                      className={
                        r.status === 'minted'
                          ? 'text-emerald-300'
                          : r.status === 'failed'
                            ? 'text-rose-300'
                            : 'text-slate-400'
                      }
                    >
                      {r.status === 'minted'
                        ? `MINTED (${shortenAddress(r.txHash ?? '', 6, 4)})`
                        : r.error ?? 'PENDING'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 3: RARITY ANALYZER & BULK SELL-OFFER / WHITELIST AIRDROP     */}
      {/* ==================================================================== */}
      {tab === 'rarity-offers' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Trait Rarity & Distribution Analyzer */}
          <div className="xl:col-span-6 hud-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
                <Award className="w-4 h-4" />
                Collection Rarity &amp; Trait Distribution Analyzer
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Analyzing {rarityReport.totalItems} CSV items
              </span>
            </div>

            {rarityReport.warnings.length > 0 && (
              <div className="space-y-1">
                {rarityReport.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-lg bg-amber-500/10 border border-amber-400/35 text-[11px] font-mono text-amber-200"
                  >
                    {w}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase text-slate-400">Rarest Traits</div>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1 font-mono text-[11px]">
                  {rarityReport.traitBreakdown.map((row, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-2 py-1 rounded bg-slate-950/80 border border-slate-800"
                    >
                      <span className="text-slate-300 truncate">
                        {row.traitType}: <strong className="text-white">{row.value}</strong>
                      </span>
                      <span className="text-cyan-300 shrink-0">{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase text-slate-400">Top Ranked Items</div>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1 font-mono text-[11px]">
                  {rarityReport.rankedItems.slice(0, 12).map((item) => (
                    <div
                      key={item.index}
                      className="flex items-center justify-between px-2 py-1 rounded bg-slate-950/80 border border-slate-800"
                    >
                      <span className="text-slate-200 truncate">{item.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          item.tier === 'Mythic'
                            ? 'bg-fuchsia-500/20 text-fuchsia-200'
                            : item.tier === 'Legendary'
                              ? 'bg-amber-500/20 text-amber-200'
                              : item.tier === 'Rare'
                                ? 'bg-cyan-500/20 text-cyan-200'
                                : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {item.tier} ({item.rarityScore})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Post-Mint Bulk Sell-Offer & Whitelist Airdrop Queue */}
          <div className="xl:col-span-6 hud-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
              <Send className="w-4 h-4" />
              Post-Mint Bulk Sell-Offer &amp; Whitelist Airdrop Queue
            </div>
            <p className="text-[11px] text-slate-400">
              Paste <code className="text-cyan-300">NFTokenID, PriceXRP [, Recipient_rAddress]</code>. Set Price ={' '}
              <code className="text-emerald-300">0</code> with a recipient r-address to send a zero-cost Whitelist NFT
              Airdrop!
            </p>
            <textarea
              rows={5}
              value={offerBatchCsv}
              onChange={(e) => setOfferBatchCsv(e.target.value)}
              spellCheck={false}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2.5 text-xs font-mono text-cyan-200"
            />
            {parsedOffers.errors.length > 0 && (
              <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-400/40 text-[11px] font-mono text-rose-200">
                {parsedOffers.errors.slice(0, 3).join(' • ')}
              </div>
            )}
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {parsedOffers.rows.map((row, idx) => (
                <div
                  key={`${row.nftokenId}-${idx}`}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-xs"
                >
                  <div className="min-w-0">
                    <div className="text-white truncate">{shortenAddress(row.nftokenId, 10, 8)}</div>
                    <div className="text-[10px] text-slate-400">
                      {row.amountXrp === '0' ? 'AIRDROP (0 XRP)' : `LIST: ${row.amountXrp} XRP`}
                      {row.destination ? ` → ${shortenAddress(row.destination, 6, 4)}` : ' (Open Marketplace)'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!activeAccount}
                    onClick={() => activeAccount && void openTxConfirmModal(activeAccount.id, row.intent)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-[11px] text-emerald-200 shrink-0"
                  >
                    Preview &amp; Sign
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 4: CREATOR PLAYBOOK — WHAT SELLS BEST ON XRPL                */}
      {/* ==================================================================== */}
      {tab === 'playbook' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {XRPL_NFT_PLAYBOOK_CATEGORIES.map((cat) => (
              <div key={cat.id} className="hud-panel rounded-xl p-4 space-y-2.5 border border-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-bold text-white">{cat.title}</h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                      cat.demandLevel === 'High Demand'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/40'
                        : cat.demandLevel === 'Strong Niche'
                          ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/40'
                          : 'bg-amber-500/15 text-amber-200 border border-amber-400/40'
                    }`}
                  >
                    {cat.demandLevel}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
                  <div className="rounded bg-slate-950 border border-slate-800 p-1.5">
                    <div className="text-slate-500">Supply</div>
                    <div className="text-cyan-200">{cat.idealSupply}</div>
                  </div>
                  <div className="rounded bg-slate-950 border border-slate-800 p-1.5">
                    <div className="text-slate-500">Royalty</div>
                    <div className="text-emerald-300">{cat.royaltySweetSpot}</div>
                  </div>
                  <div className="rounded bg-slate-950 border border-slate-800 p-1.5">
                    <div className="text-slate-500">Mint Price</div>
                    <div className="text-white">{cat.pricingRange}</div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">{cat.whyItSells}</p>
                <div className="p-2 rounded-lg bg-fuchsia-500/10 border border-fuchsia-400/25 text-[11px] text-fuchsia-200">
                  <strong>Pro Tip:</strong> {cat.proTip}
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Pre-Launch Checklist */}
          <div className="hud-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
                <ShieldCheck className="w-4 h-4" />
                Pre-Launch XRPL NFT Checklist ({completedChecklistCount}/{XRPL_NFT_LAUNCH_CHECKLIST.length} Complete)
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {XRPL_NFT_LAUNCH_CHECKLIST.map((step) => {
                const done = Boolean(checkedSteps[step.id]);
                return (
                  <label
                    key={step.id}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                      done
                        ? 'bg-emerald-500/10 border-emerald-400/40'
                        : 'bg-slate-950/75 border-slate-800 hover:border-cyan-400/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggleChecklistStep(step.id)}
                      className="mt-0.5 accent-emerald-400"
                    />
                    <div>
                      <div className={`text-xs font-semibold ${done ? 'text-emerald-200 line-through' : 'text-white'}`}>
                        {step.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{step.detail}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
