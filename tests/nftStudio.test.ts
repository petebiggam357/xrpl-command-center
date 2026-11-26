import { describe, expect, it } from 'vitest';
import {
  analyzeCollectionRarity,
  buildNftMintReceiptCsv,
  buildXls24dMetadata,
  estimateNftCollectionCosts,
  generateSequentialCollectionItems,
  lintNftMintConfig,
  parseNftCollectionCsv,
  parseNftOfferBatchCsv,
  XLS24D_SCHEMA_URI,
  XRPL_NFT_LAUNCH_CHECKLIST,
  XRPL_NFT_PLAYBOOK_CATEGORIES,
} from '../src/shared/nftStudioUtils';

describe('v0.2.5-beta XLS-20 NFT Studio & Collection Launchpad', () => {
  it('builds valid XLS-24d metadata JSON and strips blank traits', () => {
    const meta = buildXls24dMetadata({
      name: 'Genesis #1',
      description: 'Original XRPL collectible',
      imageUri: 'ipfs://bafy123/1.png',
      collectionName: 'Voyagers',
      attributes: [
        { trait_type: 'Tier', value: 'Mythic' },
        { trait_type: '', value: 'Ignored' },
      ],
    });
    expect(meta.schema).toBe(XLS24D_SCHEMA_URI);
    expect(meta.collection?.name).toBe('Voyagers');
    expect(meta.attributes).toEqual([{ trait_type: 'Tier', value: 'Mythic' }]);
  });

  it('lints XRPL 256-byte URI limit, non-zero royalty without tfTransferable, and IPFS immutability', () => {
    const okRes = lintNftMintConfig({
      name: 'Art #1',
      uriText: 'ipfs://bafy123/1.json',
      taxon: 1001,
      royaltyPct: 5,
      transferable: true,
      onlyXrp: false,
    });
    expect(okRes.ok).toBe(true);

    const tooLong = lintNftMintConfig({
      name: 'Art #2',
      uriText: `ipfs://${'a'.repeat(260)}`,
      taxon: 1001,
      royaltyPct: 5,
      transferable: true,
      onlyXrp: false,
    });
    expect(tooLong.ok).toBe(false);
    expect(tooLong.issues.some((i) => i.severity === 'error' && i.message.includes('256-byte'))).toBe(true);

    const royaltyConflict = lintNftMintConfig({
      name: 'Soulbound',
      uriText: 'ipfs://bafy123/1.json',
      taxon: 1001,
      royaltyPct: 5,
      transferable: false,
      onlyXrp: false,
    });
    expect(royaltyConflict.ok).toBe(false);
  });

  it('calculates exact XLS-20 NFTokenPage reserves (16-32 NFTs per 0.2 XRP page)', () => {
    const est = estimateNftCollectionCosts(64, false);
    expect(est.minPages).toBe(2);
    expect(est.maxPages).toBe(4);
    expect(est.minPageReserveXrp).toBe(0.4);
    expect(est.maxPageReserveXrp).toBe(0.8);

    const withOffers = estimateNftCollectionCosts(10, true);
    expect(withOffers.optionalOfferReserveXrp).toBe(2);
  });

  it('generates sequential IPFS collection items and parses CSV manifests with traits', () => {
    const seq = generateSequentialCollectionItems({
      collectionName: 'Voyagers',
      baseUri: 'ipfs://bafyCID/',
      count: 3,
      startIndex: 1,
    });
    expect(seq).toHaveLength(3);
    expect(seq[2].uriText).toBe('ipfs://bafyCID/3.json');

    const csv = parseNftCollectionCsv(
      'Name,URI,Traits\n' +
        'Alpha #1,ipfs://bafy1/1.json,Tier:Mythic|Color:Gold\n' +
        'Alpha #2,ipfs://bafy1/2.json,Tier:Common|Color:Blue'
    );
    expect(csv.errors).toHaveLength(0);
    expect(csv.items).toHaveLength(2);
    expect(csv.items[0].traits).toHaveLength(2);
  });

  it('computes trait distribution percentages, rarity scores, and duplicate/uniform warnings', () => {
    const csv = parseNftCollectionCsv(
      'A #1,ipfs://cid/1.json,Bg:Space|Hat:Crown\n' +
        'A #2,ipfs://cid/2.json,Bg:Space|Hat:Cap\n' +
        'A #3,ipfs://cid/3.json,Bg:Space|Hat:Cap'
    );
    const report = analyzeCollectionRarity(csv.items);
    expect(report.totalItems).toBe(3);
    expect(report.rankedItems[0].name).toBe('A #1');
    expect(report.warnings.some((w) => w.includes('duplicate'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('100%'))).toBe(true);
  });

  it('parses bulk NFTokenCreateOffer fixed-price listings and 0-XRP whitelist airdrops', () => {
    const validId = '0'.repeat(64);
    const parsed = parseNftOfferBatchCsv(
      'rIssuer111111111111111111111111111',
      `${validId},25\n${validId},0,rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe`
    );
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].amountXrp).toBe('25');
    expect(parsed.rows[0].destination).toBeUndefined();
    expect(parsed.rows[1].amountXrp).toBe('0');
    expect(parsed.rows[1].destination).toBe('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe');
  });

  it('builds a properly escaped mint receipt CSV', () => {
    const csv = buildNftMintReceiptCsv([
      { index: 1, name: 'Art "One"', uriText: 'ipfs://cid/1.json', status: 'minted', txHash: 'ABC123' },
    ]);
    expect(csv).toContain('Index,Name,URI,Status,TxHash,Error');
    expect(csv).toContain('"Art ""One"""');
    expect(csv).toContain('"ABC123"');
  });

  it('provides curated XRPL creator playbook categories and pre-launch checklist', () => {
    expect(XRPL_NFT_PLAYBOOK_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    expect(XRPL_NFT_LAUNCH_CHECKLIST.length).toBeGreaterThanOrEqual(6);
  });
});
