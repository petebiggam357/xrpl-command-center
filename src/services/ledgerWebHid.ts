import {
  buildLedgerGetAddressApdu,
  buildLedgerSignTxApdus,
  frameHidPackets,
} from '../shared/studioUtils';

// Ledger Vendor ID (0x2c97) over Chromium WebHID
const LEDGER_VENDOR_ID = 0x2c97;

interface MinimalHidDevice {
  opened: boolean;
  productName?: string;
  open: () => Promise<void>;
  close: () => Promise<void>;
  sendReport: (reportId: number, data: BufferSource) => Promise<void>;
  addEventListener: (type: 'inputreport', listener: (ev: { data: DataView }) => void) => void;
  removeEventListener: (type: 'inputreport', listener: (ev: { data: DataView }) => void) => void;
}

interface MinimalNavigatorHid {
  requestDevice: (opts: { filters: Array<{ vendorId: number }> }) => Promise<MinimalHidDevice[]>;
}

function getWebHid(): MinimalNavigatorHid | null {
  const nav = navigator as unknown as { hid?: MinimalNavigatorHid };
  return nav.hid ?? null;
}

async function exchangeApdu(device: MinimalHidDevice, apdu: Uint8Array): Promise<Uint8Array> {
  const packets = frameHidPackets(apdu);

  const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
    let expectedLength = 0;
    let received = new Uint8Array(0);
    const timer = setTimeout(() => {
      device.removeEventListener('inputreport', onReport);
      reject(new Error('Ledger USB response timed out (ensure the XRP app is open on your Ledger).'));
    }, 35_000);

    function onReport(event: { data: DataView }) {
      const bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
      if (bytes.length < 7 || bytes[2] !== 0x05) return;
      const seq = (bytes[3] << 8) | bytes[4];
      let offset = 5;
      if (seq === 0) {
        expectedLength = (bytes[5] << 8) | bytes[6];
        offset = 7;
      }
      const chunk = bytes.subarray(offset);
      const merged = new Uint8Array(received.length + chunk.length);
      merged.set(received, 0);
      merged.set(chunk, received.length);
      received = merged;

      if (expectedLength > 0 && received.length >= expectedLength) {
        clearTimeout(timer);
        device.removeEventListener('inputreport', onReport);
        resolve(received.slice(0, expectedLength));
      }
    }

    device.addEventListener('inputreport', onReport);
  });

  for (const pkt of packets) {
    await device.sendReport(0, pkt as unknown as BufferSource);
  }

  const rawResp = await responsePromise;
  if (rawResp.length < 2) {
    throw new Error('Malformed APDU response from Ledger');
  }
  const sw = (rawResp[rawResp.length - 2] << 8) | rawResp[rawResp.length - 1];
  if (sw !== 0x9000) {
    throw new Error(
      sw === 0x6985
        ? 'Transaction rejected on Ledger device screen.'
        : `Ledger XRP app returned status 0x${sw.toString(16).toUpperCase()} (open the XRP app on your Ledger).`
    );
  }
  return rawResp.slice(0, rawResp.length - 2);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0').toUpperCase();
  }
  return out;
}

export async function connectLedgerXrpAccount(bip32Path = "44'/144'/0'/0/0"): Promise<{
  ok: boolean;
  address?: string;
  publicKeyHex?: string;
  deviceName?: string;
  error?: string;
}> {
  const hid = getWebHid();
  if (!hid) {
    return {
      ok: false,
      error: 'WebHID is unavailable in this environment (use the desktop Electron app).',
    };
  }

  let device: MinimalHidDevice | undefined;
  try {
    const devices = await hid.requestDevice({ filters: [{ vendorId: LEDGER_VENDOR_ID }] });
    device = devices[0];
    if (!device) {
      return { ok: false, error: 'No Ledger USB device selected or detected.' };
    }
    if (!device.opened) {
      await device.open();
    }

    const apdu = buildLedgerGetAddressApdu(bip32Path, false);
    const data = await exchangeApdu(device, apdu);
    // Response layout: [pubKeyLen, ...pubKey, addrLen, ...asciiAddress]
    const pubLen = data[0];
    const pubKeyBytes = data.slice(1, 1 + pubLen);
    const addrLen = data[1 + pubLen];
    const addrBytes = data.slice(2 + pubLen, 2 + pubLen + addrLen);
    const address = new TextDecoder().decode(addrBytes);

    return {
      ok: true,
      address,
      publicKeyHex: bytesToHex(pubKeyBytes),
      deviceName: device.productName || 'Ledger Hardware Wallet',
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ledger WebHID connection failed',
    };
  } finally {
    if (device && device.opened) {
      await device.close().catch(() => undefined);
    }
  }
}

export async function signWithLedgerWebHid(params: {
  bip32Path: string;
  signingHex: string;
}): Promise<{ ok: boolean; signatureHex?: string; error?: string }> {
  const hid = getWebHid();
  if (!hid) {
    return { ok: false, error: 'WebHID unavailable.' };
  }
  let device: MinimalHidDevice | undefined;
  try {
    const devices = await hid.requestDevice({ filters: [{ vendorId: LEDGER_VENDOR_ID }] });
    device = devices[0];
    if (!device) {
      return { ok: false, error: 'No Ledger USB device detected.' };
    }
    if (!device.opened) await device.open();

    const apdus = buildLedgerSignTxApdus(params.bip32Path, params.signingHex);
    let lastResp: Uint8Array = new Uint8Array(0);
    for (const apdu of apdus) {
      lastResp = await exchangeApdu(device, apdu);
    }
    return {
      ok: true,
      signatureHex: bytesToHex(lastResp),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Ledger transaction signing failed',
    };
  } finally {
    if (device && device.opened) {
      await device.close().catch(() => undefined);
    }
  }
}
