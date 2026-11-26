import type { WalletTxIntent } from './types';

// ============================================================================
// XRPL XLS-20 / XLS-24d NFT Studio & Collection Launchpad Engine
// ============================================================================

export interface NftTrait {
  trait_type: string;
  value: string;
}

export interface Xls24dMetadataInput {
  name: string;
  description: string;
  imageUri: string;
  animationUri?: string;
  externalUrl?: string;
  collectionName?: string;
  collectionFamily?: string;
  attributes: NftTrait[];
}

export interface Xls24dMetadataJson {
  schema: string;
  nftType: string;
  name: string;
  description: string;
  image: string;
  animation?: string;
  external_url?: string;
  collection?: {
    name: string;
    family?: string;
  };
  attributes: NftTrait[];
}

export const XLS24D_SCHEMA_URI = 'ipfs://QmNpi8rcXEkohca8iS7zysKgzJYqCvTpLS8L3t5g1B8d2C';

export function buildXls24dMetadata(input: Xls24dMetadataInput): Xls24dMetadataJson {
  const cleanAttrs = input.attributes
    .map((a) => ({
      trait_type: a.trait_type.trim(),
      value: a.value.trim(),
    }))
    .filter((a) => a.trait_type.length > 0 && a.value.length > 0);

  const meta: Xls24dMetadataJson = {
    schema: XLS24D_SCHEMA_URI,
    nftType: 'art.v0',
    name: input.name.trim() || 'Untitled XRPL NFT',
    description: input.description.trim(),
    image: input.imageUri.trim(),
    attributes: cleanAttrs,
  };

  if (input.animationUri?.trim()) meta.animation = input.animationUri.trim();
  if (input.externalUrl?.trim()) meta.external_url = input.externalUrl.trim();
  if (input.collectionName?.trim()) {
    meta.collection = {
      name: input.collectionName.trim(),
      ...(input.collectionFamily?.trim() ? { family: input.collectionFamily.trim() } : {}),
    };
  }
  return meta;
}

export interface NftLintIssue {
  severity: 'error' | 'warning' | 'pass';
  message: string;
}

export interface NftMintLintReport {
  ok: boolean;
  uriByteLength: number;
  issues: NftLintIssue[];
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function lintNftMintConfig(params: {
  name: string;
  uriText: string;
  taxon: number;
  royaltyPct: number;
  transferable: boolean;
  onlyXrp: boolean;
}): NftMintLintReport {
  const issues: NftLintIssue[] = [];
  const uri = params.uriText.trim();
  const uriBytes = utf8ByteLength(uri);

  if (!params.name.trim()) {
    issues.push({ severity: 'warning', message: 'Add an NFT Name so marketplaces display a clean title.' });
  }

  if (!uri) {
    issues.push({ severity: 'error', message: 'Metadata URI is required (e.g. ipfs://<CID>/metadata.json).' });
  } else if (uriBytes > 256) {
    issues.push({
      severity: 'error',
      message: `URI is ${uriBytes} bytes — XRPL enforces a strict 256-byte maximum for NFTokenMint URI.`,
    });
  } else if (uri.startsWith('ipfs://') || uri.startsWith('ar://')) {
    issues.push({
      severity: 'pass',
      message: `Immutable content-addressed URI (${uriBytes}/256 bytes).`,
    });
  } else if (uri.startsWith('https://')) {
    issues.push({
      severity: 'warning',
      message: 'HTTPS URIs are mutable and can break if a server goes down. Pin to IPFS (ipfs://) for collector trust.',
    });
  } else {
    issues.push({
      severity: 'warning',
      message: 'Non-standard URI scheme — marketplaces like XRP.cafe and Bithomp expect ipfs:// or https://.',
    });
  }

  if (!Number.isInteger(params.taxon) || params.taxon < 0 || params.taxon > 4_294_967_295) {
    issues.push({ severity: 'error', message: 'NFTokenTaxon must be an integer between 0 and 4,294,967,295.' });
  } else if (params.taxon === 0) {
    issues.push({
      severity: 'warning',
      message: 'Taxon 0 is the default. Pick a unique non-zero Taxon (e.g. 1001) to group this collection cleanly.',
    });
  } else {
    issues.push({ severity: 'pass', message: `Collection Taxon #${params.taxon} configured.` });
  }

  if (!params.transferable) {
    issues.push({
      severity: 'warning',
      message: 'tfTransferable is OFF — buyers will NOT be able to resell this NFT on secondary marketplaces (Soulbound).',
    });
  } else {
    issues.push({ severity: 'pass', message: 'tfTransferable ON — eligible for secondary marketplace trading.' });
  }

  if (params.royaltyPct < 0 || params.royaltyPct > 50) {
    issues.push({ severity: 'error', message: 'XRPL TransferFee royalty must be between 0% and 50%.' });
  } else if (params.royaltyPct > 0 && !params.transferable) {
    issues.push({
      severity: 'error',
      message: 'XRPL rejects non-zero TransferFee unless tfTransferable is enabled.',
    });
  } else if (params.royaltyPct > 10) {
    issues.push({
      severity: 'warning',
      message: `${params.royaltyPct}% royalty is above the 2.5%–7.5% XRPL market sweet spot and may reduce secondary volume.`,
    });
  } else {
    issues.push({
      severity: 'pass',
      message: `Royalty ${params.royaltyPct}% (${Math.round(params.royaltyPct * 1000)} XRPL TransferFee units).`,
    });
  }

  if (params.onlyXrp) {
    issues.push({ severity: 'pass', message: 'tfOnlyXRP ON — offers can only be priced in native XRP.' });
  }

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    uriByteLength: uriBytes,
    issues,
  };
}

