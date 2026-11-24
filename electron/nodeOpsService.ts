import fs from 'node:fs/promises';
import type {
  NodeAmendmentInfo,
  NodeConnectionConfig,
  NodeOpsSnapshot,
  NodePeerInfo,
} from '../src/shared/types';

// Explicit allowlist of rippled/Clio RPC commands callable from Node Ops.
// Read-only commands run during polling; mutating commands require explicit UI confirmation.
const ALLOWED_ADMIN_COMMANDS = new Set([
  'server_info',
  'server_state',
  'peers',
  'feature',
  'validators',
  'validator_list_sites',
  'can_delete',
  'connect',
  'log_level',
  'ledger_cleaner',
  'peer_reservations_list',
  'stop',
]);

async function callRippledJsonRpc(
  rpcUrl: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 7_000
): Promise<Record<string, unknown>> {
  const url = rpcUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Admin RPC URL must start with http:// or https:// (e.g., http://127.0.0.1:5005)');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method,
        params: [params],
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { result?: Record<string, unknown> };
    const result = body.result ?? {};
    if (result.status === 'error') {
      throw new Error(String(result.error_message ?? result.error ?? `RPC error in ${method}`));
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export class NodeOpsService {
  public async pollNode(config: NodeConnectionConfig): Promise<NodeOpsSnapshot> {
    const checkedAt = Date.now();
    const endpoint = config.rpcUrl.trim();

    try {
      const infoRes = await callRippledJsonRpc(endpoint, 'server_info');
      const info = (infoRes.info ?? {}) as Record<string, unknown>;
      const validated = (info.validated_ledger ?? {}) as Record<string, unknown>;

      // Run admin telemetry queries in parallel (non-fatal if connected to a public/non-admin port)
      const [peersRes, featureRes, canDeleteRes] = await Promise.allSettled([
        callRippledJsonRpc(endpoint, 'peers'),
        callRippledJsonRpc(endpoint, 'feature'),
        callRippledJsonRpc(endpoint, 'can_delete', {}),
      ]);

      const peers: NodePeerInfo[] = [];
      let inboundPeers = 0;
      let outboundPeers = 0;
      let adminAvailable = false;

      if (peersRes.status === 'fulfilled') {
        adminAvailable = true;
        const rawPeers = (peersRes.value.peers ?? []) as Array<Record<string, unknown>>;
        for (const p of rawPeers) {
          const inbound = Boolean(p.inbound);
          if (inbound) inboundPeers += 1;
          else outboundPeers += 1;
          peers.push({
            address: String(p.address ?? 'unknown'),
            version: String(p.version ?? '—'),
            latencyMs: Number(p.latency ?? 0),
            inbound,
            sanity: typeof p.sanity === 'string' ? p.sanity : 'sane',
            completeLedgers: typeof p.complete_ledgers === 'string' ? p.complete_ledgers : undefined,
            ledgerHash: typeof p.ledger === 'string' ? p.ledger : undefined,
            uptime: typeof p.uptime === 'number' ? p.uptime : undefined,
          });
        }
        peers.sort((a, b) => a.latencyMs - b.latencyMs);
      }

      const amendments: NodeAmendmentInfo[] = [];
      if (featureRes.status === 'fulfilled') {
        const featuresObj = (featureRes.value.features ?? {}) as Record<string, Record<string, unknown>>;
        for (const [id, data] of Object.entries(featuresObj)) {
          amendments.push({
            id,
            name: String(data.name ?? id.slice(0, 12)),
            enabled: Boolean(data.enabled),
            supported: Boolean(data.supported),
            vetoed:
              typeof data.vetoed === 'boolean' || typeof data.vetoed === 'string'
                ? data.vetoed
                : undefined,
            count: typeof data.count === 'number' ? data.count : undefined,
            threshold: typeof data.threshold === 'number' ? data.threshold : undefined,
          });
        }
        amendments.sort((a, b) => {
          if (a.enabled !== b.enabled) return a.enabled ? 1 : -1; // Pending amendments at top!
          return a.name.localeCompare(b.name);
        });
      }

      let canDelete: string | number | undefined;
      if (canDeleteRes.status === 'fulfilled') {
        adminAvailable = true;
        const val = canDeleteRes.value.can_delete;
        if (typeof val === 'string' || typeof val === 'number') {
          canDelete = val;
        }
      }

      const rawStateAcc = info.state_accounting as Record<string, Record<string, unknown>> | undefined;
      let stateAccounting: NodeOpsSnapshot['stateAccounting'];
      if (rawStateAcc) {
        stateAccounting = {};
        for (const [k, v] of Object.entries(rawStateAcc)) {
          stateAccounting[k] = {
            durationUs: String(v.duration_us ?? '0'),
            transitions: String(v.transitions ?? '0'),
          };
        }
      }

      const pubkeyValidator = typeof info.pubkey_validator === 'string' ? info.pubkey_validator : undefined;
      const isValidator = Boolean(pubkeyValidator && pubkeyValidator !== 'none');

      return {
        connected: true,
        endpoint,
        checkedAt,
        buildVersion: typeof info.build_version === 'string' ? info.build_version : undefined,
        serverState: typeof info.server_state === 'string' ? info.server_state : undefined,
        completeLedgers: typeof info.complete_ledgers === 'string' ? info.complete_ledgers : undefined,
        validatedLedgerSeq: typeof validated.seq === 'number' ? validated.seq : undefined,
        validatedLedgerAgeSec: typeof validated.age === 'number' ? validated.age : undefined,
        peersCount: typeof info.peers === 'number' ? info.peers : peers.length,
        inboundPeers,
        outboundPeers,
        uptimeSec: typeof info.uptime === 'number' ? info.uptime : undefined,
        loadFactor: typeof info.load_factor === 'number' ? info.load_factor : 1,
        validationQuorum: typeof info.validation_quorum === 'number' ? info.validation_quorum : undefined,
        pubkeyNode: typeof info.pubkey_node === 'string' ? info.pubkey_node : undefined,
        pubkeyValidator,
        isValidator,
        ioLatencyMs: typeof info.io_latency_ms === 'number' ? info.io_latency_ms : undefined,
        hostId: typeof info.hostid === 'string' ? info.hostid : undefined,
        stateAccounting,
        peers,
        amendments,
        canDelete,
        adminAvailable,
      };
    } catch (err) {
      return {
        connected: false,
        endpoint,
        checkedAt,
        error: err instanceof Error ? err.message : 'Unable to reach rippled RPC endpoint',
        peers: [],
        amendments: [],
        adminAvailable: false,
      };
    }
  }

  public async executeAdminCommand(
    config: NodeConnectionConfig,
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    if (!ALLOWED_ADMIN_COMMANDS.has(method)) {
      return {
        ok: false,
        error: `Command "${method}" is not in the Node Ops allowlist.`,
      };
    }

    try {
      const result = await callRippledJsonRpc(config.rpcUrl, method, params, 10_000);
      return { ok: true, result };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Admin RPC execution failed',
      };
    }
  }

  public async readLogTail(
    filePath: string,
    maxLines = 120
  ): Promise<{ ok: boolean; lines: string[]; error?: string }> {
    const cleanPath = filePath.trim();
    if (!cleanPath) {
      return { ok: false, lines: [], error: 'No log file path configured.' };
    }

    try {
      const stat = await fs.stat(cleanPath);
      if (!stat.isFile()) {
        return { ok: false, lines: [], error: 'Path is not a regular file.' };
      }

      const maxBytes = 128 * 1024; // Read only trailing 128 KB so multi-GB logs load instantaneously
      const start = Math.max(0, stat.size - maxBytes);
      const length = stat.size - start;
      const handle = await fs.open(cleanPath, 'r');
      try {
        const buf = Buffer.alloc(length);
        await handle.read(buf, 0, length, start);
        const text = buf.toString('utf8');
        const allLines = text.split(/\r?\n/).filter((l) => l.length > 0);
        return {
          ok: true,
          lines: allLines.slice(-Math.min(Math.max(maxLines, 10), 400)),
        };
      } finally {
        await handle.close();
      }
    } catch (err) {
      return {
        ok: false,
        lines: [],
        error: err instanceof Error ? err.message : 'Unable to read log file',
      };
    }
  }
}
