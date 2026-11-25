import { describe, expect, it } from 'vitest';
import {
  HARDWARE_WALLET_VENDORS,
  TREZOR_USB_VENDOR_IDS,
} from '../src/services/hardwareWallets';

describe('v0.1.2-beta Open-SDK Cold & Hardware Wallet Hub', () => {
  it('registers Ledger, Trezor, Keystone, Tangem, D-CENT, and Xaman open-SDK connectors', () => {
    const ids = HARDWARE_WALLET_VENDORS.map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining(['ledger', 'trezor', 'keystone', 'tangem', 'dcent', 'xaman']));
    for (const v of HARDWARE_WALLET_VENDORS) {
      expect(v.defaultPath).toContain("44'/144'/0'/0/0");
      expect(v.openSdk.length).toBeGreaterThan(3);
    }
  });

  it('includes official Trezor WebUSB vendor IDs (0x1209 & 0x534c)', () => {
    expect(TREZOR_USB_VENDOR_IDS).toContain(0x1209);
    expect(TREZOR_USB_VENDOR_IDS).toContain(0x534c);
  });
});
