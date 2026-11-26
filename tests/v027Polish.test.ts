import { describe, expect, it } from 'vitest';
import type { DockerNodeStatus, NodeOpsSnapshot } from '../src/shared/types';
import {
  buildExternalExplorerUrls,
  diagnoseNodeHealth,
  resolveSyncStage,
} from '../src/shared/v027Utils';

describe('v0.2.7-beta Node Health Doctor & External Explorer URLs', () => {
  it('maps rippled server_state strings to the 5-step sync stage progression', () => {
    expect(resolveSyncStage('disconnected')).toEqual({ stage: 'disconnected', stageIndex: 0 });
    expect(resolveSyncStage('connected')).toEqual({ stage: 'connected', stageIndex: 1 });
    expect(resolveSyncStage('syncing')).toEqual({ stage: 'syncing', stageIndex: 2 });
    expect(resolveSyncStage('tracking')).toEqual({ stage: 'tracking', stageIndex: 3 });
    expect(resolveSyncStage('full')).toEqual({ stage: 'full', stageIndex: 4 });
    expect(resolveSyncStage('proposing')).toEqual({ stage: 'full', stageIndex: 4 });
  });

  it('flags Docker container running with unreachable RPC cleanly', () => {
    const docker: DockerNodeStatus = {
      dockerInstalled: true,
      daemonRunning: true,
      containerExists: true,
      containerRunning: true,
      containerName: 'xrpl-command-node',
      storageRoot: '/data',
      configDir: '/data/config',
      dataDir: '/data/data',
    };
    const diag = diagnoseNodeHealth(null, docker);
    expect(diag.stage).toBe('disconnected');
    expect(diag.findings.some((f) => f.severity === 'warning' && f.title.includes('not reachable'))).toBe(true);
  });

  it('flags empty completeLedgers (NTP/UNL hint), healthy peers, and high IO latency', () => {
    const snap: NodeOpsSnapshot = {
      connected: true,
      endpoint: 'http://127.0.0.1:5005',
      checkedAt: Date.now(),
      serverState: 'connected',
      completeLedgers: 'empty',
      peersCount: 10,
      inboundPeers: 2,
      outboundPeers: 8,
      ioLatencyMs: 145,
      peers: [],
      amendments: [],
      adminAvailable: true,
    };
    const diag = diagnoseNodeHealth(snap, null);
    expect(diag.stage).toBe('connected');
    expect(diag.findings.some((f) => f.detail.includes('NTP'))).toBe(true);
    expect(diag.findings.some((f) => f.severity === 'ok' && f.title.includes('10 peers'))).toBe(true);
    expect(diag.findings.some((f) => f.severity === 'warning' && f.title.includes('I/O latency'))).toBe(true);
  });

  it('builds Mainnet, Testnet, and Devnet external explorer links', () => {
    const mainnetLinks = buildExternalExplorerUrls('mainnet', 'account', 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe');
    expect(mainnetLinks.some((l) => l.url.includes('xrpscan.com/account/'))).toBe(true);
    expect(mainnetLinks.some((l) => l.url.includes('bithomp.com/explorer/'))).toBe(true);

    const testLinks = buildExternalExplorerUrls('testnet', 'transaction', 'ABCDEF');
    expect(testLinks[0].url).toBe('https://testnet.xrpl.org/transactions/ABCDEF');
  });
});