// ============================================================================
// XLS-20 NFTokenPage Reserve & Collection Cost Estimator
// ============================================================================

export interface NftCollectionCostEstimate {
  itemCount: number;
  minPages: number; // Best-case packing: 32 NFTs per NFTokenPage
  maxPages: number; // Conservative packing: 16 NFTs per NFTokenPage
  minPageReserveXrp: number;
  maxPageReserveXrp: number;
  estimatedNetworkFeesXrp: number;
  optionalOfferReserveXrp: number; // If creating 1 sell offer per NFT simultaneously
  totalConservativeXrp: number;
}

export function estimateNftCollectionCosts(
  itemCount: number,
  includeSimultaneousOffers = false
): NftCollectionCostEstimate {
  const n = Math.max(1, Math.min(10_000, Math.floor(itemCount || 1)));
  const minPages = Math.ceil(n / 32);
  const maxPages = Math.ceil(n / 16);
  const minPageReserveXrp = Number((minPages * 0.2).toFixed(2));
  const maxPageReserveXrp = Number((maxPages * 0.2).toFixed(2));
  const estimatedNetworkFeesXrp = Number((n * 0.000012).toFixed(6));
  const optionalOfferReserveXrp = includeSimultaneousOffers ? Number((n * 0.2).toFixed(2)) : 0;
  const totalConservativeXrp = Number(
    (maxPageReserveXrp + estimatedNetworkFeesXrp + optionalOfferReserveXrp).toFixed(4)
  );

  return {
    itemCount: n,
    minPages,
    maxPages,
    minPageReserveXrp,
    maxPageReserveXrp,
    estimatedNetworkFeesXrp,
    optionalOfferReserveXrp,
    totalConservativeXrp,
  };
}

// ============================================================================
// Collection Manifest Builder & CSV Parser
// ============================================================================

export interface CollectionMintItem {
  index: number;
  name: string;
  uriText: string;
  traits: NftTrait[];
}

export function generateSequentialCollectionItems(params: {
  collectionName: string;
  baseUri: string;
  count: number;
  startIndex?: number;
  suffix?: string;
}): CollectionMintItem[] {
  const count = Math.max(1, Math.min(500, Math.floor(params.count || 1)));
  const start = Math.max(0, Math.floor(params.startIndex ?? 1));
  const cleanBase = params.baseUri.trim().replace(/\/+$/, '');
  const suffix = params.suffix ?? '.json';
  const col = params.collectionName.trim() || 'XRPL Collection';

  const items: CollectionMintItem[] = [];
  for (let i = 0; i < count; i++) {
    const num = start + i;
    items.push({
      index: num,
      name: `${col} #${num}`,
      uriText: cleanBase ? `${cleanBase}/${num}${suffix}` : '',
      traits: [],
    });
  }
  return items;
}

