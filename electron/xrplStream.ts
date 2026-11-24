import EventEmitter from 'node:events';
import WebSocket from 'ws';
import { NETWORK_PRESETS } from '../src/shared/networks';
import type {
  ConsensusPhase,
  LedgerSnapshot,
  LiveTransaction,
  NetworkId,
  StreamStatus,
  ValidationPulse,
} from '../src/shared/types';
import {
  dropsToXrpNumber,
  parseLiveTransactionEvent,
  rippleTimeToUnixMs,
} from '../src/shared/xrplCodec';

interface PendingRpc {
  resolve: (value: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class XrplStreamManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private networkId: NetworkId = 'mainnet';
  private customEndpoint?: string;
  private endpointIndex = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private rpcSeq = 1;
  private pending = new Map<number, PendingRpc>();
  private lastLedgerCloseMs: number | null = null;
  private destroyed = false;

  private status: StreamStatus = {
    connected: false,
    connecting: false,
    networkId: 'mainnet',
    endpoint: NETWORK_PRESETS.mainnet.endpoints[0],
    latencyMs: null,
    serverLoadFactor: 1,
    consensusPhase: 'open',
  };

  public getStatus(): StreamStatus {
    return { ...this.status };
  }

  public async connect(networkId: NetworkId, customEndpoint?: string): Promise<StreamStatus> {
    this.networkId = networkId;
    this.customEndpoint = customEndpoint?.trim() || undefined;
    this.endpointIndex = 0;
    this.reconnectAttempts = 0;
    this.lastLedgerCloseMs = null;
    this.openSocket();
    return this.getStatus();
  }

  public destroy(): void {
    this.destroyed = true;
    this.cleanupSocket();
  }

  private getEndpoints(): string[] {
    if (this.networkId === 'custom' && this.customEndpoint) {
      return [this.customEndpoint];
    }
    if (this.customEndpoint) {
      return [this.customEndpoint, ...NETWORK_PRESETS[this.networkId].endpoints];
    }
    return NETWORK_PRESETS[this.networkId].endpoints;
  }

  private cleanupSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const [id, item] of this.pending.entries()) {
      clearTimeout(item.timer);
      item.reject(new Error('WebSocket connection closed'));
      this.pending.delete(id);
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        this.ws.terminate();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private emitStatus(partial: Partial<StreamStatus>): void {
    this.status = { ...this.status, ...partial };
    this.emit('status', this.getStatus());
  }

  private openSocket(): void {
    if (this.destroyed) return;
    this.cleanupSocket();

    const endpoints = this.getEndpoints();
    const url = endpoints[this.endpointIndex % endpoints.length];

    this.emitStatus({
      connected: false,
      connecting: true,
      networkId: this.networkId,
      endpoint: url,
      error: undefined,
    });

    let ws: WebSocket;
    try {
      ws = new WebSocket(url, { handshakeTimeout: 10_000 });
    } catch (err) {
      this.scheduleReconnect(err instanceof Error ? err.message : 'Invalid WebSocket URL');
      return;
    }

    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.emitStatus({
        connected: true,
        connecting: false,
        endpoint: url,
        error: undefined,
      });

      // Primary stream subscription (guaranteed across rippled & Clio)
      this.sendRaw({
        id: 'sub-primary',
        command: 'subscribe',
        streams: ['ledger', 'transactions', 'transactions_proposed'],
      });

      // Secondary best-effort telemetry streams (separated so Clio rejections don't block primary)
      this.sendRaw({ id: 'sub-validations', command: 'subscribe', streams: ['validations'] });
      this.sendRaw({ id: 'sub-consensus', command: 'subscribe', streams: ['consensus'] });
      this.sendRaw({ id: 'sub-server', command: 'subscribe', streams: ['server'] });

      // Query initial server_info & latest validated ledger
      void this.bootstrapServerInfo();

      // Periodic RTT ping
      this.pingTimer = setInterval(() => {
        void this.measureLatency();
      }, 15_000);
      void this.measureLatency();
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
        this.handleMessage(msg);
      } catch {
        // ignore malformed frames
      }
    });

    ws.on('error', (err) => {
      this.emitStatus({ error: err.message });
    });

    ws.on('close', () => {
      if (this.destroyed) return;
      this.emitStatus({ connected: false, connecting: false });
      this.scheduleReconnect('Connection closed, failing over...');
    });
  }

  private scheduleReconnect(reason?: string): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts += 1;
    this.endpointIndex += 1;
    const delayMs = Math.min(1500 * Math.pow(1.4, Math.min(this.reconnectAttempts, 6)), 12_000);
    this.emitStatus({
      connected: false,
      connecting: true,
      error: reason,
    });
    this.reconnectTimer = setTimeout(() => this.openSocket(), delayMs);
  }

  private sendRaw(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public request(command: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to an XRPL WebSocket endpoint'));
        return;
      }
      const id = this.rpcSeq++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout for ${command}`));
      }, 12_000);

      this.pending.set(id, { resolve, reject, timer });
      this.sendRaw({ id, command, ...params });
    });
  }

  private async measureLatency(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const start = Date.now();
    try {
      await this.request('ping');
      this.emitStatus({ latencyMs: Date.now() - start });
    } catch {
      // ignore failed ping
    }
  }

  private async bootstrapServerInfo(): Promise<void> {
    try {
      const resp = await this.request('server_info');
      const info = (resp.result as Record<string, unknown> | undefined)?.info as Record<string, unknown> | undefined;
      if (!info) return;

      const validated = info.validated_ledger as Record<string, unknown> | undefined;
      this.emitStatus({
        serverVersion: typeof info.build_version === 'string' ? info.build_version : undefined,
        peerCount: typeof info.peers === 'number' ? info.peers : undefined,
        serverLoadFactor: typeof info.load_factor === 'number' ? info.load_factor : 1,
      });

      if (validated && typeof validated.seq === 'number') {
        const snapshot: LedgerSnapshot = {
          ledgerIndex: validated.seq,
          ledgerHash: String(validated.hash ?? ''),
          ledgerTime: Date.now() - (Number(validated.age ?? 0) * 1000),
          txnCount: 0,
          feeBaseDrops: Math.round(Number(validated.base_fee_xrp ?? 0.00001) * 1_000_000),
          reserveBaseXrp: Number(validated.reserve_base_xrp ?? 1),
          reserveIncXrp: Number(validated.reserve_inc_xrp ?? 0.2),
          validatedLedgers: String(info.complete_ledgers ?? ''),
        };
        this.emit('ledger', snapshot);
      }
    } catch {
      // non-fatal
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    // Handle RPC response
    if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
      const pending = this.pending.get(msg.id)!;
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);
      if (msg.status === 'error') {
        pending.reject(new Error(String(msg.error_message ?? msg.error ?? 'XRPL RPC Error')));
      } else {
        pending.resolve(msg);
      }
      return;
    }

    const type = String(msg.type ?? '');

    if (type === 'ledgerClosed') {
      const now = Date.now();
      const closeDurationMs = this.lastLedgerCloseMs ? now - this.lastLedgerCloseMs : undefined;
      this.lastLedgerCloseMs = now;

      const ledger: LedgerSnapshot = {
        ledgerIndex: Number(msg.ledger_index ?? 0),
        ledgerHash: String(msg.ledger_hash ?? ''),
        ledgerTime: rippleTimeToUnixMs(typeof msg.ledger_time === 'number' ? msg.ledger_time : undefined),
        txnCount: Number(msg.txn_count ?? 0),
        feeBaseDrops: Number(msg.fee_base ?? 10),
        reserveBaseXrp: dropsToXrpNumber(msg.reserve_base as number | string | undefined) || 1,
        reserveIncXrp: dropsToXrpNumber(msg.reserve_inc as number | string | undefined) || 0.2,
        validatedLedgers: String(msg.validated_ledgers ?? ''),
        closeDurationMs,
      };
      this.emit('consensus', 'accepted' as ConsensusPhase);
      this.emitStatus({ consensusPhase: 'accepted' });
      this.emit('ledger', ledger);
      return;
    }

    if (type === 'transaction') {
      const parsed: LiveTransaction | null = parseLiveTransactionEvent(msg);
      if (parsed) {
        this.emit('transaction', parsed);
      }
      return;
    }

    if (type === 'validationReceived') {
      const val: ValidationPulse = {
        validationPublicKey: String(msg.validation_public_key ?? ''),
        ledgerHash: String(msg.ledger_hash ?? ''),
        ledgerIndex: Number(msg.ledger_index ?? 0),
        full: Boolean(msg.full),
        timestamp: Date.now(),
        serverVersion: typeof msg.server_version === 'string' ? msg.server_version : undefined,
        baseFee: typeof msg.base_fee === 'number' ? msg.base_fee : undefined,
      };
      if (val.validationPublicKey) {
        this.emit('validation', val);
      }
      return;
    }

    if (type === 'consensusPhase') {
      const rawPhase = String(msg.consensus ?? '').toLowerCase();
      const phase: ConsensusPhase =
        rawPhase === 'open' || rawPhase === 'establish' || rawPhase === 'accepted'
          ? rawPhase
          : 'unknown';
      this.emitStatus({ consensusPhase: phase });
      this.emit('consensus', phase);
      return;
    }

    if (type === 'serverStatus') {
      const loadBase = Number(msg.load_base ?? 256);
      const loadFactor = Number(msg.load_factor ?? loadBase);
      this.emitStatus({
        serverLoadFactor: loadBase > 0 ? Number((loadFactor / loadBase).toFixed(2)) : 1,
      });
    }
  }
}
