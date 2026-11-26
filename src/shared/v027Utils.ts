import type { DockerNodeStatus, NetworkId, NodeOpsSnapshot } from './types';

// ============================================================================
// v0.2.7-beta: Node Health Doctor & External Explorer URL Helpers
// ============================================================================

export type NodeSyncStage = 'disconnected' | 'connected' | 'syncing' | 'tracking' | 'full';

export interface NodeHealthFinding {
  severity: 'ok' | 'info' | 'warning' | 'error';
  title: string;
  detail: string;
}

export interface NodeHealthDiagnosis {
  stage: NodeSyncStage;
  stageIndex: number; // 0..4
  findings: NodeHealthFinding[];
}

const SYNC_STAGES: NodeSyncStage[] = ['disconnected', 'connected', 'syncing', 'tracking', 'full'];

export function resolveSyncStage(serverState?: string): { stage: NodeSyncStage; stageIndex: number } {
  const s = (serverState ?? '').toLowerCase();
  if (s === 'full' || s === 'validating' || s === 'proposing') {
    return { stage: 'full', stageIndex: 4 };
  }
  if (s === 'tracking') return { stage: 'tracking', stageIndex: 3 };
  if (s === 'syncing') return { stage: 'syncing', stageIndex: 2 };
  if (s === 'connected') return { stage: 'connected', stageIndex: 1 };
  return { stage: 'disconnected', stageIndex: 0 };
}

export function diagnoseNodeHealth(
  snapshot: NodeOpsSnapshot | null,
  dockerStatus: DockerNodeStatus | null
): NodeHealthDiagnosis {
  const findings: NodeHealthFinding[] = [];

  if (!snapshot || !snapshot.connected) {
    if (dockerStatus?.containerRunning) {
      findings.push({
        severity: 'warning',
        title: 'Docker container is running, but Admin RPC is not reachable yet',
        detail:
          'Wait 10–20s for rippled startup, click Poll Node, or verify rippled.cfg binds port 5005 to 0.0.0.0 with private Docker bridge admin subnets.',
      });
    } else {
      findings.push({
        severity: 'info',
        title: 'No local or SSH-tunneled rippled node polled yet',
        detail:
          'Launch a 1-Click Docker Node below or point Admin RPC at http://127.0.0.1:5005 and click Poll Node.',
      });
    }
    return { stage: 'disconnected', stageIndex: 0, findings };
  }

  const { stage, stageIndex } = resolveSyncStage(snapshot.serverState);

  if (stage === 'full') {
    findings.push({
      severity: 'ok',
      title: 'Node is fully synced with XRPL consensus',
      detail: `Server state "${snapshot.serverState}" • Complete ledgers: ${snapshot.completeLedgers ?? 'available'}.`,
    });
  } else if (stage === 'connected' && (!snapshot.completeLedgers || snapshot.completeLedgers === 'empty')) {
    findings.push({
      severity: 'warning',
      title: 'Connected to peers, awaiting first validated ledger sync',
      detail:
        'If this persists for >5 minutes, verify your host OS clock is synced via NTP — an out-of-sync system clock causes rippled to reject validator lists (warning 1003).',
    });
  } else {
    findings.push({
      severity: 'info',
      title: `Node is advancing through "${snapshot.serverState ?? stage}" state`,
      detail: 'Normal during initial ledger catch-up. Stay online until state reaches "full".',
    });
  }

  const peers = snapshot.peersCount ?? 0;
  if (peers === 0) {
    findings.push({
      severity: 'error',
      title: '0 P2P peers connected',
      detail: 'Verify outbound TCP port 51235 and Docker DNS resolution so rippled can reach r.ripple.com:51235.',
    });
  } else if (peers < 5) {
    findings.push({
      severity: 'warning',
      title: `Low peer count (${peers} peers)`,
      detail: 'Opening inbound TCP 51235 on your router/firewall improves consensus latency and peer diversity.',
    });
  } else {
    findings.push({
      severity: 'ok',
      title: `Healthy P2P mesh (${peers} peers)`,
      detail: `${snapshot.inboundPeers ?? 0} inbound / ${snapshot.outboundPeers ?? 0} outbound connections.`,
    });
  }

  if (typeof snapshot.ioLatencyMs === 'number' && snapshot.ioLatencyMs > 100) {
    findings.push({
      severity: 'warning',
      title: `Elevated disk I/O latency (${snapshot.ioLatencyMs} ms)`,
      detail:
        'Consider moving your NuDB/RocksDB data folder onto a faster NVMe SSD using the Custom Storage Drive Picker.',
    });
  }

  return { stage, stageIndex, findings };
}

export const NODE_SYNC_STAGES = SYNC_STAGES;

export interface ExternalExplorerLink {
  label: string;
  url: string;
}

export function buildExternalExplorerUrls(
  networkId: NetworkId,
  kind: 'account' | 'transaction' | 'ledger',
  query: string
): ExternalExplorerLink[] {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];

  if (networkId === 'testnet') {
    const path = kind === 'account' ? `accounts/${q}` : kind === 'transaction' ? `transactions/${q}` : `ledgers/${q}`;
    return [{ label: 'XRPL Testnet Explorer', url: `https://testnet.xrpl.org/${path}` }];
  }
  if (networkId === 'devnet') {
    const path = kind === 'account' ? `accounts/${q}` : kind === 'transaction' ? `transactions/${q}` : `ledgers/${q}`;
    return [{ label: 'XRPL Devnet Explorer', url: `https://devnet.xrpl.org/${path}` }];
  }

  // Mainnet
  if (kind === 'account') {
    return [
      { label: 'XRPScan', url: `https://xrpscan.com/account/${q}` },
      { label: 'Bithomp', url: `https://bithomp.com/explorer/${q}` },
    ];
  }
  if (kind === 'transaction') {
    return [
      { label: 'XRPScan', url: `https://xrpscan.com/tx/${q}` },
      { label: 'Bithomp', url: `https://bithomp.com/explorer/${q}` },
    ];
  }
  return [
    { label: 'XRPScan', url: `https://xrpscan.com/ledger/${q}` },
    { label: 'XRPL Livenet', url: `https://livenet.xrpl.org/ledgers/${q}` },
  ];
}
