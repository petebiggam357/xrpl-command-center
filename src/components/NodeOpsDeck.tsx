import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  FileText,
  GitBranch,
  Lock,
  Network,
  Power,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Terminal,
  Unlock,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

type NodeSubTab = 'overview' | 'peers' | 'amendments' | 'admin' | 'logs';

function formatUptime(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec % 60}s`;
}

export const NodeOpsDeck: React.FC = () => {
  const nodeConfig = useCommandStore((s) => s.nodeConfig);
  const nodeSnapshot = useCommandStore((s) => s.nodeSnapshot);
  const nodePolling = useCommandStore((s) => s.nodePolling);
  const nodeAutoPoll = useCommandStore((s) => s.nodeAutoPoll);
  const nodeLogs = useCommandStore((s) => s.nodeLogs);
  const nodeLogsError = useCommandStore((s) => s.nodeLogsError);
  const updateNodeConfig = useCommandStore((s) => s.updateNodeConfig);
  const setNodeAutoPoll = useCommandStore((s) => s.setNodeAutoPoll);
  const pollOwnNode = useCommandStore((s) => s.pollOwnNode);
  const refreshNodeLogs = useCommandStore((s) => s.refreshNodeLogs);
  const connectNetwork = useCommandStore((s) => s.connectNetwork);

  const [subTab, setSubTab] = useState<NodeSubTab>('overview');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [copiedSsh, setCopiedSsh] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'WRN' | 'ERR'>('ALL');

  // Admin action form state
  const [peerIp, setPeerIp] = useState('');
  const [peerPort, setPeerPort] = useState('51235');
  const [logSeverity, setLogSeverity] = useState('warning');
  const [canDeleteValue, setCanDeleteValue] = useState('now');
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    description: string;
    method: string;
    params: Record<string, unknown>;
    danger?: boolean;
  } | null>(null);
  const [adminOutput, setAdminOutput] = useState<{ ok: boolean; text: string } | null>(null);
  const [executingAdmin, setExecutingAdmin] = useState(false);

  const sshSnippet = 'ssh -N -L 5005:127.0.0.1:5005 -L 6006:127.0.0.1:6006 user@your-xrpl-node';

  const handleCopySsh = () => {
    void navigator.clipboard.writeText(sshSnippet);
    setCopiedSsh(true);
    setTimeout(() => setCopiedSsh(false), 1800);
  };

  const runConfirmedAdminAction = async () => {
    if (!pendingAction) return;
    setExecutingAdmin(true);
    const res = await getXrplBridge().nodeOpsAdminCommand(
      nodeConfig,
      pendingAction.method,
      pendingAction.params
    );
    setExecutingAdmin(false);
    setPendingAction(null);
    if (res.ok) {
      setAdminOutput({
        ok: true,
        text: JSON.stringify(res.result ?? { status: 'success' }, null, 2),
      });
      void pollOwnNode();
    } else {
      setAdminOutput({ ok: false, text: res.error ?? 'Admin command failed' });
    }
  };

  const isLoopback =
    nodeConfig.rpcUrl.includes('127.0.0.1') || nodeConfig.rpcUrl.includes('localhost');

  const filteredLogs = nodeLogs.filter((line) => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'WRN') return /WRN|ERR|FTL/i.test(line);
    return /ERR|FTL/i.test(line);
  });

  const pendingAmendments = (nodeSnapshot?.amendments ?? []).filter((a) => !a.enabled);
  const enabledAmendments = (nodeSnapshot?.amendments ?? []).filter((a) => a.enabled);

  return (
    <div className="space-y-4">
      {/* Connection & Config Header */}
      <div className="hud-panel rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-cyan-400" />
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Self-Hosted rippled / Clio Node Operations Console
              </h2>
              <p className="text-[11px] text-slate-400">
                Loopback &amp; SSH-tunneled admin telemetry, peer management, amendments, and local log tailing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {nodeConfig.wsUrl && (
              <button
                type="button"
                onClick={() => void connectNetwork('custom', nodeConfig.wsUrl)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-xs font-mono text-emerald-200 hover:bg-emerald-500/25"
              >
                <Radio className="w-3.5 h-3.5" />
                Stream Live Visuals From My Node
              </button>
            )}

            <button
              type="button"
              onClick={() => setNodeAutoPoll(!nodeAutoPoll)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                nodeAutoPoll
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              Auto-Poll 5s: {nodeAutoPoll ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={() => void pollOwnNode()}
              disabled={nodePolling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200 hover:bg-cyan-500/30"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${nodePolling ? 'animate-spin' : ''}`} />
              Poll Node
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
              Admin JSON-RPC Endpoint (HTTP)
            </label>
            <input
              type="text"
              value={nodeConfig.rpcUrl}
              onChange={(e) => updateNodeConfig({ rpcUrl: e.target.value })}
              placeholder="http://127.0.0.1:5005"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
              Local Node WebSocket (Optional Stream Source)
            </label>
            <input
              type="text"
              value={nodeConfig.wsUrl ?? ''}
              onChange={(e) => updateNodeConfig({ wsUrl: e.target.value })}
              placeholder="ws://127.0.0.1:6006"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
              Local debug.log File Path
            </label>
            <input
              type="text"
              value={nodeConfig.logFilePath ?? ''}
              onChange={(e) => updateNodeConfig({ logFilePath: e.target.value })}
              placeholder="/var/log/rippled/debug.log"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {!isLoopback && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/40 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Security Advisory: Never expose `rippled` admin port `5005` to the public internet. Prefer
              loopback `127.0.0.1` over an SSH tunnel.
            </span>
          </div>
        )}

        {/* SSH Tunnel Quick Helper */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-mono">
          <div className="flex items-center gap-2 text-slate-400 overflow-x-auto">
            <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-slate-500">Remote VPS Tunnel:</span>
            <code className="text-cyan-200">{sshSnippet}</code>
          </div>
          <button
            type="button"
            onClick={handleCopySsh}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-400/50"
          >
            {copiedSsh ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copiedSsh ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Status Banner when disconnected / not yet polled */}
      {(!nodeSnapshot || !nodeSnapshot.connected) && (
        <div className="hud-panel rounded-xl p-5 border-dashed border-slate-700 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">
              {nodeSnapshot?.error ? 'Unable to Reach Local / Tunneled Node' : 'Ready to Connect Your rippled / Clio Node'}
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              {nodeSnapshot?.error
                ? `${nodeSnapshot.error} — Verify rippled is running on ${nodeConfig.rpcUrl} (or your SSH tunnel is open), then click Poll Node.`
                : 'Point the Admin RPC URL above to your local rippled instance (default http://127.0.0.1:5005) or SSH-tunneled server and click Poll Node to inspect sync health, peers, amendments, and logs.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void pollOwnNode()}
            className="px-4 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200 hover:bg-cyan-500/30"
          >
            Connect &amp; Poll Now
          </button>
        </div>
      )}

      {/* Telemetry KPI Grid when connected */}
      {nodeSnapshot?.connected && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="hud-panel rounded-xl p-3">
            <div className="text-[10px] font-mono uppercase text-slate-400">Server State</div>
            <div
              className={`mt-1 text-lg font-mono font-bold uppercase ${
                nodeSnapshot.serverState === 'full' || nodeSnapshot.serverState === 'proposing'
                  ? 'text-emerald-300'
                  : 'text-amber-300'
              }`}
            >
              {nodeSnapshot.serverState ?? 'unknown'}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              {nodeSnapshot.isValidator ? 'VALIDATOR MODE' : 'STOCK / HUB NODE'}
            </div>
          </div>

          <div className="hud-panel rounded-xl p-3">
            <div className="text-[10px] font-mono uppercase text-slate-400">Validated Ledger</div>
            <div className="mt-1 text-lg font-mono font-bold text-white tabular-nums">
              {nodeSnapshot.validatedLedgerSeq ? `#${nodeSnapshot.validatedLedgerSeq.toLocaleString()}` : '—'}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Age: {nodeSnapshot.validatedLedgerAgeSec ?? 0}s
            </div>
          </div>

          <div className="hud-panel rounded-xl p-3">
            <div className="text-[10px] font-mono uppercase text-slate-400">Peers (In / Out)</div>
            <div className="mt-1 text-lg font-mono font-bold text-cyan-300 tabular-nums">
              {nodeSnapshot.peersCount ?? 0}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {nodeSnapshot.inboundPeers ?? 0} in / {nodeSnapshot.outboundPeers ?? 0} out
            </div>
          </div>

          <div className="hud-panel rounded-xl p-3">
            <div className="text-[10px] font-mono uppercase text-slate-400">IO Latency &amp; Load</div>
            <div className="mt-1 text-lg font-mono font-bold text-slate-100 tabular-nums">
              {nodeSnapshot.ioLatencyMs ?? 0}ms
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Load Factor: {nodeSnapshot.loadFactor ?? 1}x
            </div>
          </div>

          <div className="hud-panel rounded-xl p-3">
            <div className="text-[10px] font-mono uppercase text-slate-400">Uptime</div>
            <div className="mt-1 text-lg font-mono font-bold text-emerald-300 tabular-nums">
              {formatUptime(nodeSnapshot.uptimeSec)}
            </div>
            <div className="text-[10px] font-mono text-slate-400 truncate">
              v{nodeSnapshot.buildVersion ?? '—'}
            </div>
          </div>

          <div className="hud-panel rounded-xl p-3">
            <div className="text-[10px] font-mono uppercase text-slate-400">Admin RPC</div>
            <div
              className={`mt-1 text-lg font-mono font-bold ${
                nodeSnapshot.adminAvailable ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {nodeSnapshot.adminAvailable ? 'AUTHORIZED' : 'PUBLIC ONLY'}
            </div>
            <div className="text-[10px] font-mono text-slate-400 truncate">
              can_delete: {String(nodeSnapshot.canDelete ?? 'n/a')}
            </div>
          </div>
        </div>
      )}

      {/* Sub-tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'overview', label: 'Node Telemetry', icon: Server },
          { id: 'peers', label: `Peers (${nodeSnapshot?.peers.length ?? 0})`, icon: Network },
          {
            id: 'amendments',
            label: `Amendments (${pendingAmendments.length} pending)`,
            icon: GitBranch,
          },
          { id: 'admin', label: 'Admin Controls', icon: Shield },
          { id: 'logs', label: 'Local Log Tailer', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSubTab(tab.id as NodeSubTab);
                if (tab.id === 'logs') void refreshNodeLogs();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                subTab === tab.id
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-panel border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab Content */}
      {subTab === 'overview' && (
        <div className="hud-panel rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="space-y-2">
            <div className="text-[11px] uppercase text-cyan-300 font-semibold">Identity &amp; Storage</div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-slate-500">Complete Ledgers</span>
              <span className="text-slate-200">{nodeSnapshot?.completeLedgers ?? '—'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-slate-500">Node Public Key</span>
              <span className="text-slate-200">{shortenAddress(nodeSnapshot?.pubkeyNode, 12, 8)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-slate-500">Validator Public Key</span>
              <span className="text-emerald-300">
                {nodeSnapshot?.isValidator ? shortenAddress(nodeSnapshot.pubkeyValidator, 12, 8) : 'Not Validating'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-slate-500">Validation Quorum</span>
              <span className="text-slate-200">{nodeSnapshot?.validationQuorum ?? '—'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Host ID</span>
              <span className="text-slate-200">{nodeSnapshot?.hostId ?? '—'}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] uppercase text-cyan-300 font-semibold">State Accounting</div>
            {nodeSnapshot?.stateAccounting ? (
              Object.entries(nodeSnapshot.stateAccounting).map(([st, data]) => (
                <div key={st} className="flex justify-between py-1.5 border-b border-slate-800/70">
                  <span className="text-slate-400 uppercase">{st}</span>
                  <span className="text-slate-200 tabular-nums">
                    {formatUptime(Math.round(Number(data.durationUs) / 1_000_000))} ({data.transitions}x)
                  </span>
                </div>
              ))
            ) : (
              <div className="text-slate-500 py-4">Poll a running rippled node to inspect state accounting.</div>
            )}
          </div>
        </div>
      )}

      {subTab === 'peers' && (
        <div className="hud-panel rounded-xl p-4">
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2.5">Address</th>
                  <th className="py-2 px-2.5">Direction</th>
                  <th className="py-2 px-2.5 text-right">Latency</th>
                  <th className="py-2 px-2.5">Sanity</th>
                  <th className="py-2 px-2.5">Complete Ledgers</th>
                  <th className="py-2 px-2.5 text-right">Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(nodeSnapshot?.peers ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No peer data available (requires admin access on port 5005).
                    </td>
                  </tr>
                ) : (
                  nodeSnapshot!.peers.map((p, idx) => (
                    <tr key={`${p.address}-${idx}`} className="hover:bg-slate-900/60">
                      <td className="py-2 px-2.5 text-slate-200">{p.address}</td>
                      <td className="py-2 px-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            p.inbound ? 'bg-cyan-500/15 text-cyan-300' : 'bg-violet-500/15 text-violet-300'
                          }`}
                        >
                          {p.inbound ? 'INBOUND' : 'OUTBOUND'}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-right tabular-nums text-emerald-300">
                        {p.latencyMs}ms
                      </td>
                      <td className="py-2 px-2.5 text-slate-300">{p.sanity ?? 'sane'}</td>
                      <td className="py-2 px-2.5 text-slate-400">{p.completeLedgers ?? '—'}</td>
                      <td className="py-2 px-2.5 text-right text-cyan-300">{p.version}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'amendments' && (
        <div className="hud-panel rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-xs font-mono uppercase text-amber-300 mb-2">
              Pending / Voting Amendments ({pendingAmendments.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {pendingAmendments.length === 0 ? (
                <div className="text-xs font-mono text-slate-500">
                  No pending amendments reported (poll a connected node first).
                </div>
              ) : (
                pendingAmendments.map((a) => (
                  <div
                    key={a.id}
                    className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="min-w-0">
                      <div className="text-white font-semibold truncate">{a.name}</div>
                      <div className="text-[10px] text-slate-500">{shortenAddress(a.id, 10, 8)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      {a.count !== undefined && a.threshold !== undefined ? (
                        <span className="text-amber-300 tabular-nums">
                          {a.count}/{a.threshold} votes
                        </span>
                      ) : (
                        <span className="text-slate-400">{a.supported ? 'Supported' : 'Unsupported'}</span>
                      )}
                      {a.vetoed && (
                        <div className="text-[10px] text-rose-400">Vetoed: {String(a.vetoed)}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-mono uppercase text-emerald-300 mb-2">
              Enabled Amendments ({enabledAmendments.length})
            </h3>
            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
              {enabledAmendments.map((a) => (
                <span
                  key={a.id}
                  className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-400/30 text-[11px] font-mono text-emerald-200"
                >
                  {a.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'admin' && (
        <div className="hud-panel rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">
                Confirmation-Gated Admin RPC Actions
              </h3>
              <p className="text-[11px] text-slate-400">
                Locked read-only by default. Unlock to issue safe administrative commands to your own node.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdminUnlocked((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                adminUnlocked
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                  : 'bg-slate-950 border-slate-700 text-slate-300'
              }`}
            >
              {adminUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {adminUnlocked ? 'Admin Actions Unlocked' : 'Unlock Admin Actions'}
            </button>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!adminUnlocked ? 'opacity-45 pointer-events-none' : ''}`}>
            {/* Connect Peer */}
            <div className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-2">
              <div className="text-xs font-mono font-semibold text-cyan-300">Connect Peer (`connect`)</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={peerIp}
                  onChange={(e) => setPeerIp(e.target.value)}
                  placeholder="Peer IP or hostname"
                  className="flex-1 rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={peerPort}
                  onChange={(e) => setPeerPort(e.target.value)}
                  placeholder="51235"
                  className="w-20 rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <button
                type="button"
                disabled={!peerIp.trim()}
                onClick={() =>
                  setPendingAction({
                    title: 'Connect Peer',
                    description: `Instruct your rippled node to establish an outbound peer connection to ${peerIp.trim()}:${peerPort}.`,
                    method: 'connect',
                    params: { ip: peerIp.trim(), port: Number(peerPort) || 51235 },
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-xs font-mono text-cyan-200 disabled:opacity-40"
              >
                Queue `connect`
              </button>
            </div>

            {/* Adjust Log Level */}
            <div className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-2">
              <div className="text-xs font-mono font-semibold text-cyan-300">Runtime Log Level (`log_level`)</div>
              <select
                value={logSeverity}
                onChange={(e) => setLogSeverity(e.target.value)}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
              >
                <option value="trace">trace (very verbose)</option>
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warning">warning (recommended)</option>
                <option value="error">error</option>
                <option value="fatal">fatal</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setPendingAction({
                    title: 'Update Log Severity',
                    description: `Set rippled base log severity to "${logSeverity}".`,
                    method: 'log_level',
                    params: { severity: logSeverity },
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-xs font-mono text-cyan-200"
              >
                Apply `log_level`
              </button>
            </div>

            {/* Online Deletion */}
            <div className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-2">
              <div className="text-xs font-mono font-semibold text-cyan-300">
                Advisory Online Deletion (`can_delete`)
              </div>
              <select
                value={canDeleteValue}
                onChange={(e) => setCanDeleteValue(e.target.value)}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
              >
                <option value="now">now (prune up to latest validated ledger)</option>
                <option value="always">always (automatic pruning)</option>
                <option value="never">never (pause deletion)</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setPendingAction({
                    title: 'Update Online Deletion (`can_delete`)',
                    description: `Set rippled advisory deletion target to "${canDeleteValue}".`,
                    method: 'can_delete',
                    params: { can_delete: canDeleteValue },
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-xs font-mono text-cyan-200"
              >
                Apply `can_delete`
              </button>
            </div>

            {/* Graceful Stop */}
            <div className="p-3.5 rounded-xl bg-rose-950/25 border border-rose-500/30 space-y-2">
              <div className="text-xs font-mono font-semibold text-rose-300 flex items-center gap-1.5">
                <Power className="w-3.5 h-3.5" />
                Graceful Node Shutdown (`stop`)
              </div>
              <p className="text-[11px] text-slate-400">
                Cleanly flushes NuDB/RocksDB buffers and stops your `rippled` daemon. Requires explicit confirmation.
              </p>
              <button
                type="button"
                onClick={() =>
                  setPendingAction({
                    title: 'Gracefully Stop rippled Daemon?',
                    description: `This will send the admin "stop" RPC command to ${nodeConfig.rpcUrl}. Your node will shut down gracefully and go offline until restarted.`,
                    method: 'stop',
                    params: {},
                    danger: true,
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-400/50 text-xs font-mono text-rose-200 hover:bg-rose-500/30"
              >
                Request Graceful `stop`
              </button>
            </div>
          </div>

          {adminOutput && (
            <div
              className={`rounded-lg p-3 font-mono text-[11px] overflow-x-auto border ${
                adminOutput.ok
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
              }`}
            >
              <pre>{adminOutput.text}</pre>
            </div>
          )}
        </div>
      )}

      {subTab === 'logs' && (
        <div className="hud-panel rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-mono text-slate-300">
              Tail: <span className="text-cyan-300">{nodeConfig.logFilePath || '(not set)'}</span>
            </div>
            <div className="flex items-center gap-2">
              {(['ALL', 'WRN', 'ERR'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLogFilter(lvl)}
                  className={`px-2 py-1 rounded text-[11px] font-mono border ${
                    logFilter === lvl
                      ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  {lvl}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void refreshNodeLogs()}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 hover:border-cyan-400/50"
              >
                <RefreshCw className="w-3 h-3" />
                Reload Tail
              </button>
            </div>
          </div>

          {nodeLogsError ? (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-amber-300">
              {nodeLogsError}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 font-mono text-[11px] max-h-[380px] overflow-auto space-y-1">
              {filteredLogs.length === 0 ? (
                <div className="text-slate-500">No matching log lines loaded.</div>
              ) : (
                filteredLogs.map((line, i) => (
                  <div
                    key={i}
                    className={
                      /ERR|FTL/i.test(line)
                        ? 'text-rose-300'
                        : /WRN/i.test(line)
                          ? 'text-amber-300'
                          : 'text-slate-300'
                    }
                  >
                    {line}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Explicit Confirmation Modal for Admin RPC Commands */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hud-panel rounded-2xl max-w-md w-full p-5 border border-amber-400/50 space-y-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle
                className={`w-5 h-5 ${pendingAction.danger ? 'text-rose-400' : 'text-amber-400'}`}
              />
              <h3 className="text-sm font-bold text-white">{pendingAction.title}</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{pendingAction.description}</p>
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-2.5 font-mono text-[11px] text-cyan-200">
              {JSON.stringify({ method: pendingAction.method, params: pendingAction.params })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={executingAdmin}
                onClick={() => void runConfirmedAdminAction()}
                className={`px-4 py-1.5 rounded-lg text-xs font-mono font-semibold border ${
                  pendingAction.danger
                    ? 'bg-rose-500/25 border-rose-400 text-rose-100 hover:bg-rose-500/40'
                    : 'bg-cyan-500/25 border-cyan-400 text-cyan-100 hover:bg-cyan-500/40'
                }`}
              >
                {executingAdmin ? 'Executing...' : 'Confirm & Execute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
