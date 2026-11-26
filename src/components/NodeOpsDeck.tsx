import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Check,
  Copy,
  FileDiff,
  FileText,
  FolderOpen,
  GitBranch,
  HardDrive,
  Lock,
  Network,
  Power,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Shield,
  Terminal,
  Unlock,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import {
  computeUnifiedLineDiff,
  generateRippledConfigBundle,
  type HardwareSizingPreset,
  type LedgerDbBackend,
} from '../shared/studioUtils';
import type { DockerNodeStatus } from '../shared/types';
import { diagnoseNodeHealth, NODE_SYNC_STAGES } from '../shared/v027Utils';
import { shortenAddress } from '../shared/xrplCodec';
import { useCommandStore } from '../store/useCommandStore';

type NodeSubTab = 'overview' | 'docker' | 'config-studio' | 'peers' | 'amendments' | 'admin' | 'logs';

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

  // Track 1: Docker Manager State
  const [dockerStatus, setDockerStatus] = useState<DockerNodeStatus | null>(null);
  const [dockerBusy, setDockerBusy] = useState(false);
  const [dockerBanner, setDockerBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [dockerNet, setDockerNet] = useState<'mainnet' | 'testnet' | 'devnet'>('testnet');
  const [dockerSizing, setDockerSizing] = useState<HardwareSizingPreset>('32gb-standard');
  const [dockerDb, setDockerDb] = useState<LedgerDbBackend>('NuDB');
  const [dockerRetention, setDockerRetention] = useState('2000');
  const [dockerLogs, setDockerLogs] = useState<string[]>([]);
  const [storagePathInput, setStoragePathInput] = useState('');
  const [storageBusy, setStorageBusy] = useState(false);

  // Track 1: Visual rippled.cfg & validators.txt Diff Studio State
  const [cfgDir, setCfgDir] = useState('');
  const [baselineCfg, setBaselineCfg] = useState('');
  const [draftCfg, setDraftCfg] = useState('');
  const [draftValidators, setDraftValidators] = useState('');
  const [cfgBanner, setCfgBanner] = useState<{ ok: boolean; text: string } | null>(null);

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

  const refreshDocker = async () => {
    const st = await getXrplBridge().dockerGetStatus();
    setDockerStatus(st);
    if (st.storageRoot) {
      setStoragePathInput(st.storageRoot);
    }
    if (st.containerExists) {
      const lg = await getXrplBridge().dockerReadLogs(80);
      if (lg.ok) setDockerLogs(lg.lines);
    }
  };

  const handleChooseStorageFolder = async () => {
    setStorageBusy(true);
    setDockerBanner(null);
    const res = await getXrplBridge().dockerChooseStorageFolder();
    setStorageBusy(false);
    if (res.cancelled) return;
    if (res.ok && res.status) {
      setDockerStatus(res.status);
      setStoragePathInput(res.status.storageRoot);
      setCfgDir(res.status.configDir);
      setDockerBanner({
        ok: true,
        text: `Node storage folder updated to ${res.status.storageRoot} (${res.storageInfo?.freeGb !== null && res.storageInfo?.freeGb !== undefined ? `${res.storageInfo.freeGb} GB free` : 'writable'}).`,
      });
    } else {
      setDockerBanner({ ok: false, text: res.error ?? 'Could not select storage folder.' });
    }
  };

  const handleApplyStoragePath = async (customPath: string | null) => {
    setStorageBusy(true);
    setDockerBanner(null);
    const res = await getXrplBridge().dockerSetStorageFolder(customPath);
    setStorageBusy(false);
    if (res.ok && res.status) {
      setDockerStatus(res.status);
      setStoragePathInput(res.status.storageRoot);
      setCfgDir(res.status.configDir);
      setDockerBanner({
        ok: true,
        text: customPath
          ? `Node storage folder set to ${res.status.storageRoot}.`
          : `Reset node storage folder to default (${res.status.storageRoot}).`,
      });
    } else {
      setDockerBanner({ ok: false, text: res.error ?? 'Invalid or unwritable storage folder.' });
    }
  };

  const loadConfigStudio = async (dirOverride?: string) => {
    const bundle = await getXrplBridge().nodeConfigLoad(dirOverride);
    setCfgDir(bundle.configDir);
    setBaselineCfg(bundle.rippledCfg);
    setDraftCfg(bundle.rippledCfg);
    setDraftValidators(bundle.validatorsTxt);
  };

  useEffect(() => {
    if (subTab === 'docker') void refreshDocker();
    if (subTab === 'config-studio' && !draftCfg) void loadConfigStudio();
  }, [subTab]);

  const diffLines = useMemo(
    () => computeUnifiedLineDiff(baselineCfg, draftCfg),
    [baselineCfg, draftCfg]
  );
  const changedDiffCount = useMemo(
    () => diffLines.filter((d) => d.type !== 'same').length,
    [diffLines]
  );

  const handleCopySsh = () => {
    void navigator.clipboard.writeText(sshSnippet);
    setCopiedSsh(true);
    setTimeout(() => setCopiedSsh(false), 1800);
  };

  const handleProvisionDocker = async () => {
    setDockerBusy(true);
    setDockerBanner(null);
    const res = await getXrplBridge().dockerProvisionNode({
      network: dockerNet,
      sizing: dockerSizing,
      dbBackend: dockerDb,
      onlineDeleteLedgers: Number(dockerRetention) || 2000,
      storageRoot: storagePathInput.trim() || undefined,
    });
    setDockerBusy(false);
    if (res.status) setDockerStatus(res.status);
    setDockerBanner({
      ok: res.ok,
      text: res.ok ? res.message ?? 'Container provisioned!' : res.error ?? 'Provision failed',
    });
    if (res.ok) {
      void refreshDocker();
      setTimeout(() => void pollOwnNode(), 2500);
    }
  };

  const handleDockerAction = async (action: 'start' | 'stop' | 'restart' | 'remove') => {
    setDockerBusy(true);
    const res = await getXrplBridge().dockerLifecycleAction(action);
    setDockerBusy(false);
    if (res.status) setDockerStatus(res.status);
    setDockerBanner({
      ok: res.ok,
      text: res.ok ? res.message ?? `Container ${action} complete` : res.error ?? 'Action failed',
    });
    void refreshDocker();
  };

  const handleApplyPresetToEditor = () => {
    const generated = generateRippledConfigBundle({
      network: dockerNet,
      sizing: dockerSizing,
      dbBackend: dockerDb,
      dataDir: '/var/lib/rippled',
      onlineDeleteLedgers: Number(dockerRetention) || 2000,
      maxPeers: dockerSizing === '64gb-full' ? 80 : 50,
      enablePublicWs: false,
    });
    setDraftCfg(generated.rippledCfg);
    setDraftValidators(generated.validatorsTxt);
  };

  const handleSaveConfigWithBackup = async () => {
    const res = await getXrplBridge().nodeConfigSaveWithBackup({
      configDir: cfgDir,
      rippledCfg: draftCfg,
      validatorsTxt: draftValidators,
    });
    if (res.ok) {
      setBaselineCfg(draftCfg);
      setCfgBanner({
        ok: true,
        text: `Saved rippled.cfg & validators.txt (${res.backupPaths?.length ?? 0} timestamped .bak backup(s) created).`,
      });
    } else {
      setCfgBanner({ ok: false, text: res.error ?? 'Failed to save config' });
    }
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

  const healthDiagnosis = useMemo(
    () => diagnoseNodeHealth(nodeSnapshot, dockerStatus),
    [nodeSnapshot, dockerStatus]
  );

  return (
    <div className="space-y-4">
      {/* Connection & Config Header */}
      <div className="hud-panel rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-cyan-400" />
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Self-Hosted rippled / Clio Node Operations &amp; Docker Launcher
              </h2>
              <p className="text-[11px] text-slate-400">
                1-click local Docker `xrpld` orchestration, `rippled.cfg` diff studio, admin telemetry &amp; log tailing
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

      {/* Sub-tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'overview', label: 'Node Telemetry', icon: Server },
          { id: 'docker', label: '1-Click Docker Node', icon: Box },
          { id: 'config-studio', label: 'rippled.cfg Diff Studio', icon: FileDiff },
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

      {/* v0.2.7-beta: Node Health Doctor & 5-Stage Sync Tracker */}
      {subTab === 'overview' && (
        <div className="hud-panel rounded-xl p-4 space-y-3 border border-cyan-400/25">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
              <Shield className="w-4 h-4" />
              Node Health Doctor &amp; Sync Stage
            </div>
            <div className="flex items-center gap-1 font-mono text-[10px]">
              {NODE_SYNC_STAGES.map((st, idx) => (
                <span
                  key={st}
                  className={`px-2 py-0.5 rounded uppercase border ${
                    idx < healthDiagnosis.stageIndex
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                      : idx === healthDiagnosis.stageIndex
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  {st}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {healthDiagnosis.findings.map((f, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-lg border font-mono text-[11px] ${
                  f.severity === 'error'
                    ? 'bg-rose-500/10 border-rose-400/40 text-rose-200'
                    : f.severity === 'warning'
                      ? 'bg-amber-500/10 border-amber-400/35 text-amber-200'
                      : f.severity === 'ok'
                        ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                        : 'bg-slate-950/75 border-slate-800 text-slate-300'
                }`}
              >
                <div className="font-semibold">{f.title}</div>
                <div className="text-[10px] opacity-85 mt-0.5">{f.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Telemetry KPI Grid when connected */}
      {nodeSnapshot?.connected && subTab === 'overview' && (
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

      {/* SUB-TAB: OVERVIEW */}
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
              <div className="text-slate-500 py-4">
                {nodeSnapshot?.error ?? 'Poll a running rippled node (or launch a local Docker node in the next tab) to inspect state accounting.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB: 1-CLICK DOCKER NODE MANAGER */}
      {subTab === 'docker' && (
        <div className="space-y-4">
          <div className="hud-panel rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                  Cross-Platform Docker `xrpld` Node Orchestrator
                </h3>
                <p className="text-[11px] text-slate-400">
                  Provisions `xrpllabsofficial/xrpld:latest` with Admin RPC (`127.0.0.1:5005`) and WS (`127.0.0.1:6006`) bound strictly to loopback.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshDocker()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Probe Docker
              </button>
            </div>

            {dockerBanner && (
              <div
                className={`p-3 rounded-xl font-mono text-xs border ${
                  dockerBanner.ok
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                }`}
              >
                {dockerBanner.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono text-xs">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-[10px] uppercase text-slate-500">Docker Engine</div>
                <div className={dockerStatus?.daemonRunning ? 'text-emerald-300 font-bold mt-1' : 'text-amber-300 font-bold mt-1'}>
                  {dockerStatus?.daemonRunning
                    ? `ONLINE (v${dockerStatus.dockerVersion ?? ''})`
                    : 'OFFLINE / UNAVAILABLE'}
                </div>
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-[10px] uppercase text-slate-500">Managed Container</div>
                <div className="text-white font-bold mt-1">
                  {dockerStatus?.containerExists
                    ? `${dockerStatus.containerState?.toUpperCase()}`
                    : 'NOT CREATED'}
                </div>
              </div>

              <div className="md:col-span-2 rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase text-slate-500">Active Ledger Data Directory</div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                      dockerStatus?.storageInfo?.isDefault === false
                        ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300'
                        : 'bg-slate-900 border border-slate-700 text-slate-400'
                    }`}
                  >
                    {dockerStatus?.storageInfo?.isDefault === false ? 'CUSTOM DRIVE' : 'DEFAULT DRIVE'}
                  </span>
                </div>
                <div className="text-cyan-300 text-[11px] truncate mt-1" title={dockerStatus?.dataDir}>
                  {dockerStatus?.dataDir || '—'}
                </div>
              </div>
            </div>

            {/* Custom Node Storage Drive & Folder Picker (v0.1.1-beta) */}
            <div className="rounded-xl bg-slate-950/90 border border-cyan-400/25 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-cyan-400" />
                  <div>
                    <div className="text-xs font-semibold text-cyan-200">
                      Node Storage Drive &amp; Database Location
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Store large <code className="text-cyan-300">NuDB</code> / <code className="text-cyan-300">RocksDB</code> ledger history on a fast secondary internal NVMe or external SSD instead of your OS drive.
                    </div>
                  </div>
                </div>

                {dockerStatus?.storageInfo?.freeGb !== null &&
                  dockerStatus?.storageInfo?.freeGb !== undefined && (
                    <div className="font-mono text-right">
                      <div
                        className={`text-xs font-bold tabular-nums ${
                          dockerStatus.storageInfo.freeGb >= 100
                            ? 'text-emerald-300'
                            : dockerStatus.storageInfo.freeGb >= 30
                              ? 'text-amber-300'
                              : 'text-rose-300'
                        }`}
                      >
                        {dockerStatus.storageInfo.freeGb >= 1024
                          ? `${(dockerStatus.storageInfo.freeGb / 1024).toFixed(2)} TB free`
                          : `${dockerStatus.storageInfo.freeGb.toFixed(1)} GB free`}
                      </div>
                      {dockerStatus.storageInfo.totalGb !== null &&
                        dockerStatus.storageInfo.totalGb !== undefined && (
                          <div className="text-[10px] text-slate-500 tabular-nums">
                            of{' '}
                            {dockerStatus.storageInfo.totalGb >= 1024
                              ? `${(dockerStatus.storageInfo.totalGb / 1024).toFixed(2)} TB`
                              : `${dockerStatus.storageInfo.totalGb.toFixed(0)} GB`}{' '}
                            drive
                          </div>
                        )}
                    </div>
                  )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={storagePathInput}
                  onChange={(e) => setStoragePathInput(e.target.value)}
                  placeholder="/mnt/nvme-ssd/xrpl-node"
                  className="flex-1 min-w-[240px] rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  disabled={storageBusy}
                  onClick={() => void handleChooseStorageFolder()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Browse Drive / Folder…
                </button>
                <button
                  type="button"
                  disabled={storageBusy || !storagePathInput.trim()}
                  onClick={() => void handleApplyStoragePath(storagePathInput.trim())}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 hover:border-emerald-400/50 disabled:opacity-40"
                >
                  Apply Path
                </button>
                {dockerStatus?.storageInfo?.isDefault === false && (
                  <button
                    type="button"
                    disabled={storageBusy}
                    onClick={() => void handleApplyStoragePath(null)}
                    title="Reset back to default app storage directory"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-400 hover:text-white disabled:opacity-40"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Default
                  </button>
                )}
              </div>

              {dockerStatus?.storageInfo &&
                dockerStatus.storageInfo.freeGb !== null &&
                dockerStatus.storageInfo.freeGb < 30 && (
                  <div className="flex items-center gap-2 text-[11px] font-mono text-rose-200 bg-rose-500/10 border border-rose-400/30 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-300" />
                    Low free space ({dockerStatus.storageInfo.freeGb.toFixed(1)} GB) on this drive. Pick a larger internal NVMe or external SSD for Mainnet ledger storage.
                  </div>
                )}

              {dockerStatus?.containerExists &&
                dockerStatus.mountedDataDir &&
                dockerStatus.dataDir &&
                dockerStatus.mountedDataDir !== dockerStatus.dataDir && (
                  <div className="flex items-center gap-2 text-[11px] font-mono text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                    Running container is currently mounted at <code className="text-amber-100">{dockerStatus.mountedDataDir}</code>. Click <strong>Provision &amp; Launch</strong> to re-mount on your new folder.
                  </div>
                )}

              <div className="text-[10px] font-mono text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                <span>Config: {dockerStatus?.configDir || '—'}</span>
                <span>Ledger DB: {dockerStatus?.dataDir ? `${dockerStatus.dataDir}/db` : '—'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Network</label>
                <select
                  value={dockerNet}
                  onChange={(e) => setDockerNet(e.target.value as typeof dockerNet)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                >
                  <option value="testnet">XRPL Testnet (Fastest Sync)</option>
                  <option value="mainnet">XRPL Mainnet (dUNL)</option>
                  <option value="devnet">XRPL Devnet</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Hardware Sizing
                </label>
                <select
                  value={dockerSizing}
                  onChange={(e) => setDockerSizing(e.target.value as HardwareSizingPreset)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                >
                  <option value="16gb-light">16 GB RAM (Medium)</option>
                  <option value="32gb-standard">32 GB RAM (Large)</option>
                  <option value="64gb-full">64 GB+ RAM (Huge)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  KV Store Backend
                </label>
                <select
                  value={dockerDb}
                  onChange={(e) => setDockerDb(e.target.value as LedgerDbBackend)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                >
                  <option value="NuDB">NuDB (SSD Recommended)</option>
                  <option value="RocksDB">RocksDB</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  online_delete Ledgers
                </label>
                <input
                  type="number"
                  min="256"
                  value={dockerRetention}
                  onChange={(e) => setDockerRetention(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={dockerBusy || !dockerStatus?.daemonRunning}
                onClick={() => void handleProvisionDocker()}
                className="px-4 py-2 rounded-xl bg-emerald-500/25 border border-emerald-400 text-xs font-mono font-semibold text-emerald-100 disabled:opacity-40"
              >
                {dockerBusy ? 'Working…' : 'Provision & Launch Local Docker Node'}
              </button>

              {dockerStatus?.containerExists && (
                <>
                  <button
                    type="button"
                    disabled={dockerBusy || dockerStatus.containerRunning}
                    onClick={() => void handleDockerAction('start')}
                    className="px-3 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200 disabled:opacity-40"
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    disabled={dockerBusy || !dockerStatus.containerRunning}
                    onClick={() => void handleDockerAction('stop')}
                    className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/50 text-xs font-mono text-amber-200 disabled:opacity-40"
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    disabled={dockerBusy}
                    onClick={() => void handleDockerAction('restart')}
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 disabled:opacity-40"
                  >
                    Restart
                  </button>
                  <button
                    type="button"
                    disabled={dockerBusy}
                    onClick={() => void handleDockerAction('remove')}
                    className="px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-400/50 text-xs font-mono text-rose-200 disabled:opacity-40"
                  >
                    Remove Container
                  </button>
                </>
              )}
            </div>

            {dockerLogs.length > 0 && (
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-[11px] max-h-56 overflow-auto space-y-0.5 text-slate-300">
                {dockerLogs.map((l, idx) => (
                  <div key={idx}>{l}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB: VISUAL RIPPLED.CFG & VALIDATORS.TXT DIFF STUDIO */}
      {subTab === 'config-studio' && (
        <div className="hud-panel rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">
                Visual `rippled.cfg` &amp; `validators.txt` Diff Studio
              </h3>
              <p className="text-[11px] text-slate-400">
                Review exact line-by-line diffs before writing. Automatically creates timestamped `.bak` backups.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleApplyPresetToEditor}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-200"
              >
                Generate Preset ({dockerNet.toUpperCase()} / {dockerSizing})
              </button>
              <button
                type="button"
                onClick={() => void handleSaveConfigWithBackup()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500/25 border border-emerald-400 text-xs font-mono font-semibold text-emerald-100"
              >
                <Save className="w-3.5 h-3.5" />
                Save with Auto-Backup ({changedDiffCount} diff lines)
              </button>
            </div>
          </div>

          {cfgBanner && (
            <div
              className={`p-2.5 rounded-lg text-xs font-mono border ${
                cfgBanner.ok
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
              }`}
            >
              {cfgBanner.text}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={cfgDir}
              onChange={(e) => setCfgDir(e.target.value)}
              placeholder="Config directory path"
              className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white"
            />
            <button
              type="button"
              onClick={() => void loadConfigStudio(cfgDir)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
            >
              Load Dir
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">rippled.cfg</div>
              <textarea
                rows={15}
                value={draftCfg}
                onChange={(e) => setDraftCfg(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">validators.txt</div>
              <textarea
                rows={15}
                value={draftValidators}
                onChange={(e) => setDraftValidators(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-cyan-300 mb-1">
                Live Unified Diff Preview (`rippled.cfg`)
              </div>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-[11px] h-[318px] overflow-auto space-y-0.5">
                {changedDiffCount === 0 ? (
                  <div className="text-slate-500">No unsaved changes vs baseline.</div>
                ) : (
                  diffLines
                    .filter((d) => d.type !== 'same')
                    .map((d, idx) => (
                      <div
                        key={idx}
                        className={
                          d.type === 'added'
                            ? 'bg-emerald-500/15 text-emerald-300 px-1.5 rounded'
                            : 'bg-rose-500/15 text-rose-300 px-1.5 rounded'
                        }
                      >
                        {d.type === 'added' ? '+' : '-'} {d.text}
                      </div>
                    ))
                )}
              </div>
            </div>
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
                    description: `This will send the admin "stop" RPC command to ${nodeConfig.rpcUrl}.`,
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
              {dockerStatus?.dataDir && (
                <button
                  type="button"
                  onClick={() => {
                    updateNodeConfig({ logFilePath: `${dockerStatus.dataDir}/log/debug.log` });
                    setTimeout(() => void refreshNodeLogs(), 50);
                  }}
                  className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-400/40 text-[11px] font-mono text-emerald-200 hover:bg-emerald-500/25"
                >
                  Use Docker Log
                </button>
              )}
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
