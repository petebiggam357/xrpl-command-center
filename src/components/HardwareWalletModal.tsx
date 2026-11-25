import React, { useState } from 'react';
import { Cpu, ShieldCheck, Usb, Wand2, X } from 'lucide-react';
import {
  connectLedgerDirect,
  HARDWARE_WALLET_VENDORS,
  probeTrezorDevice,
  type HardwareVendorId,
} from '../services/hardwareWallets';
import { getXrplBridge } from '../services/xrplBridge';
import { isXAddress } from '../shared/betaUtils';

interface HardwareWalletModalProps {
  open: boolean;
  onClose: () => void;
  onPaired: (accountId: string, message: string) => void;
}

export const HardwareWalletModal: React.FC<HardwareWalletModalProps> = ({
  open,
  onClose,
  onPaired,
}) => {
  const [selectedVendor, setSelectedVendor] = useState<HardwareVendorId>('ledger');
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [derivationPath, setDerivationPath] = useState("m/44'/144'/0'/0/0");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!open) return null;

  const vendorMeta =
    HARDWARE_WALLET_VENDORS.find((v) => v.id === selectedVendor) ?? HARDWARE_WALLET_VENDORS[0];

  const handleLedgerUsbConnect = async () => {
    setBusy(true);
    setStatusMsg(null);
    const res = await connectLedgerDirect();
    setBusy(false);
    if (!res.ok || !res.address) {
      setStatusMsg({ ok: false, text: res.error ?? 'Ledger USB connection cancelled.' });
      return;
    }
    const added = await getXrplBridge().walletAddWatchOnly(
      label.trim() || res.deviceName || 'Ledger Hardware',
      res.address,
      true,
      "44'/144'/0'/0/0"
    );
    if (added.ok && added.account) {
      onPaired(
        added.account.id,
        `Paired Ledger USB (${res.address}). Pre-flight transactions export cleanly for hardware signing.`
      );
      onClose();
    } else {
      setStatusMsg({ ok: false, text: added.error ?? 'Failed to add Ledger account.' });
    }
  };

  const handleTrezorProbe = async () => {
    setBusy(true);
    setStatusMsg(null);
    const probe = await probeTrezorDevice();
    setBusy(false);
    setStatusMsg({ ok: probe.ok, text: probe.message });
    if (probe.ok && !label.trim() && probe.deviceLabel) {
      setLabel('Trezor XRP');
    }
  };

  const handleDecodeXAddr = async () => {
    if (!isXAddress(address)) return;
    const dec = await getXrplBridge().decodeXAddress(address);
    if (dec.ok && dec.classicAddress) {
      setAddress(dec.classicAddress);
      setStatusMsg({ ok: true, text: `Decoded X-Address → ${dec.classicAddress}` });
    } else {
      setStatusMsg({ ok: false, text: dec.error ?? 'Invalid X-Address' });
    }
  };

  const handlePairColdAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    let cleanAddr = address.trim();
    if (isXAddress(cleanAddr)) {
      const dec = await getXrplBridge().decodeXAddress(cleanAddr);
      if (!dec.ok || !dec.classicAddress) {
        setStatusMsg({ ok: false, text: dec.error ?? 'Invalid X-Address.' });
        return;
      }
      cleanAddr = dec.classicAddress;
    }

    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(cleanAddr)) {
      setStatusMsg({ ok: false, text: 'Enter a valid XRPL classic r-address or X-Address.' });
      return;
    }

    setBusy(true);
    const finalLabel = label.trim() || `${vendorMeta.name.split(' ')[0]} Cold`;
    const added = await getXrplBridge().walletAddWatchOnly(
      finalLabel,
      cleanAddr,
      true,
      `${vendorMeta.id}:${derivationPath.trim() || vendorMeta.defaultPath}`
    );
    setBusy(false);

    if (added.ok && added.account) {
      onPaired(
        added.account.id,
        `Paired ${finalLabel} (${cleanAddr}). Private keys stay 100% on your hardware device; use Air-Gapped QR / Signed Blob to broadcast.`
      );
      onClose();
    } else {
      setStatusMsg({ ok: false, text: added.error ?? 'Could not pair cold wallet.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="hud-panel w-full max-w-2xl rounded-2xl border border-violet-400/40 p-5 shadow-2xl space-y-4 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-violet-300" />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-violet-300">
              Open-SDK Hardware &amp; Cold Wallet Hub
            </div>
            <h3 className="text-sm font-bold text-white">
              Connect Ledger, Trezor, Keystone, Tangem, D&apos;CENT or Xaman
            </h3>
          </div>
        </div>

        {/* Vendor selector grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {HARDWARE_WALLET_VENDORS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setSelectedVendor(v.id);
                setDerivationPath(v.defaultPath);
                setStatusMsg(null);
              }}
              className={`text-left p-2.5 rounded-xl border transition-colors ${
                selectedVendor === v.id
                  ? 'bg-violet-500/20 border-violet-400/60 text-white'
                  : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              <div className="text-xs font-semibold truncate">{v.name.split(' (')[0]}</div>
              <div className="text-[10px] font-mono text-cyan-300/90 mt-0.5">{v.transport}</div>
            </button>
          ))}
        </div>

        {/* Active vendor panel */}
        <div className="rounded-xl bg-slate-950/85 border border-slate-800 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white">{vendorMeta.name}</span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-emerald-300">
              {vendorMeta.openSdk}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">{vendorMeta.description}</p>

          {selectedVendor === 'ledger' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLedgerUsbConnect()}
              className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/25 border border-violet-400/60 text-xs font-mono font-semibold text-violet-100 hover:bg-violet-500/35 disabled:opacity-50"
            >
              <Usb className="w-4 h-4" />
              {busy ? 'Connecting Ledger USB…' : 'Connect Ledger via WebHID USB (XRP App Open)'}
            </button>
          )}

          {selectedVendor === 'trezor' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleTrezorProbe()}
              className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              <Usb className="w-4 h-4" />
              {busy ? 'Probing Trezor Bridge / WebUSB…' : 'Detect Trezor USB / Local Bridge (127.0.0.1:21325)'}
            </button>
          )}
        </div>

        {/* Pair by public address / X-Address (works for Trezor, Keystone, Tangem, D'CENT, Xaman, or manual Ledger) */}
        <form onSubmit={(e) => void handlePairColdAddress(e)} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                Wallet Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`e.g. My ${vendorMeta.name.split(' ')[0]} Vault`}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                BIP-44 Path (Reference)
              </label>
              <input
                type="text"
                value={derivationPath}
                onChange={(e) => setDerivationPath(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-slate-300"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-mono uppercase text-slate-400">
                Public XRP Address from Hardware Device (r… or X…)
              </label>
              {isXAddress(address) && (
                <button
                  type="button"
                  onClick={() => void handleDecodeXAddr()}
                  className="flex items-center gap-1 text-[10px] font-mono text-emerald-300 hover:underline"
                >
                  <Wand2 className="w-3 h-3" />
                  Decode X-Address
                </button>
              )}
            </div>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="r... or X..."
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
            />
          </div>

          {statusMsg && (
            <div
              className={`p-2.5 rounded-xl font-mono text-[11px] border ${
                statusMsg.ok
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                  : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Private keys never leave your hardware wallet.</span>
            </div>
            <button
              type="submit"
              disabled={busy || !address.trim()}
              className="px-4 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
            >
              Pair Cold Wallet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
