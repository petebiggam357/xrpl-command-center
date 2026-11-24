import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildXrplTransactionFromIntent,
  WalletVaultService,
} from '../electron/walletVaultService';
import {
  encodeCurrencyCode,
  unixMsToRippleTime,
  utf8ToHex,
  xrpToDropsString,
} from '../src/shared/xrplCodec';

describe('WalletVaultService & XRPL DeFi transaction builders', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xrpl-cc-vault-test-'));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('converts decimal XRP strings to exact drops and rejects invalid precision', () => {
    expect(xrpToDropsString('1')).toBe('1000000');
    expect(xrpToDropsString('12.345678')).toBe('12345678');
    expect(xrpToDropsString('0.000001')).toBe('1');
    expect(() => xrpToDropsString('0')).toThrow();
    expect(() => xrpToDropsString('-5')).toThrow();
    expect(() => xrpToDropsString('1.1234567')).toThrow();
  });

  it('encodes non-standard currency codes, UTF-8 hex memos, and Ripple Epoch timestamps', () => {
    expect(encodeCurrencyCode('USD')).toBe('USD');
    expect(encodeCurrencyCode('RLUSD')).toBe('524C555344000000000000000000000000000000');
    expect(utf8ToHex('ipfs://test')).toBe('697066733A2F2F74657374');
    expect(unixMsToRippleTime(946684810 * 1000)).toBe(10);
  });

  it('initializes encrypted vault, creates & imports wallets, rejects wrong passphrases, and wipes keys on lock', async () => {
    const vault = new WalletVaultService(tmpDir);

    const initShort = await vault.setupVault('short');
    expect(initShort.ok).toBe(false);

    const setup = await vault.setupVault('correct-horse-battery-staple');
    expect(setup.ok).toBe(true);
    expect(setup.status?.initialized).toBe(true);
    expect(setup.status?.unlocked).toBe(true);

    const created = await vault.createWallet('Treasury', 'ed25519');
    expect(created.ok).toBe(true);
    expect(created.account?.address.startsWith('r')).toBe(true);
    expect(created.oneTimeSeed?.startsWith('sEd')).toBe(true);

    // Ensure disk file never contains the raw plaintext seed!
    const rawDisk = await fs.readFile(path.join(tmpDir, 'wallet-vault.enc.json'), 'utf8');
    expect(rawDisk).not.toContain(created.oneTimeSeed!);

    // Lock and verify unlock lifecycle on a fresh service instance
    vault.lock();
    expect((await vault.getStatus()).unlocked).toBe(false);

    const freshVault = new WalletVaultService(tmpDir);
    const badUnlock = await freshVault.unlock('wrong-passphrase-12345');
    expect(badUnlock.ok).toBe(false);

    const goodUnlock = await freshVault.unlock('correct-horse-battery-staple');
    expect(goodUnlock.ok).toBe(true);
    expect(goodUnlock.status?.accounts).toHaveLength(1);
    expect(goodUnlock.status?.accounts[0].address).toBe(created.account!.address);

    // Also supports watch-only accounts even after locking
    freshVault.lock();
    const watched = await freshVault.addWatchOnly('RLUSD Issuer', 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De');
    expect(watched.ok).toBe(true);
    expect(watched.status?.accounts).toHaveLength(2);
  });

  it('builds canonical Payment, TrustSet, OfferCreate, AMMDeposit, EscrowCreate, and NFTokenMint payloads', () => {
    const acct = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
    const dest = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';

    const pay = buildXrplTransactionFromIntent({
      kind: 'Payment',
      account: acct,
      destination: dest,
      asset: { currency: 'XRP', value: '25.5' },
      destinationTag: 777,
      memoText: 'hello',
    });
    expect(pay.tx.TransactionType).toBe('Payment');
    expect(pay.tx.Amount).toBe('25500000');
    expect(pay.tx.DestinationTag).toBe(777);
    expect(Array.isArray(pay.tx.Memos)).toBe(true);

    const trust = buildXrplTransactionFromIntent({
      kind: 'TrustSet',
      account: acct,
      currency: 'RLUSD',
      issuer: dest,
      limit: '50000',
    });
    expect(trust.tx.TransactionType).toBe('TrustSet');
    expect(trust.tx.Flags).toBe(0x00020000); // tfSetNoRipple

    const dex = buildXrplTransactionFromIntent({
      kind: 'OfferCreate',
      account: acct,
      takerGets: { currency: 'XRP', value: '10' },
      takerPays: { currency: 'RLUSD', issuer: dest, value: '20' },
      orderMode: 'ioc',
    });
    expect(dex.tx.TransactionType).toBe('OfferCreate');
    expect(dex.tx.Flags).toBe(0x00020000); // tfImmediateOrCancel

    const amm = buildXrplTransactionFromIntent({
      kind: 'AMMDeposit',
      account: acct,
      asset1: { currency: 'XRP' },
      asset2: { currency: 'RLUSD', issuer: dest },
      amount1: { currency: 'XRP', value: '15' },
    });
    expect(amm.tx.TransactionType).toBe('AMMDeposit');
    expect(amm.tx.Flags).toBe(0x00080000); // tfSingleAsset

    const nowMs = Date.now();
    const escrow = buildXrplTransactionFromIntent({
      kind: 'EscrowCreate',
      account: acct,
      destination: dest,
      amountXrp: '100',
      finishAfterUnixMs: nowMs + 60_000,
      cancelAfterUnixMs: nowMs + 120_000,
    });
    expect(escrow.tx.TransactionType).toBe('EscrowCreate');
    expect(Number(escrow.tx.CancelAfter)).toBeGreaterThan(Number(escrow.tx.FinishAfter));

    const nft = buildXrplTransactionFromIntent({
      kind: 'NFTokenMint',
      account: acct,
      uriText: 'ipfs://bafybeigdyrzt',
      taxon: 42,
      transferFeeBps: 500, // 5% = 5000 XLS-20 units
      transferable: true,
      burnable: true,
    });
    expect(nft.tx.TransactionType).toBe('NFTokenMint');
    expect(nft.tx.TransferFee).toBe(5000);
    expect(nft.tx.Flags).toBe(0x00000009); // tfBurnable | tfTransferable
  });
});