/**
 * Parses CSV/TSV lines: `name,uri[,Trait1:Value1|Trait2:Value2]`
 */
export function parseNftCollectionCsv(rawText: string): {
  items: CollectionMintItem[];
  errors: string[];
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const items: CollectionMintItem[] = [];
  const errors: string[] = [];

  lines.forEach((line, idx) => {
    // Skip header row if present
    if (idx === 0 && /^name\s*[,\t]/i.test(line)) return;

    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    if (parts.length < 2) {
      errors.push(`Line ${idx + 1}: expected "name,uri[,Trait:Value|Trait2:Value2]"`);
      return;
    }
    const name = parts[0].trim();
    const uriText = parts[1].trim();
    const traitsRaw = parts.slice(2).join(',').trim();

    if (!uriText) {
      errors.push(`Line ${idx + 1}: missing metadata URI`);
      return;
    }
    if (utf8ByteLength(uriText) > 256) {
      errors.push(`Line ${idx + 1}: URI exceeds XRPL 256-byte limit`);
      return;
    }

    const traits: NftTrait[] = traitsRaw
      ? traitsRaw
          .split('|')
          .map((pair) => {
            const colon = pair.indexOf(':');
            if (colon <= 0) return null;
            return {
              trait_type: pair.slice(0, colon).trim(),
              value: pair.slice(colon + 1).trim(),
            };
          })
          .filter((t): t is NftTrait => Boolean(t && t.trait_type && t.value))
      : [];

    items.push({
      index: items.length + 1,
      name: name || `Item #${items.length + 1}`,
      uriText,
      traits,
    });
  });

  return { items, errors };
}

// ============================================================================
// Trait Rarity & Distribution Analyzer
// ============================================================================

export interface TraitDistributionRow {
  traitType: string;
  value: string;
  count: number;
  pct: number;
}

export interface ScoredNftItem {
  index: number;
  name: string;
  rarityScore: number;
  tier: 'Mythic' | 'Legendary' | 'Rare' | 'Common';
}

export interface CollectionRarityReport {
  totalItems: number;
  traitBreakdown: TraitDistributionRow[];
  rankedItems: ScoredNftItem[];
  warnings: string[];
}

export function analyzeCollectionRarity(items: CollectionMintItem[]): CollectionRarityReport {
  const total = items.length;
  if (total === 0) {
    return { totalItems: 0, traitBreakdown: [], rankedItems: [], warnings: [] };
  }

  const counts = new Map<string, { traitType: string; value: string; count: number }>();
  const signatures = new Map<string, number>();

  for (const item of items) {
    const sig = item.traits
      .map((t) => `${t.trait_type.toLowerCase()}=${t.value.toLowerCase()}`)
      .sort()
      .join('|');
    if (sig) {
      signatures.set(sig, (signatures.get(sig) ?? 0) + 1);
    }

    for (const t of item.traits) {
      const key = `${t.trait_type}:::${t.value}`;
      const prev = counts.get(key) ?? { traitType: t.trait_type, value: t.value, count: 0 };
      prev.count += 1;
      counts.set(key, prev);
    }
  }

  const traitBreakdown: TraitDistributionRow[] = Array.from(counts.values())
    .map((entry) => ({
      ...entry,
      pct: Number(((entry.count / total) * 100).toFixed(2)),
    }))
    .sort((a, b) => a.pct - b.pct || a.traitType.localeCompare(b.traitType));

  const scored = items
    .map((item) => {
      let score = 0;
      for (const t of item.traits) {
        const c = counts.get(`${t.trait_type}:::${t.value}`)?.count ?? total;
        score += total / Math.max(1, c);
      }
      return { index: item.index, name: item.name, rarityScore: Number(score.toFixed(2)) };
    })
    .sort((a, b) => b.rarityScore - a.rarityScore);

  const rankedItems: ScoredNftItem[] = scored.map((item, rankIdx) => {
    const percentile = (rankIdx + 1) / total;
    const tier: ScoredNftItem['tier'] =
      percentile <= 0.05
        ? 'Mythic'
        : percentile <= 0.15
          ? 'Legendary'
          : percentile <= 0.4
            ? 'Rare'
            : 'Common';
    return { ...item, tier };
  });

  const warnings: string[] = [];
  const dupCount = Array.from(signatures.values()).filter((c) => c > 1).length;
  if (dupCount > 0) {
    warnings.push(`${dupCount} duplicate trait combination(s) detected — consider adding unique traits for collector value.`);
  }
  const uniformTraits = traitBreakdown.filter((t) => t.pct === 100 && total > 1);
  if (uniformTraits.length > 0) {
    warnings.push(
      `${uniformTraits.length} trait(s) appear on 100% of items (${uniformTraits.map((u) => u.traitType).join(', ')}) and add no rarity differentiation.`
    );
  }
  const missingTraitItems = items.filter((i) => i.traits.length === 0).length;
  if (missingTraitItems > 0) {
    warnings.push(`${missingTraitItems} of ${total} item(s) have no traits defined.`);
  }

  return { totalItems: total, traitBreakdown, rankedItems, warnings };
}

