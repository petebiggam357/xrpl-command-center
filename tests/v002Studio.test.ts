import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsSqliteService } from '../electron/analyticsService';
import { buildXrplTransactionFromIntent } from '../electron/walletVaultService';
import {
  buildLedgerGetAddressApdu,
  buildLedgerSignTxApdus,
  computeUnifiedLineDiff,
  encodeBip32Path,
  frameHidPackets,
  generateRippledConfigBundle,
  generateXrpLedgerToml,
  serializeRowsToCsv,
  simulateAmmConstantProductSwap,
  validateXrpLedgerToml,
} from '../src/shared/studioUtils';

describe('v0.0.2-alpha 5-Track Studio & Analytics Suite', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xrpl-cc-v002-test-'));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('Track 1: generates secure loopback rippled.cfg presets and computes unified diffs', () => {
    const mainnet = generateRippledConfigBundle({
      network: 'mainnet',
      sizing: '32gb-standard',
      dbBackend: 'NuDB',
      dataDir: '/var/lib/rippled',
      onlineDeleteLedgers: 2000,
      maxPeers: 50,
      enablePublicWs: false,
    });
    expect(mainnet.rippledCfg).toContain('admin = 127.0.0.1, 172.16.0.0/12');
    expect(mainnet.rippledCfg).toContain('online_delete=2000');
    expect(mainnet.validatorsTxt).toContain('https://vl.xrplf.org');

    const modified = mainnet.rippledCfg.replace('online_delete=2000', 'online_delete=4000');
    const diff = computeUnifiedLineDiff(mainnet.rippledCfg, modified);
    expect(diff.some((d) => d.type === 'removed' && d.text.includes('2000'))).toBe(true);
    expect(diff.some((d) => d.type === 'added' && d.text.includes('4000'))).toBe(true);
  });

  it('Track 2: builds Ledger WebHID BIP-44 APDUs, HID 64-byte frames, and SignerListSet', () => {
    const pathBuf = encodeBip32Path("44'/144'/0'/0/0");
    expect(pathBuf[0]).toBe(5);
    expect(pathBuf.length).toBe(21);

    const addrApdu = buildLedgerGetAddressApdu("44'/144'/0'/0/0", false);
    expect(addrApdu[0]).toBe(0xe0);
    expect(addrApdu[1]).toBe(0x02);

    const signApdus = buildLedgerSignTxApdus("44'/144'/0'/0/0", 'AA'.repeat(220));
    expect(signApdus.length).toBeGreaterThan(1);
    expect(signApdus[0][2]).toBe(0x80); // First chunk of multi-chunk
    expect(signApdus[signApdus.length - 1][2]).toBe(0x81); // Final chunk

    const frames = frameHidPackets(signApdus[0]);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].length).toBe(64);
    expect(frames[0][2]).toBe(0x05);

    const multisig = buildXrplTransactionFromIntent({
      kind: 'SignerListSet',
      account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      signerQuorum: 2,
      signers: [
        { account: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', weight: 1 },
        { account: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz', weight: 1 },
      ],
    });
    expect(multisig.tx.TransactionType).toBe('SignerListSet');
    expect(multisig.tx.SignerQuorum).toBe(2);
  });

  it('Track 3: simulates AMM x*y=k swap price impact and builds AMMCreate/AMMVote & DeliverMin Payment', () => {
    const sim = simulateAmmConstantProductSwap({
      reserveIn: 50_000,
      reserveOut: 100_000,
      amountIn: 5_000,
      tradingFeeBps: 30,
      slippagePct: 1.0,
    });
    expect(sim.spotPrice).toBe(2);
    expect(sim.amountOut).toBeGreaterThan(9_000);
    expect(sim.amountOut).toBeLessThan(10_000);
    expect(sim.priceImpactPct).toBeGreaterThan(5);
    expect(sim.minOutWithSlippage).toBeLessThan(sim.amountOut);

    const ammCreate = buildXrplTransactionFromIntent({
      kind: 'AMMCreate',
      account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      amount1: { currency: 'XRP', value: '100' },
      amount2: { currency: 'RLUSD', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', value: '200' },
      tradingFeeBps: 30,
    });
    expect(ammCreate.tx.TransactionType).toBe('AMMCreate');
    expect(ammCreate.tx.TradingFee).toBe(300);

    const pathSwap = buildXrplTransactionFromIntent({
      kind: 'Payment',
      account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      asset: { currency: 'RLUSD', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', value: '50' },
      sendMax: { currency: 'XRP', value: '30' },
      deliverMin: { currency: 'RLUSD', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', value: '49.5' },
    });
    expect(pathSwap.tx.Flags).toBe(0x00020000); // tfPartialPayment
    expect(pathSwap.tx.DeliverMin).toBeDefined();
  });

  it('Track 4: generates & validates xrp-ledger.toml and builds MPT, OracleSet & DIDSet payloads', () => {
    const toml = generateXrpLedgerToml({
      domain: 'issuer.example.com',
      orgName: 'Example Corp',
      issuerAddress: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      currencyCode: 'USDX',
    });
    const lint = validateXrpLedgerToml(toml);
    expect(lint.valid).toBe(true);
    expect(lint.sectionsFound).toContain('[[ACCOUNTS]]');
    expect(lint.sectionsFound).toContain('[[CURRENCIES]]');

    const mpt = buildXrplTransactionFromIntent({
      kind: 'MPTokenIssuanceCreate',
      account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      assetScale: 2,
      maximumAmount: '1000000',
      canTransfer: true,
      canTrade: true,
      canEscrow: false,
      canClawback: true,
      canLock: true,
      requireAuth: false,
    });
    expect(mpt.tx.TransactionType).toBe('MPTokenIssuanceCreate');

    const oracle = buildXrplTransactionFromIntent({
      kind: 'OracleSet',
      account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      oracleDocumentId: 1,
      provider: 'XRPL-CC',
      assetClass: 'currency',
      baseAsset: 'XRP',
      quoteAsset: 'USD',
      assetPrice: 24500,
      scale: 4,
    });
    expect(oracle.tx.TransactionType).toBe('OracleSet');

    const did = buildXrplTransactionFromIntent({
      kind: 'DIDSet',
      account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      uri: 'ipfs://bafybeidid',
    });
    expect(did.tx.TransactionType).toBe('DIDSet');
  });

  it('Track 5: persists SQLite ledger & wallet journal records and exports safe RFC-4180 CSV', async () => {
    const svc = new AnalyticsSqliteService(tmpDir);
    await svc.init();

    await svc.recordLedger('mainnet', {
      ledgerIndex: 92_000_001,
      ledgerHash: 'A'.repeat(64),
      ledgerTime: Date.now(),
      txnCount: 74,
      feeBaseDrops: 12,
      reserveBaseXrp: 1,
      reserveIncXrp: 0.2,
      validatedLedgers: '1-92000001',
      closeDurationMs: 3500,
    });
    await svc.recordJournalEntry({
      network: 'mainnet',
      txType: 'Payment',
      account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      destination: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      amountDisplay: '100 XRP',
      feeDrops: 12,
      hash: 'B'.repeat(64),
      status: 'tesSUCCESS',
    });

    const summary = await svc.getSummary();
    expect(summary.recordedLedgers).toBe(1);
    expect(summary.recordedTxJournal).toBe(1);
    expect(summary.peakTxnLedger?.txnCount).toBe(74);

    const exported = await svc.buildCsvExport('transactions');
    expect(exported.rowCount).toBe(1);
    expect(exported.csv).toContain('ISO_Timestamp,Network,TxType');
    expect(exported.csv).toContain('tesSUCCESS');

    const formulaSafeCsv = serializeRowsToCsv(['Note'], [['=CMD()'], ['-12.5']]);
    expect(formulaSafeCsv).toContain("'=CMD()");
    expect(formulaSafeCsv).toContain('-12.5');

    await svc.close();
  });
});
