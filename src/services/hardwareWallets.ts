import { connectLedgerXrpAccount } from './ledgerWebHid';
import type { WalletAccountPublic } from '../shared/types';

export type HardwareVendorId = 'ledger' | 'trezor' | 'keystone' | 'tangem' | 'dcent' | 'xaman';

export interface HardwareVendorMeta {
  id: HardwareVendorId;
  name: string;
  transport: 'WebHID USB' | 'Trezor Bridge / WebUSB' | 'Air-Gapped QR / NFC';
  defaultPath: string;
  description: string;
  openSdk: string;
}

export const TREZOR_USB_VENDOR_IDS = [0x1209, 0x534c] as const;

export const HARDWARE_WALLET_VENDORS: HardwareVendorMeta[] = [
  {
    id: 'ledger',
    name: 'Ledger (Nano S+/X, Stax, Flex)',
    transport: 'WebHID USB',
    defaultPath: "44'/144'/0'/0/0",
    description: 'Direct USB WebHID connection using open XRPL BIP-44 APDU framing.',
    openSdk: 'Ledger Open XRP App APDU',
  },
  {
    id: 'trezor',
    name: 'Trezor (Safe 3, Safe 5, Model T)',
    transport: 'Trezor Bridge / WebUSB',
    defaultPath: "m/44'/144'/0'/0/0",
    description: 'Detects Trezor Suite Bridge (127.0.0.1:21325) or WebUSB & pairs for offline/QR signing.',
    openSdk: 'Trezor Open Firmware / Bridge',
  },
  {
    id: 'keystone',
    name: 'Keystone 3 Pro',
    transport: 'Air-Gapped QR / NFC',
    defaultPath: "m/44'/144'/0'/0/0",
    description: '100% air-gapped QR workflow: export unsigned tx_json QR & broadcast signed tx_blob.',
    openSdk: 'Open UR / XRPL QR Standard',
  },
  {
    id: 'tangem',
    name: 'Tangem Card / Ring',
    transport: 'Air-Gapped QR / NFC',
    defaultPath: "m/44'/144'/0'/0/0",
    description: 'Track your NFC hardware card address with live USD valuation & QR payment prep.',
    openSdk: 'Open XRPL Classic / X-Address',
  },
  {
    id: 'dcent',
    name: "D'CENT / Ellipal Cold",
    transport: 'Air-Gapped QR / NFC',
    defaultPath: "m/44'/144'/0'/0/0",
    description: 'Pair biometric or air-gapped cold wallet public address for watch + offline tx prep.',
    openSdk: 'Open XRPL Offline Signing',
  },
  {
    id: 'xaman',
    name: 'Xaman (Xumm) Mobile Cold',
    transport: 'Air-Gapped QR / NFC',
    defaultPath: "m/44'/144'/0'/0/0",
    description: 'Pair your Xaman mobile/Tangem address to inspect balances, TrustLines & prep payloads.',
    openSdk: 'Open XRPL Signable Payload',
  },
];

export interface TrezorProbeResult {
  ok: boolean;
  transport: 'trezord-bridge' | 'webusb' | 'none';
  deviceLabel?: string;
  bridgeVersion?: string;
  deviceCount?: number;
  message: string;
}

/**
 * Probes for a connected Trezor hardware wallet via:
 * 1) Official open-source Trezor Suite / trezord local bridge (http://127.0.0.1:21325)
 * 2) Direct Chromium WebUSB device selector (vendorIds 0x1209 / 0x534c)
 */