// ============================================================================
// Post-Mint Bulk Sell-Offer & Whitelist Airdrop Queue
// ============================================================================

export interface BulkNftOfferRow {
  nftokenId: string;
  amountXrp: string;
  destination?: string;
  intent: Extract<WalletTxIntent, { kind: 'NFTokenCreateOffer' }>;
}

/**
 * Parses CSV lines: `nftoken_id,price_xrp[,destination_r_address]`
 * Set price_xrp = 0 with a destination_r_address for a whitelist NFT airdrop!
 */
export function parseNftOfferBatchCsv(
  account: string,
  rawText: string
): { rows: BulkNftOfferRow[]; errors: string[] } {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const rows: BulkNftOfferRow[] = [];
  const errors: string[] = [];

  lines.forEach((line, idx) => {
    if (idx === 0 && /^nftoken/i.test(line)) return;
    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    const nftokenId = (parts[0] ?? '').trim().toUpperCase();
    const priceStr = (parts[1] ?? '').trim();
    const dest = (parts[2] ?? '').trim() || undefined;

    if (!/^[0-9A-F]{64}$/.test(nftokenId)) {
      errors.push(`Line ${idx + 1}: invalid 64-hex NFTokenID`);
      return;
    }
    const priceNum = Number(priceStr);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      errors.push(`Line ${idx + 1}: price_xrp must be >= 0`);
      return;
    }
    if (dest && !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(dest)) {
      errors.push(`Line ${idx + 1}: invalid destination r-address`);
      return;
    }

    rows.push({
      nftokenId,
      amountXrp: String(priceNum),
      destination: dest,
      intent: {
        kind: 'NFTokenCreateOffer',
        account,
        nftokenId,
        amountXrp: String(priceNum),
        destination: dest,
        isSellOffer: true,
      },
    });
  });

  return { rows, errors };
}

