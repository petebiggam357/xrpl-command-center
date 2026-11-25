import { describe, expect, it } from 'vitest';
import { classicAddressToXAddress, xAddressToClassicAddress } from 'xrpl';
import {
  checkDestinationTagSafety,
  computeReserveBreakdown,
  decodeXrplMemos,
  isXAddress,
  resolveAddressLabel,
  resolveSafeMediaUri,
} from '../src/shared/betaUtils';
import type { AddressBookContact, WalletAccountPublic } from '../src/shared/types';

describe('v0.1.0-beta Polish & Utility Suite', () => {
  it('flags missing Destination Tags for known exchanges and tagged contacts', () => {
    const contacts: AddressBookContact[] = [
      {
        id: 'c1',
        label: 'My Exchange Deposit',
        address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        defaultTag: 424242,
        requireTag: true,
        category: 'exchange',
        createdAt: Date.now(),
      },
    ];

    // Known Coinbase deposit without tag -> danger
    const coinbaseCheck = checkDestinationTagSafety('rw2ciyaNshpHe7bCHo4bRWq6pqqynnWKQg', '', contacts);
    expect(coinbaseCheck.level).toBe('danger');
    expect(coinbaseCheck.matchedLabel).toBe('Coinbase');

    // Known Coinbase deposit with tag -> ok
    const coinbaseTagged = checkDestinationTagSafety('rw2ciyaNshpHe7bCHo4bRWq6pqqynnWKQg', '123456', contacts);
    expect(coinbaseTagged.level).toBe('ok');

    // Saved contact with requireTag -> danger + suggestedTag
    const savedMissing = checkDestinationTagSafety('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', '', contacts);
    expect(savedMissing.level).toBe('danger');
    expect(savedMissing.suggestedTag).toBe(424242);
  });

  it('resolves address labels in priority order: own wallet > saved contact > known exchange', () => {
    const wallets: WalletAccountPublic[] = [
      {
        id: 'w1',
        label: 'Treasury Hot',
        address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        kind: 'custodial',
        algorithm: 'ed25519',
        createdAt: Date.now(),
      },
    ];
    const contacts: AddressBookContact[] = [
      {
        id: 'c1',
        label: 'Alice Personal',
        address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        category: 'personal',
        createdAt: Date.now(),
      },
    ];

    expect(resolveAddressLabel('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', contacts, wallets)).toEqual({
      label: 'Treasury Hot',
      source: 'wallet',
    });
    expect(resolveAddressLabel('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', contacts, wallets)).toEqual({
      label: 'Alice Personal',
      source: 'contact',
    });
    expect(resolveAddressLabel('rLHzPsX6oXkzU2qL12kHCH8G8cnZv1rBJh', contacts, wallets)).toEqual({
      label: 'Kraken Exchange',
      source: 'exchange',
    });
  });

  it('decodes UTF-8 hex Memos from raw XRPL transactions', () => {
    const rawTx = {
      TransactionType: 'Payment',
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from('invoice', 'utf8').toString('hex').toUpperCase(),
            MemoData: Buffer.from('Invoice #2026-001 Paid', 'utf8').toString('hex').toUpperCase(),
          },
        },
      ],
    };

    const memos = decodeXrplMemos(rawTx);
    expect(memos).toHaveLength(1);
    expect(memos[0].type).toBe('invoice');
    expect(memos[0].data).toBe('Invoice #2026-001 Paid');
  });

  it('resolves IPFS/HTTPS NFT URIs safely and rejects dangerous schemes', () => {
    const ipfs = resolveSafeMediaUri('ipfs://QmTestHash123/art.png');
    expect(ipfs.gatewayUrl).toBe('https://ipfs.io/ipfs/QmTestHash123/art.png');
    expect(ipfs.isImageLikely).toBe(true);

    const bad = resolveSafeMediaUri('javascript:alert(1)');
    expect(bad.gatewayUrl).toBeUndefined();
    expect(bad.isImageLikely).toBe(false);
  });

  it('computes accurate XRPL reserve breakdown and X-Address round-trip', () => {
    const breakdown = computeReserveBreakdown(100, 1, 5, 0.2);
    expect(breakdown.lockedXrp).toBe(2);
    expect(breakdown.spendableXrp).toBe(98);
    expect(breakdown.lockedPct).toBe(2);
    expect(breakdown.spendablePct).toBe(98);

    const xAddr = classicAddressToXAddress('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', 7777, false);
    expect(isXAddress(xAddr)).toBe(true);
    const decoded = xAddressToClassicAddress(xAddr);
    expect(decoded.classicAddress).toBe('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    expect(decoded.tag).toBe(7777);
  });
});
