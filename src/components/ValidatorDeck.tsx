import React, { useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Search, ShieldCheck, Zap } from 'lucide-react';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

export const ValidatorDeck: React.FC = () => {
  const validators = useCommandStore((s) => s.validators);
  const validatorsLoading = useCommandStore((s) => s.validatorsLoading);
  const validatorsSource = useCommandStore((s) => s.validatorsSource);
  const refreshValidators = useCommandStore((s) => s.refreshValidators);
  const validatorLastSeen = useCommandStore((s) => s.validatorLastSeen);
  const recentValidations = useCommandStore((s) => s.recentValidations);

  const [query, setQuery] = useState('');
  const [unlOnly, setUnlOnly] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return validators.filter((v) => {
      if (unlOnly && !v.unl) return false;
      if (!q) return true;
      return (
        v.publicKey.toLowerCase().includes(q) ||
        (v.domain ?? '').toLowerCase().includes(q) ||
        (v.serverVersion ?? '').toLowerCase().includes(q)
      );
    });
  }, [validators, query, unlOnly]);

  const unlTotal = useMemo(() => validators.filter((v) => v.unl).length, [validators]);
  const highAgreementCount = useMemo(
    () => validators.filter((v) => v.unl && (v.agreement24h ?? 0) >= 0.995).length,
    [validators]
  );

  const versionDist = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of validators) {
      if (!v.serverVersion) continue;
      map.set(v.serverVersion, (map.get(v.serverVersion) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [validators]);

  const now = Date.now();

  return (
    <div className="space-y-4">
      {/* Header & KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="hud-panel rounded-xl p-3.5">
          <div className="text-[10px] font-mono uppercase text-slate-400">UNL Validators</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-emerald-300 tabular-nums">{unlTotal}</span>
            <span className="text-xs font-mono text-slate-500">/ {validators.length} total</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            80% Quorum requires {Math.ceil(unlTotal * 0.8)} votes
          </div>
        </div>

        <div className="hud-panel rounded-xl p-3.5">
          <div className="text-[10px] font-mono uppercase text-slate-400">24h Agreement ≥ 99.5%</div>
          <div className="mt-1 text-2xl font-mono font-bold text-cyan-300 tabular-nums">
            {highAgreementCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">UNL consensus stability</div>
        </div>

        <div className="hud-panel rounded-xl p-3.5">
          <div className="text-[10px] font-mono uppercase text-slate-400">Live Validation Stream</div>
          <div className="mt-1 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-300" />
            <span className="text-2xl font-mono font-bold text-white tabular-nums">
              {recentValidations.length}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Buffered real-time votes</div>
        </div>

        <div className="hud-panel rounded-xl p-3.5">
          <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
            Top rippled Versions
          </div>
          <div className="space-y-1">
            {versionDist.length === 0 ? (
              <div className="text-xs font-mono text-slate-500">Loading VHS metadata…</div>
            ) : (
              versionDist.slice(0, 3).map(([ver, count]) => (
                <div key={ver} className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-300 truncate">{ver}</span>
                  <span className="text-cyan-300 tabular-nums">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="hud-panel rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Validator Constellation &amp; Agreement Matrix
            </h2>
            {validatorsSource && (
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                {validatorsSource}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter domain, pubkey, version…"
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400 w-56"
              />
            </div>

            <button
              type="button"
              onClick={() => setUnlOnly((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                unlOnly
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                  : 'bg-slate-950 border-slate-700 text-slate-300'
              }`}
            >
              {unlOnly ? 'UNL Only' : 'All Validators'}
            </button>

            <button
              type="button"
              onClick={() => void refreshValidators()}
              disabled={validatorsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 hover:border-cyan-400/60 text-xs text-slate-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${validatorsLoading ? 'animate-spin text-cyan-400' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Validator Table */}
        <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-panel z-10 text-[10px] font-mono uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">Live</th>
                <th className="py-2 px-3">Domain / Identity</th>
                <th className="py-2 px-3">Public Key</th>
                <th className="py-2 px-3">Role</th>
                <th className="py-2 px-3 text-right">1h Agree</th>
                <th className="py-2 px-3 text-right">24h Agree</th>
                <th className="py-2 px-3 text-right">30d Agree</th>
                <th className="py-2 px-3 text-right">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-mono">
                    {validatorsLoading
                      ? 'Fetching XRPLF Validator History Service...'
                      : 'No matching validators loaded.'}
                  </td>
                </tr>
              ) : (
                filtered.map((v) => {
                  const lastPulse = validatorLastSeen[v.publicKey] ?? (v.masterKey ? validatorLastSeen[v.masterKey] : undefined);
                  const pulsing = Boolean(lastPulse && now - lastPulse < 15_000);
                  const fmtScore = (s: number | null) =>
                    s === null ? '—' : `${(s * 100).toFixed(2)}%`;

                  return (
                    <tr key={v.publicKey} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${
                            pulsing
                              ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]'
                              : v.unl
                                ? 'bg-cyan-500/40'
                                : 'bg-slate-700'
                          }`}
                          title={pulsing ? 'Live validation received' : 'Waiting for validation pulse'}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 font-medium text-slate-100">
                          {v.domain ? (
                            <>
                              {v.domainVerified && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                              <span>{v.domain}</span>
                            </>
                          ) : (
                            <span className="text-slate-500 italic">Unverified Domain</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                        {shortenAddress(v.publicKey, 10, 6)}
                      </td>
                      <td className="py-2.5 px-3">
                        {v.unl ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[10px] font-mono text-emerald-300">
                            UNL
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-slate-400">
                            Validator
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                        {fmtScore(v.agreement1h)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        <span
                          className={
                            (v.agreement24h ?? 0) >= 0.995
                              ? 'text-emerald-300'
                              : (v.agreement24h ?? 0) >= 0.95
                                ? 'text-amber-300'
                                : 'text-slate-400'
                          }
                        >
                          {fmtScore(v.agreement24h)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                        {fmtScore(v.agreement30d)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-cyan-300">
                        {v.serverVersion ?? '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
