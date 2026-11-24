import { describe, expect, it } from 'vitest';
import {
  BLACKHOLE_ADDRESSES,
  classifyTransaction,
  decodeCurrencyCode,
  decodeHexAscii,
  decodeIssuerRiskFlags,
  detectQueryKind,
  dropsToXrpString,
  LSF_FLAGS,
  parseLiveTransactionEvent,
  rippleTimeToUnixMs,
} from '../src/shared/xrplCodec';

describe('xrplCodec protocol utilities', () => {
  it('converts drops to exact XRP strings using BigInt math', () => {
    expect(dropsToXrpString('1000000')).toBe('1');
    expect(dropsToXrpString('1500000')).toBe('1.5');
    expect(dropsToXrpString('123456789012345')).toBe('123,456,789.012345');
    expect(dropsToXrpString('12')).toBe('0.000012');
    expect(dropsToXrpString('0')).toBe('0');
  });

  it('decodes standard 3-char and 160-bit hex currency codes accurately', () => {
    expect(decodeCurrencyCode('USD')).toBe('USD');
    expect(decodeCurrencyCode('524C555344000000000000000000000000000000')).toBe('RLUSD');
    expect(decodeCurrencyCode('534F4C4F00000000000000000000000000000000')).toBe('SOLO');
    expect(decodeCurrencyCode('03AABBCCDDEE11223344556677889900AABBCCDD')).toBe('LP-AABBCC');
  });

  it('decodes hex ASCII AccountRoot domain fields', () => {
    expect(decodeHexAscii('726970706C652E636F6D')).toBe('ripple.com');
    expect(decodeHexAscii(undefined)).toBeUndefined();
  });

  it('decodes AccountRoot security flags and detects blackholed issuers', () => {
    const blackholeKey = Array.from(BLACKHOLE_ADDRESSES)[0];
    const flags =
      LSF_FLAGS.DISABLE_MASTER |
      LSF_FLAGS.NO_FREEZE |
      LSF_FLAGS.DEFAULT_RIPPLE |
      LSF_FLAGS.ALLOW_TRUSTLINE_CLAWBACK;

    const decoded = decodeIssuerRiskFlags(flags, blackholeKey, '726970706C652E636F6D');
    expect(decoded.blackholed).toBe(true);
    expect(decoded.disableMaster).toBe(true);
    expect(decoded.noFreeze).toBe(true);
    expect(decoded.defaultRipple).toBe(true);
    expect(decoded.allowClawback).toBe(true);
    expect(decoded.globalFreeze).toBe(false);
    expect(decoded.domain).toBe('ripple.com');

    // Active regular key means not blackholed even if master key disabled
    const activeRegular = decodeIssuerRiskFlags(LSF_FLAGS.DISABLE_MASTER, 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe');
    expect(activeRegular.blackholed).toBe(false);
  });

  it('converts Ripple epoch timestamps to Unix ms', () => {
    expect(rippleTimeToUnixMs(0)).toBe(946684800 * 1000);
    expect(rippleTimeToUnixMs(10)).toBe(946684810 * 1000);
  });

  it('classifies XRP, Token, DEX, AMM, NFT, and MPT transactions cleanly', () => {
    const xrpPayment = classifyTransaction({
      TransactionType: 'Payment',
      Amount: '250000000000', // 250,000 XRP
    });
    expect(xrpPayment.category).toBe('payment');
    expect(xrpPayment.amountXrpEstimate).toBe(250_000);

    const rlusdPayment = classifyTransaction({
      TransactionType: 'Payment',
      Amount: {
        currency: '524C555344000000000000000000000000000000',
        issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
        value: '42000',
      },
    });
    expect(rlusdPayment.category).toBe('token');
    expect(rlusdPayment.currency).toBe('RLUSD');
    expect(rlusdPayment.amountDisplay).toContain('RLUSD');

    const dex = classifyTransaction({
      TransactionType: 'OfferCreate',
      TakerPays: '100000000',
      TakerGets: { currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', value: '50' },
    });
    expect(dex.category).toBe('dex');

    const amm = classifyTransaction({ TransactionType: 'AMMDeposit', Amount: '50000000' });
    expect(amm.category).toBe('amm');

    const mpt = classifyTransaction({ TransactionType: 'MPTokenIssuanceCreate' });
    expect(mpt.category).toBe('mpt');
  });

  it('parses live transaction events and flags whale transfers', () => {
    const parsed = parseLiveTransactionEvent({
      validated: true,
      ledger_index: 92000000,
      engine_result: 'tesSUCCESS',
      transaction: {
        hash: 'A'.repeat(64),
        TransactionType: 'Payment',
        Account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        Destination: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
        Amount: '500000000000', // 500k XRP
        Fee: '12',
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.isWhale).toBe(true);
    expect(parsed!.validated).toBe(true);
    expect(parsed!.engineResult).toBe('tesSUCCESS');
  });

  it('auto-detects account addresses, transaction hashes, and ledger indices', () => {
    expect(detectQueryKind('rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De')).toBe('account');
    expect(detectQueryKind('a'.repeat(64))).toBe('hash');
    expect(detectQueryKind('92104512')).toBe('ledger');
    expect(detectQueryKind('RLUSD')).toBe('search');
  });
});