export function buildNftMintReceiptCsv(
  results: Array<{
    index: number;
    name: string;
    uriText: string;
    status: string;
    txHash?: string;
    error?: string;
  }>
): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = 'Index,Name,URI,Status,TxHash,Error';
  const rows = results.map((r) =>
    [
      String(r.index),
      esc(r.name),
      esc(r.uriText),
      esc(r.status),
      esc(r.txHash ?? ''),
      esc(r.error ?? ''),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

// ============================================================================
// Creator Playbook: What Sells Best on XRPL & Launch Best Practices
// ============================================================================

export interface NftPlaybookCategory {
  id: string;
  title: string;
  demandLevel: 'High Demand' | 'Strong Niche' | 'Selective';
  idealSupply: string;
  royaltySweetSpot: string;
  pricingRange: string;
  whyItSells: string;
  proTip: string;
}

export const XRPL_NFT_PLAYBOOK_CATEGORIES: NftPlaybookCategory[] = [
  {
    id: 'utility-pass',
    title: 'Utility & Membership Passes',
    demandLevel: 'High Demand',
    idealSupply: '100 – 1,000',
    royaltySweetSpot: '5%',
    pricingRange: '25 – 250 XRP',
    whyItSells:
      'XRPL collectors strongly favor NFTs with verifiable perks: gated tools, fee discounts, DAO voting, event access, or partner token airdrops.',
    proTip:
      'Deliver at least one concrete utility on Day 1 instead of promising a 12-month roadmap.',
  },
  {
    id: 'gaming-assets',
    title: 'Gaming & Interactive Assets',
    demandLevel: 'High Demand',
    idealSupply: '500 – 5,000',
    royaltySweetSpot: '2.5% – 5%',
    pricingRange: '5 – 80 XRP',
    whyItSells:
      'XRPL closes in ~3.5s with sub-cent fees and native XLS-20 royalties—ideal for high-velocity in-game items, skins, and playable characters.',
    proTip:
      'Keep metadata traits structured (Attack, Element, Tier) so third-party games and marketplaces can filter cleanly.',
  },
  {
    id: 'phygital-rwa',
    title: 'Phygital & RWA Collectibles',
    demandLevel: 'Strong Niche',
    idealSupply: '25 – 500',
    royaltySweetSpot: '5% – 7.5%',
    pricingRange: '50 – 500+ XRP',
    whyItSells:
      'Limited physical art prints, merch, wine, music vinyl, or redeemable vouchers backed by an on-ledger XLS-20 receipt have clear real-world value.',
    proTip:
      'Use tfBurnable if holders burn the NFT to redeem the physical item, and document the redemption process in xrp-ledger.toml.',
  },
  {
    id: 'fine-art-1of1',
    title: 'Curated 1-of-1 Fine Art & Photography',
    demandLevel: 'Strong Niche',
    idealSupply: '1 – 25 Editions',
    royaltySweetSpot: '7.5% – 10%',
    pricingRange: '40 – 400 XRP',
    whyItSells:
      'Original visual storytelling, high-resolution animation, and authentic artist provenance consistently outperform generic AI-generated spam.',
    proTip:
      'Always pin full-resolution artwork to IPFS first and include an animated preview or process story in the description.',
  },
  {
    id: 'community-pfp',
    title: 'Tight-Supply Community PFP Drops',
    demandLevel: 'Selective',
    idealSupply: '333 – 1,500',
    royaltySweetSpot: '5%',
    pricingRange: '15 – 60 XRP',
    whyItSells:
      'Smaller, well-curated PFP collections (333–1,000 items) sell out far more reliably on XRPL than bloated 10,000-piece mints.',
    proTip:
      'Run the Rarity Analyzer before minting to verify distinct Mythic/Legendary 1-of-1s and zero duplicate trait combos.',
  },
];

export const XRPL_NFT_LAUNCH_CHECKLIST: Array<{ id: string; title: string; detail: string }> = [
  {
    id: 'pin-ipfs',
    title: 'Pin artwork & XLS-24d JSON to IPFS before minting',
    detail: 'Use Pinata, Filebase, or NFT.Storage and verify the ipfs:// CID loads cleanly. Never mint with temporary HTTP links.',
  },
  {
    id: 'check-transferable',
    title: 'Enable tfTransferable (unless intentionally Soulbound)',
    detail: 'If tfTransferable is OFF, buyers can never resell the NFT on XRP.cafe, Sologenic, or Bithomp — and XRPL rejects non-zero royalties.',
  },
  {
    id: 'unique-taxon',
    title: 'Assign a dedicated non-zero NFTokenTaxon',
    detail: 'Marketplaces group collections by (Issuer Address + NFTokenTaxon). Use a fresh taxon for each distinct drop.',
  },
  {
    id: 'verify-domain',
    title: 'Verify issuer Domain + /.well-known/xrp-ledger.toml',
    detail: 'Set your AccountSet Domain in the Institutional tab so marketplaces display your verified creator badge.',
  },
  {
    id: 'testnet-dryrun',
    title: 'Test-mint 1 item on XRPL Testnet first',
    detail: 'Switch to Testnet, fund via the 1-Click Faucet, mint 1 sample NFT, and verify its metadata & image render properly before Mainnet.',
  },
  {
    id: 'listing-strategy',
    title: 'Seed initial liquidity via fixed-price Sell Offers or Whitelist Airdrops',
    detail: 'Use the Bulk Offers & Airdrops tab to list on-ledger with zero middleman fees or reward early community supporters with 0-XRP offers.',
  },
];
