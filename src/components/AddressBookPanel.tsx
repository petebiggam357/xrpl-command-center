import React, { useState } from 'react';
import { BookUser, Eye, Plus, Send, ShieldAlert, Trash2, Wand2 } from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import { isXAddress } from '../shared/betaUtils';
import type { AddressBookContact } from '../shared/types';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

interface AddressBookPanelProps {
  onSendToContact: (address: string, defaultTag?: number) => void;
}

export const AddressBookPanel: React.FC<AddressBookPanelProps> = ({ onSendToContact }) => {
  const contacts = useCommandStore((s) => s.contacts);
  const addContact = useCommandStore((s) => s.addContact);
  const removeContact = useCommandStore((s) => s.removeContact);
  const inspectQuery = useCommandStore((s) => s.inspectQuery);

  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [defaultTag, setDefaultTag] = useState('');
  const [requireTag, setRequireTag] = useState(false);
  const [category, setCategory] = useState<AddressBookContact['category']>('personal');
  const [notes, setNotes] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleDecodeXAddr = async () => {
    if (!isXAddress(address)) return;
    const res = await getXrplBridge().decodeXAddress(address);
    if (res.ok && res.classicAddress) {
      setAddress(res.classicAddress);
      if (res.tag !== null && res.tag !== undefined) {
        setDefaultTag(String(res.tag));
        setRequireTag(true);
      }
      setStatusMsg(
        `Decoded X-Address → ${shortenAddress(res.classicAddress, 8, 6)}${res.tag !== null && res.tag !== undefined ? ` (Tag ${res.tag})` : ''}`
      );
    } else {
      setStatusMsg(res.error ?? 'Could not decode X-Address.');
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    let cleanAddr = address.trim();
    let parsedTag = defaultTag.trim() ? Number(defaultTag.trim()) : undefined;

    if (isXAddress(cleanAddr)) {
      const dec = await getXrplBridge().decodeXAddress(cleanAddr);
      if (!dec.ok || !dec.classicAddress) {
        setStatusMsg(dec.error ?? 'Invalid X-Address');
        return;
      }
      cleanAddr = dec.classicAddress;
      if (dec.tag !== null && dec.tag !== undefined) {
        parsedTag = dec.tag;
      }
    }

    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(cleanAddr)) {
      setStatusMsg('Enter a valid classic r-address or X-Address.');
      return;
    }

    addContact({
      label: label.trim() || shortenAddress(cleanAddr, 6, 4),
      address: cleanAddr,
      defaultTag: Number.isFinite(parsedTag) ? parsedTag : undefined,
      requireTag: requireTag || category === 'exchange',
      category,
      notes: notes.trim() || undefined,
    });

    setLabel('');
    setAddress('');
    setDefaultTag('');
    setRequireTag(false);
    setNotes('');
    setStatusMsg('Saved contact to local Address Book.');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Add Contact Form */}
      <form
        onSubmit={(e) => void handleAddContact(e)}
        className="lg:col-span-5 hud-panel rounded-xl p-4 space-y-3"
      >
        <div className="flex items-center gap-2">
          <BookUser className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Save Contact / Exchange
          </h3>
        </div>

        <div>
          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
            Label / Name
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. My Coinbase XRP, Cold Storage, Alice"
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-mono uppercase text-slate-400">
              XRPL Address (Classic r… or X-Address)
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
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => {
                const next = e.target.value as AddressBookContact['category'];
                setCategory(next);
                if (next === 'exchange') setRequireTag(true);
              }}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
            >
              <option value="personal">Personal</option>
              <option value="exchange">Exchange</option>
              <option value="issuer">Token Issuer</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
              Default Dest Tag
            </label>
            <input
              type="text"
              value={defaultTag}
              onChange={(e) => setDefaultTag(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="Optional digits"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={requireTag}
            onChange={(e) => setRequireTag(e.target.checked)}
            className="rounded border-slate-600 bg-slate-900"
          />
          <span>Warn if Destination Tag is missing when sending</span>
        </label>

        <div>
          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Exchange memo, purpose, etc."
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
          />
        </div>

        {statusMsg && (
          <div className="text-[11px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-400/30 rounded-lg px-2.5 py-1.5">
            {statusMsg}
          </div>
        )}

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30"
        >
          <Plus className="w-3.5 h-3.5" />
          Save to Address Book
        </button>
      </form>

      {/* Saved Contacts List */}
      <div className="lg:col-span-7 hud-panel rounded-xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Saved Contacts &amp; Exchange Guard ({contacts.length})
            </h3>
            <p className="text-[11px] text-slate-400">
              Labels automatically appear across the Live Tx Tape, Inspector, and Send form.
            </p>
          </div>
        </div>

        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {contacts.length === 0 ? (
            <div className="text-xs font-mono text-slate-500 py-8 text-center">
              No saved contacts yet. Add your frequent wallets or exchanges on the left.
            </div>
          ) : (
            contacts.map((c) => (
              <div
                key={c.id}
                className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-white">{c.label}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-900 border border-slate-700 text-slate-300">
                      {c.category}
                    </span>
                    {c.requireTag && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 border border-amber-400/40 text-amber-300">
                        <ShieldAlert className="w-3 h-3" />
                        Tag Required
                      </span>
                    )}
                    {c.defaultTag !== undefined && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 border border-cyan-400/30 text-cyan-200">
                        Tag #{c.defaultTag}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1 break-all">
                    {c.address}
                  </div>
                  {c.notes && <div className="text-[11px] text-slate-500 mt-0.5">{c.notes}</div>}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSendToContact(c.address, c.defaultTag)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-[11px] font-mono text-emerald-200 hover:bg-emerald-500/25"
                  >
                    <Send className="w-3 h-3" />
                    Send
                  </button>
                  <button
                    type="button"
                    onClick={() => void inspectQuery(c.address)}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-cyan-300"
                    title="Inspect on-ledger"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeContact(c.id)}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-rose-300"
                    title="Delete contact"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