export async function probeTrezorDevice(): Promise<TrezorProbeResult> {
  // 1) Try local Trezor Bridge (trezord)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2_500);
    try {
      const res = await fetch('http://127.0.0.1:21325/', {
        method: 'POST',
        signal: ctrl.signal,
      });
      if (res.ok) {
        const info = (await res.json()) as { version?: string };
        const enumRes = await fetch('http://127.0.0.1:21325/enumerate', {
          method: 'POST',
          signal: ctrl.signal,
        });
        const devices = enumRes.ok ? ((await enumRes.json()) as Array<{ path?: string }>) : [];
        return {
          ok: true,
          transport: 'trezord-bridge',
          bridgeVersion: info.version ?? 'detected',
          deviceCount: devices.length,
          deviceLabel:
            devices.length > 0
              ? `Trezor USB (${devices.length} device connected via Bridge v${info.version ?? '?'})`
              : `Trezor Bridge v${info.version ?? '?'} online (plug in & unlock Trezor)`,
          message:
            devices.length > 0
              ? `Detected ${devices.length} Trezor device(s) on local Bridge v${info.version ?? '?'}. Paste your Trezor XRP address (m/44'/144'/0'/0/0) below to pair.`
              : `Trezor Suite Bridge v${info.version ?? '?'} is running, but no unlocked Trezor USB device was enumerated yet.`,
        };
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Bridge not running locally; fall back to WebUSB
  }

  // 2) Try Chromium WebUSB (permitted for Trezor 0x1209 / 0x534c in Electron main.ts)
  const navUsb = (navigator as unknown as {
    usb?: {
      requestDevice: (opts: { filters: Array<{ vendorId: number }> }) => Promise<{
        productName?: string;
        manufacturerName?: string;
      }>;
    };
  }).usb;

  if (navUsb && typeof navUsb.requestDevice === 'function') {
    try {
      const dev = await navUsb.requestDevice({
        filters: TREZOR_USB_VENDOR_IDS.map((vendorId) => ({ vendorId })),
      });
      return {
        ok: true,
        transport: 'webusb',
        deviceLabel: dev.productName || 'Trezor Hardware Wallet',
        deviceCount: 1,
        message: `Connected ${dev.productName || 'Trezor'} via WebUSB! Enter or verify your Trezor XRP classic address (m/44'/144'/0'/0/0) below to link it to the Command Center.`,
      };
    } catch (err) {
      return {
        ok: false,
        transport: 'none',
        message:
          err instanceof Error
            ? `Trezor WebUSB selection cancelled or unavailable (${err.message}). You can still pair by pasting your Trezor XRP address below.`
            : 'Trezor WebUSB unavailable.',
      };
    }
  }

  return {
    ok: false,
    transport: 'none',
    message:
      'Trezor Bridge (127.0.0.1:21325) not detected. Open Trezor Suite or paste your Trezor XRP address below to pair in Air-Gapped / Cold Watch mode.',
  };
}

export async function connectLedgerDirect(): Promise<{
  ok: boolean;
  address?: string;
  deviceName?: string;
  error?: string;
}> {
  return connectLedgerXrpAccount("44'/144'/0'/0/0");
}

/**
 * Generates an offline, print-ready Cold Backup Recovery Sheet in a clean browser print window.
 * Security: NEVER prints plaintext seeds — provides structured handwritten backup lines + address QR.
 */
export function openPrintableRecoverySheet(account: WalletAccountPublic, qrSvg?: string): boolean {
  if (typeof window === 'undefined') return false;
  const win = window.open('', '_blank', 'width=820,height=980');
  if (!win) return false;

  const escapedLabel = account.label.replace(/[<>&"]/g, (ch) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch] ?? ch)
  );
  const nowStr = new Date().toISOString().slice(0, 10);

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>XRPL Cold Recovery Sheet — ${escapedLabel}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #0f172a; margin: 32px; line-height: 1.5; }
    .card { border: 2px solid #0f172a; border-radius: 12px; padding: 24px; max-width: 720px; margin: 0 auto; }
    h1 { font-size: 18px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.08em; }
    .sub { font-size: 12px; color: #475569; margin-bottom: 18px; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 20px; border-top: 1px solid #cbd5e1; padding: 14px 0; }
    .addr { font-size: 14px; font-weight: 700; word-break: break-all; }
    .qr { width: 120px; height: 120px; border: 1px solid #cbd5e1; padding: 6px; border-radius: 8px; }
    .qr svg { width: 100%; height: 100%; }
    .seed-box { border: 2px dashed #64748b; border-radius: 10px; padding: 16px; margin-top: 14px; background: #f8fafc; }
    .line { border-bottom: 1px solid #94a3b8; height: 28px; margin: 6px 0; }
    .warn { font-size: 11px; color: #991b1b; margin-top: 14px; border: 1px solid #fca5a5; background: #fef2f2; padding: 10px; border-radius: 8px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="card">
    <h1>XRPL Command Center — Cold Recovery Sheet</h1>
    <div class="sub">Generated offline on ${nowStr} • Never store private seeds in cloud drives or screenshots</div>
    <div class="row">
      <div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Wallet Label</div>
        <div style="font-size:15px;font-weight:700;">${escapedLabel}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;margin-top:8px;">Classic XRPL Address</div>
        <div class="addr">${account.address}</div>
        <div style="font-size:11px;color:#475569;margin-top:6px;">
          Type: ${account.kind} • Algorithm: ${account.algorithm ?? 'ed25519'} ${account.derivationPath ? `• Path: ${account.derivationPath}` : ''}
        </div>
      </div>
      ${qrSvg ? `<div class="qr">${qrSvg}</div>` : ''}
    </div>
    <div class="seed-box">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#334155;">
        Handwritten Family Seed (sEd… / s…) or 24-Word Hardware Recovery Phrase
      </div>
      <div class="line"></div>
      <div class="line"></div>
      <div class="line"></div>
      <div style="font-size:11px;color:#475569;margin-top:10px;">
        Master Vault Passphrase Hint (Never write the full passphrase if stored with your .xrplvault file):
      </div>
      <div class="line"></div>
    </div>
    <div class="warn">
      <strong>SECURITY NOTICE:</strong> This sheet intentionally leaves the secret seed blank so your private key never passes through OS printer spoolers. Write your seed by hand in pen and store in a fireproof/waterproof location.
    </div>
    <div class="no-print" style="margin-top:16px;text-align:right;">
      <button onclick="window.print()" style="padding:8px 16px;font-family:inherit;font-weight:700;cursor:pointer;">Print Recovery Sheet</button>
    </div>
  </div>
</body>
</html>`);
  win.document.close();
  return true;
}
