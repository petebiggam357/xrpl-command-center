import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { isValidClassicAddress } from 'xrpl';
import { computeTechnicalSummary } from '../src/shared/chartIndicators';
import {
  AGENT_PROVIDER_PRESETS,
  buildGeminiFunctionDeclarations,
  DEFAULT_MCP_PORT,
  evaluateToolPermission,
  isReadOnlyXrplCommand,
  MCP_TOOLS_CATALOG,
  parseNaturalLanguageAgentIntent,
  sanitizeAuditSummary,
  validateMcpPort,
  type AgentChatMessage,
  type AgentProviderConfig,
  type AgentProviderId,
  type McpAuditEntry,
  type McpRendererAction,
  type McpServerStatus,
} from '../src/shared/mcpAgentUtils';
import type {
  ChartTimeframe,
  LedgerSnapshot,
  NodeConnectionConfig,
  StreamStatus,
  VaultStatus,
} from '../src/shared/types';
import { encodeCurrencyCode } from '../src/shared/xrplCodec';
import type { DirectoryService } from './directoryService';
import type { DockerNodeService } from './dockerNodeService';
import type { NodeOpsService } from './nodeOpsService';
import type { OsCipherAdapter, WalletVaultService } from './walletVaultService';
import type { XrplStreamManager } from './xrplStream';

const MCP_HOST = '127.0.0.1';
const CONFIG_FILENAME = 'mcp-agent-config.json';
const MAX_BODY_BYTES = 256 * 1024;
const MAX_AUDIT_ENTRIES = 100;

interface PersistedMcpConfig {
  enabled: boolean;
  port: number;
  bearerToken: string;
  allowAutomation: boolean;
  allowTxDrafting: boolean;
  provider: AgentProviderId;
  endpointUrl: string;
  model: string;
  apiKeyEncrypted?: string;
  apiKeyPlain?: string;
}

export interface McpServiceDeps {
  storageDir: string;
  appVersion: string;
  streamManager: Pick<XrplStreamManager, 'getStatus' | 'request'>;
  directoryService: Pick<
    DirectoryService,
    'fetchMarketPrices' | 'fetchMarketOhlc' | 'inspectQuery' | 'inspectTokenOnLedger' | 'searchTokens'
  >;
  nodeOpsService: Pick<NodeOpsService, 'pollNode'>;
  dockerService: Pick<DockerNodeService, 'getStatus' | 'lifecycleAction' | 'readLogs'>;
  walletVault: Pick<WalletVaultService, 'getStatus' | 'fetchPortfolio'>;
  getRecentLedgers: () => LedgerSnapshot[];
  getLastNodeConfig: () => NodeConnectionConfig;
  emitStatus: (status: McpServerStatus) => void;
  emitRendererAction: (action: McpRendererAction) => void;
  osCipher?: OsCipherAdapter;
}

function timingSafeBearerMatch(authHeader: string | undefined, expectedToken: string): boolean {
  if (!authHeader || !expectedToken) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const provided = Buffer.from(match[1].trim(), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return true;
  const clean = hostHeader.trim().toLowerCase();
  if (clean.startsWith('[')) {
    const end = clean.indexOf(']');
    if (end < 0) return false;
    return clean.slice(1, end) === '::1';
  }
  const hostname = clean.split(':')[0];
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

export class McpAgentService {
  private server: http.Server | null = null;
  private running = false;
  private lastError: string | undefined;
  private configLoaded = false;
  private auditLog: McpAuditEntry[] = [];
  private apiKeyCache: string | null = null;
  private actualBoundPort: number = DEFAULT_MCP_PORT;

  private config: PersistedMcpConfig = {
    enabled: false,
    port: DEFAULT_MCP_PORT,
    bearerToken: crypto.randomBytes(32).toString('hex'),
    allowAutomation: true,
    allowTxDrafting: false,
    provider: 'local-rules',
    endpointUrl: AGENT_PROVIDER_PRESETS['local-rules'].defaultEndpoint,
    model: AGENT_PROVIDER_PRESETS['local-rules'].defaultModel,
  };

  constructor(private readonly deps: McpServiceDeps) {}

  private get configPath(): string {
    return path.join(this.deps.storageDir, CONFIG_FILENAME);
  }

  private encryptApiKey(plain: string): { apiKeyEncrypted?: string; apiKeyPlain?: string } {
    const clean = plain.trim();
    if (!clean) return {};
    try {
      if (this.deps.osCipher?.isAvailable()) {
        return { apiKeyEncrypted: this.deps.osCipher.encrypt(clean).toString('base64') };
      }
    } catch {
      // fall through
    }
    return { apiKeyPlain: clean };
  }

  private decryptApiKey(cfg: PersistedMcpConfig): string | null {
    try {
      if (cfg.apiKeyEncrypted && this.deps.osCipher?.isAvailable()) {
        const dec = this.deps.osCipher.decrypt(Buffer.from(cfg.apiKeyEncrypted, 'base64')).trim();
        if (dec) return dec;
      }
    } catch {
      // ignore
    }
    if (typeof cfg.apiKeyPlain === 'string' && cfg.apiKeyPlain.trim()) {
      return cfg.apiKeyPlain.trim();
    }
    return null;
  }

  public async init(): Promise<McpServerStatus> {
    await this.loadConfig();
    if (this.config.enabled) {
      await this.startServer();
    }
    return this.getStatus();
  }

  private async loadConfig(): Promise<void> {
    if (this.configLoaded) return;
    this.configLoaded = true;
    try {
      const raw = await fs.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedMcpConfig>;
      const providerId: AgentProviderId =
        parsed.provider && parsed.provider in AGENT_PROVIDER_PRESETS ? parsed.provider : 'local-rules';
      const preset = AGENT_PROVIDER_PRESETS[providerId];
      this.config = {
        enabled: Boolean(parsed.enabled),
        port: validateMcpPort(parsed.port ?? DEFAULT_MCP_PORT),
        bearerToken:
          typeof parsed.bearerToken === 'string' && parsed.bearerToken.length >= 24
            ? parsed.bearerToken
            : crypto.randomBytes(32).toString('hex'),
        allowAutomation: parsed.allowAutomation !== false,
        allowTxDrafting: Boolean(parsed.allowTxDrafting),
        provider: providerId,
        endpointUrl:
          typeof parsed.endpointUrl === 'string' && parsed.endpointUrl.trim()
            ? parsed.endpointUrl.trim()
            : preset.defaultEndpoint,
        model:
          typeof parsed.model === 'string' && parsed.model.trim()
            ? parsed.model.trim()
            : preset.defaultModel,
        apiKeyEncrypted: parsed.apiKeyEncrypted,
        apiKeyPlain: parsed.apiKeyPlain,
      };
      this.actualBoundPort = this.config.port;
      this.apiKeyCache = this.decryptApiKey(this.config);
    } catch {
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.mkdir(this.deps.storageDir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  public getStatus(): McpServerStatus {
    const port = this.running ? this.actualBoundPort : this.config.port;
    const providerConfig: AgentProviderConfig = {
      provider: this.config.provider,
      endpointUrl: this.config.endpointUrl,
      model: this.config.model,
      hasApiKey: Boolean(this.apiKeyCache),
    };
    return {
      enabled: this.config.enabled,
      running: this.running,
      host: MCP_HOST,
      port,
      endpointUrl: `http://${MCP_HOST}:${port}/mcp`,
      bearerToken: this.config.bearerToken,
      allowAutomation: this.config.allowAutomation,
      allowTxDrafting: this.config.allowTxDrafting,
      toolCount: MCP_TOOLS_CATALOG.length,
      auditLog: [...this.auditLog],
      providerConfig,
      error: this.lastError,
    };
  }

  private broadcastStatus(): void {
    this.deps.emitStatus(this.getStatus());
  }

  public async updateConfig(patch: {
    enabled?: boolean;
    port?: number;
    allowAutomation?: boolean;
    allowTxDrafting?: boolean;
  }): Promise<McpServerStatus> {
    await this.loadConfig();
    const prevEnabled = this.config.enabled;
    const prevPort = this.config.port;

    if (patch.allowAutomation !== undefined) {
      this.config.allowAutomation = Boolean(patch.allowAutomation);
    }
    if (patch.allowTxDrafting !== undefined) {
      this.config.allowTxDrafting = Boolean(patch.allowTxDrafting);
    }
    if (patch.port !== undefined) {
      this.config.port = patch.port === 0 ? 0 : validateMcpPort(patch.port);
    }
    if (patch.enabled !== undefined) {
      this.config.enabled = Boolean(patch.enabled);
    }

    await this.saveConfig();

    const needRestart =
      this.config.enabled && (!this.running || !prevEnabled || prevPort !== this.config.port);

    if (!this.config.enabled && this.running) {
      await this.stopServer();
    } else if (needRestart) {
      await this.stopServer();
      await this.startServer();
    }

    this.broadcastStatus();
    return this.getStatus();
  }

  public async rotateToken(): Promise<McpServerStatus> {
    await this.loadConfig();
    this.config.bearerToken = crypto.randomBytes(32).toString('hex');
    await this.saveConfig();
    this.broadcastStatus();
    return this.getStatus();
  }

  public async updateProvider(patch: {
    provider?: AgentProviderId;
    endpointUrl?: string;
    model?: string;
    apiKey?: string | null;
  }): Promise<McpServerStatus> {
    await this.loadConfig();
    if (patch.provider && patch.provider in AGENT_PROVIDER_PRESETS) {
      const changed = patch.provider !== this.config.provider;
      this.config.provider = patch.provider;
      const preset = AGENT_PROVIDER_PRESETS[patch.provider];
      if (changed && patch.endpointUrl === undefined) {
        this.config.endpointUrl = preset.defaultEndpoint;
      }
      if (changed && patch.model === undefined) {
        this.config.model = preset.defaultModel;
      }
    }
    if (patch.endpointUrl !== undefined && patch.endpointUrl.trim()) {
      this.config.endpointUrl = patch.endpointUrl.trim();
    }
    if (patch.model !== undefined && patch.model.trim()) {
      this.config.model = patch.model.trim();
    }
    if (patch.apiKey !== undefined) {
      if (patch.apiKey === null || !patch.apiKey.trim()) {
        this.apiKeyCache = null;
        delete this.config.apiKeyEncrypted;
        delete this.config.apiKeyPlain;
      } else {
        this.apiKeyCache = patch.apiKey.trim();
        const wrapped = this.encryptApiKey(this.apiKeyCache);
        this.config.apiKeyEncrypted = wrapped.apiKeyEncrypted;
        this.config.apiKeyPlain = wrapped.apiKeyPlain;
      }
    }
    await this.saveConfig();
    this.broadcastStatus();
    return this.getStatus();
  }

  public async clearAuditLog(): Promise<McpServerStatus> {
    this.auditLog = [];
    this.broadcastStatus();
    return this.getStatus();
  }

  public async startServer(): Promise<void> {
    if (this.server) return;
    this.lastError = undefined;

    const srv = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });

    await new Promise<void>((resolve) => {
      srv.once('error', (err: NodeJS.ErrnoException) => {
        this.running = false;
        this.server = null;
        this.lastError =
          err.code === 'EADDRINUSE'
            ? `Port ${this.config.port} is already in use. Choose another loopback port.`
            : err.message;
        resolve();
      });

      srv.listen(this.config.port, MCP_HOST, () => {
        const addr = srv.address();
        this.actualBoundPort =
          addr && typeof addr === 'object' ? addr.port : this.config.port;
        this.server = srv;
        this.running = true;
        this.lastError = undefined;
        resolve();
      });
    });
  }

  public async stopServer(): Promise<void> {
    if (!this.server) {
      this.running = false;
      return;
    }
    const srv = this.server;
    this.server = null;
    this.running = false;
    await new Promise<void>((resolve) => {
      srv.close(() => resolve());
    });
  }

  public async shutdown(): Promise<void> {
    await this.stopServer();
  }

  private async handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const urlPath = (req.url ?? '/').split('?')[0];

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');

      if (!isLoopbackHostHeader(req.headers.host)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: non-loopback Host header rejected.' }));
        return;
      }

      if (req.method === 'GET' && urlPath === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            service: 'xrpl-command-center-mcp',
            version: this.deps.appVersion,
            tools: MCP_TOOLS_CATALOG.length,
          })
        );
        return;
      }

      if (urlPath !== '/mcp') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found. Use POST /mcp with Bearer authentication.' }));
        return;
      }

      if (!timingSafeBearerMatch(req.headers.authorization, this.config.bearerToken)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32001, message: 'Unauthorized: invalid or missing Bearer token.' },
          })
        );
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
        res.end(JSON.stringify({ error: 'Method Not Allowed. Send JSON-RPC 2.0 via POST /mcp.' }));
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let tooLarge = false;
      await new Promise<void>((resolve) => {
        req.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_BODY_BYTES) {
            tooLarge = true;
            return;
          }
          chunks.push(chunk);
        });
        req.on('end', resolve);
        req.on('error', resolve);
      });

      if (tooLarge) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large (max 256 KiB).' }));
        return;
      }

      const bodyText = Buffer.concat(chunks).toString('utf8');
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error: invalid JSON.' },
          })
        );
        return;
      }

      if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32600, message: 'Invalid Request: expected a JSON-RPC object.' },
          })
        );
        return;
      }

      const rpc = parsedBody as {
        jsonrpc?: string;
        id?: string | number | null;
        method?: string;
        params?: Record<string, unknown>;
      };

      const id = rpc.id ?? null;
      const method = typeof rpc.method === 'string' ? rpc.method : '';

      if (method.startsWith('notifications/')) {
        res.writeHead(202);
        res.end();
        return;
      }

      if (method === 'initialize') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: {
                name: 'xrpl-command-center',
                version: this.deps.appVersion,
              },
            },
          })
        );
        return;
      }

      if (method === 'ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result: {} }));
        return;
      }

      if (method === 'tools/list') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              tools: MCP_TOOLS_CATALOG.map((t) => ({
                name: t.name,
                description: `[Tier: ${t.tier}] ${t.description}`,
                inputSchema: t.inputSchema,
              })),
            },
          })
        );
        return;
      }

      if (method === 'tools/call') {
        const paramsObj =
          rpc.params && typeof rpc.params === 'object' && !Array.isArray(rpc.params)
            ? rpc.params
            : {};
        const toolName = String(paramsObj.name ?? '');
        const rawArgs = paramsObj.arguments;
        const toolArgs =
          rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
            ? (rawArgs as Record<string, unknown>)
            : {};
        const outcome = await this.executeTool(toolName, toolArgs, 'mcp-http');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              isError: !outcome.ok,
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(outcome.ok ? outcome.data : { error: outcome.error }, null, 2),
                },
              ],
            },
          })
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        })
      );
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : 'Internal server error',
            },
          })
        );
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  }

  private recordAudit(entry: Omit<McpAuditEntry, 'id'>): void {
    const full: McpAuditEntry = {
      ...entry,
      id: `audit-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      summary: sanitizeAuditSummary(entry.summary),
    };
    this.auditLog = [full, ...this.auditLog].slice(0, MAX_AUDIT_ENTRIES);
    this.broadcastStatus();
  }

  public async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    source: 'mcp-http' | 'in-app-copilot'
  ): Promise<{ ok: boolean; data?: unknown; summary: string; error?: string }> {
    await this.loadConfig();
    const startedAt = Date.now();
    let vaultStatus: VaultStatus;
    try {
      vaultStatus = await this.deps.walletVault.getStatus();
    } catch {
      vaultStatus = {
        initialized: false,
        unlocked: false,
        osKeychainAvailable: false,
        accounts: [],
      };
    }

    const perm = evaluateToolPermission(toolName, {
      allowAutomation: this.config.allowAutomation,
      allowTxDrafting: this.config.allowTxDrafting,
      vaultUnlocked: vaultStatus.unlocked,
    });

    if (!perm.allowed) {
      const reason = perm.reason ?? 'Tool execution blocked by permission policy.';
      this.recordAudit({
        timestamp: Date.now(),
        source,
        toolName,
        tier: perm.tier ?? 'read',
        ok: false,
        durationMs: Date.now() - startedAt,
        summary: `BLOCKED: ${reason}`,
      });
      return { ok: false, summary: reason, error: reason };
    }

    try {
      const result = await this.runToolImpl(toolName, args, vaultStatus);
      this.recordAudit({
        timestamp: Date.now(),
        source,
        toolName,
        tier: perm.tier ?? 'read',
        ok: true,
        durationMs: Date.now() - startedAt,
        summary: result.summary,
      });
      return { ok: true, data: result.data, summary: result.summary };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordAudit({
        timestamp: Date.now(),
        source,
        toolName,
        tier: perm.tier ?? 'read',
        ok: false,
        durationMs: Date.now() - startedAt,
        summary: `ERROR: ${msg}`,
      });
      return { ok: false, summary: msg, error: msg };
    }
  }

  private async runToolImpl(
    toolName: string,
    args: Record<string, unknown>,
    vaultStatus: VaultStatus
  ): Promise<{ data: unknown; summary: string }> {
    switch (toolName) {
      case 'xrpl_get_network_status': {
        const stream: StreamStatus = this.deps.streamManager.getStatus();
        const ledgers = this.deps.getRecentLedgers();
        const latest = ledgers[0] ?? null;
        const price = await this.deps.directoryService.fetchMarketPrices().catch(() => null);
        const data = {
          connected: stream.connected,
          networkId: stream.networkId,
          endpoint: stream.endpoint,
          latencyMs: stream.latencyMs,
          consensusPhase: stream.consensusPhase,
          serverVersion: stream.serverVersion ?? null,
          latestLedger: latest,
          xrpUsd: price?.xrpUsd ?? null,
          change24hPct: price?.change24hPct ?? null,
        };
        const summary = `${stream.networkId.toUpperCase()} ${stream.connected ? 'LIVE' : 'OFFLINE'} • Ledger ${
          latest ? `#${latest.ledgerIndex}` : 'syncing'
        }${price?.xrpUsd ? ` • XRP $${price.xrpUsd.toFixed(4)}` : ''}`;
        return { data, summary };
      }

      case 'xrpl_get_latest_ledgers': {
        const limit = Math.max(1, Math.min(20, Number(args.limit ?? 10) || 10));
        const ledgers = this.deps.getRecentLedgers().slice(0, limit);
        return {
          data: { count: ledgers.length, ledgers },
          summary: `Returned ${ledgers.length} recent validated ledgers`,
        };
      }

      case 'xrpl_rpc_query': {
        const command = String(args.command ?? '').trim();
        if (!isReadOnlyXrplCommand(command)) {
          throw new Error(
            `RPC command "${command}" is blocked. Only read-only XRPL commands are permitted.`
          );
        }
        let params: Record<string, unknown> = {};
        if (args.params && typeof args.params === 'object' && !Array.isArray(args.params)) {
          params = args.params as Record<string, unknown>;
        } else if (typeof args.params === 'string' && args.params.trim()) {
          try {
            const parsedParams = JSON.parse(args.params) as unknown;
            if (parsedParams && typeof parsedParams === 'object' && !Array.isArray(parsedParams)) {
              params = parsedParams as Record<string, unknown>;
            }
          } catch {
            throw new Error('params must be a valid JSON object.');
          }
        }
        const resp = await this.deps.streamManager.request(command, params);
        return {
          data: resp.result ?? resp,
          summary: `Executed read-only RPC "${command}"`,
        };
      }

      case 'xrpl_inspect_account': {
        const query = String(args.query ?? '').trim();
        if (!query) throw new Error('query parameter is required.');
        const res = await this.deps.directoryService.inspectQuery(
          this.deps.streamManager as XrplStreamManager,
          query
        );
        return {
          data: {
            kind: res.kind,
            title: res.title,
            subtitle: res.subtitle,
            summary: res.summary,
            flags: res.flags,
            trustlinesCount: res.trustlines?.length ?? 0,
          },
          summary: `Inspected ${res.kind}: ${res.title}`,
        };
      }

      case 'xrpl_search_tokens': {
        const query = String(args.query ?? '').trim();
        if (!query) throw new Error('query parameter is required.');
        const net = this.deps.streamManager.getStatus().networkId;
        const found = await this.deps.directoryService.searchTokens(
          this.deps.streamManager as XrplStreamManager,
          query,
          net
        );
        return {
          data: {
            query,
            source: found.source,
            count: found.tokens.length,
            tokens: found.tokens.slice(0, 25),
          },
          summary: `Found ${found.tokens.length} token match(es) for "${query}" (${found.source})`,
        };
      }

      case 'xrpl_get_token_market': {
        const pairType = args.pairType === 'token-xrp' ? 'token-xrp' : 'xrp-usd';
        const tf =
          args.timeframe === '15m' || args.timeframe === '1h' || args.timeframe === '4h' || args.timeframe === '1d'
            ? (args.timeframe as ChartTimeframe)
            : '1h';

        const currency = typeof args.currency === 'string' ? args.currency.trim() : undefined;
        const issuer = typeof args.issuer === 'string' ? args.issuer.trim() : undefined;
        const currencyRaw = currency && currency.toUpperCase() !== 'XRP' ? encodeCurrencyCode(currency) : currency;

        const ohlc = await this.deps.directoryService.fetchMarketOhlc({
          pairType,
          currency,
          currencyRaw,
          issuer,
          timeframe: tf,
          bars: 120,
        });
        const technicals = ohlc.candles.length > 0 ? computeTechnicalSummary(ohlc.candles) : null;
        let onLedger = null;
        if (pairType === 'token-xrp' && currencyRaw && issuer && isValidClassicAddress(issuer)) {
          onLedger = await this.deps.directoryService
            .inspectTokenOnLedger(this.deps.streamManager as XrplStreamManager, currencyRaw, issuer)
            .catch(() => null);
        }
        return {
          data: {
            pairLabel: ohlc.pairLabel,
            timeframe: ohlc.timeframe,
            source: ohlc.source,
            candleCount: ohlc.candles.length,
            latestCandle: ohlc.candles[ohlc.candles.length - 1] ?? null,
            technicals,
            onLedger: onLedger
              ? {
                  xrpBalance: onLedger.xrpBalance,
                  totalObligation: onLedger.totalObligation,
                  flags: onLedger.flags,
                  bidCount: onLedger.bids.length,
                  askCount: onLedger.asks.length,
                  amm: onLedger.amm,
                }
              : null,
          },
          summary: `${ohlc.pairLabel} (${tf}): ${technicals ? `${technicals.bias} • last ${technicals.lastClose}` : `${ohlc.candles.length} candles`}`,
        };
      }

      case 'xrpl_get_node_health': {
        const includeLogs = args.includeLogs !== false;
        const cfg = this.deps.getLastNodeConfig();
        const [snap, docker, logs] = await Promise.all([
          this.deps.nodeOpsService.pollNode(cfg),
          this.deps.dockerService.getStatus(),
          includeLogs ? this.deps.dockerService.readLogs(20) : Promise.resolve({ ok: true, lines: [] }),
        ]);
        return {
          data: {
            node: snap,
            docker: {
              dockerInstalled: docker.dockerInstalled,
              daemonRunning: docker.daemonRunning,
              containerExists: docker.containerExists,
              containerRunning: docker.containerRunning,
              network: docker.network,
              storageRoot: docker.storageRoot,
              freeGb: docker.storageInfo?.freeGb ?? null,
            },
            recentLogs: logs.ok ? logs.lines.slice(-20) : [],
          },
          summary: `Node ${snap.connected ? snap.serverState ?? 'connected' : 'offline'} • Docker ${
            docker.containerRunning ? 'running' : 'stopped'
          }`,
        };
      }

      case 'xrpl_get_wallet_portfolio': {
        // Vault lock already enforced by evaluateToolPermission; double-check defense-in-depth
        if (!vaultStatus.unlocked) {
          throw new Error('VAULT_LOCKED: Wallet addresses and balances are hidden while the vault is locked.');
        }
        const accounts = vaultStatus.accounts.slice(0, 10);
        const portfolios = await Promise.all(
          accounts.map(async (acct) => {
            try {
              const snap = await this.deps.walletVault.fetchPortfolio(
                this.deps.streamManager as XrplStreamManager,
                acct.address
              );
              return {
                label: acct.label,
                address: acct.address,
                kind: acct.kind,
                funded: snap.funded,
                totalXrp: snap.totalXrp,
                spendableXrp: snap.spendableXrp,
                trustlines: snap.tokens.map((t) => ({
                  currency: t.currency,
                  issuer: t.issuer,
                  balance: t.balance,
                })),
              };
            } catch (err) {
              return {
                label: acct.label,
                address: acct.address,
                kind: acct.kind,
                funded: false,
                error: err instanceof Error ? err.message : 'Unable to fetch',
              };
            }
          })
        );
        const totalXrp = portfolios.reduce((sum, p) => sum + (Number((p as { totalXrp?: number }).totalXrp) || 0), 0);
        return {
          data: {
            accountCount: vaultStatus.accounts.length,
            totalXrp: Number(totalXrp.toFixed(6)),
            accounts: portfolios,
          },
          summary: `Loaded ${portfolios.length} wallet(s) totaling ${totalXrp.toFixed(2)} XRP`,
        };
      }

      case 'cc_navigate_tab': {
        const tab = String(args.tab ?? '').trim();
        if (!tab) throw new Error('tab is required.');
        this.deps.emitRendererAction({ type: 'navigate-tab', tab });
        return {
          data: { navigatedTo: tab },
          summary: `Switched Command Center view to "${tab}"`,
        };
      }

      case 'cc_focus_token': {
        const currency = String(args.currency ?? '').trim();
        const issuer = String(args.issuer ?? '').trim();
        if (!currency || !isValidClassicAddress(issuer)) {
          throw new Error('Valid currency code and issuer r-address are required.');
        }
        const currencyRaw = encodeCurrencyCode(currency);
        this.deps.emitRendererAction({ type: 'focus-token', currency, currencyRaw, issuer });
        return {
          data: { focused: true, currency, currencyRaw, issuer },
          summary: `Focused ${currency} (${issuer.slice(0, 8)}…) in Tokens & DEX`,
        };
      }

      case 'cc_add_price_alert': {
        const direction = args.direction === 'below' ? 'below' : 'above';
        const targetUsd = Number(args.targetUsd);
        if (!Number.isFinite(targetUsd) || targetUsd <= 0) {
          throw new Error('targetUsd must be a positive number.');
        }
        this.deps.emitRendererAction({
          type: 'add-price-alert',
          symbol: 'XRP',
          direction,
          targetUsd,
        });
        return {
          data: { symbol: 'XRP', direction, targetUsd },
          summary: `Added XRP/USD price alert (${direction} $${targetUsd.toFixed(4)})`,
        };
      }

      case 'cc_add_watchlist': {
        const label = String(args.label ?? '').trim();
        const targetType = args.type === 'token' ? 'token' : 'account';
        const target = String(args.target ?? '').trim();
        if (!target) throw new Error('target is required.');
        this.deps.emitRendererAction({
          type: 'add-watchlist',
          label: label || target.slice(0, 12),
          targetType,
          target,
        });
        return {
          data: { label: label || target, type: targetType, target },
          summary: `Added ${targetType} "${label || target}" to live watchlist`,
        };
      }

      case 'cc_node_docker_action': {
        const action = String(args.action ?? '').trim();
        if (action !== 'start' && action !== 'stop' && action !== 'restart') {
          throw new Error('action must be "start", "stop", or "restart".');
        }
        const res = await this.deps.dockerService.lifecycleAction(action);
        if (!res.ok) throw new Error(res.error ?? `Docker ${action} failed`);
        return {
          data: { action, ok: true, message: res.message },
          summary: `Docker rippled node: ${action} succeeded`,
        };
      }

      case 'xrpl_draft_transaction': {
        if (!vaultStatus.unlocked) {
          throw new Error('VAULT_LOCKED: Unlock your XRPL Wallet Vault before drafting transactions.');
        }
        const kind = args.kind === 'TrustSet' ? 'TrustSet' : 'Payment';
        const destination = typeof args.destination === 'string' ? args.destination.trim() : undefined;
        const issuer = typeof args.issuer === 'string' ? args.issuer.trim() : undefined;
        const currency = typeof args.currency === 'string' && args.currency.trim() ? args.currency.trim() : 'XRP';
        const amount = typeof args.amount === 'string' ? args.amount.trim() : args.amount !== undefined && args.amount !== null ? String(args.amount).trim() : '';

        if (kind === 'Payment') {
          if (!destination || !isValidClassicAddress(destination)) {
            throw new Error('Valid destination r-address is required to draft a Payment.');
          }
          const numericAmt = Number(amount);
          if (!/^\d+(\.\d+)?$/.test(amount) || !Number.isFinite(numericAmt) || numericAmt <= 0) {
            throw new Error('Positive numeric amount string is required to draft a Payment.');
          }
          if (currency.toUpperCase() !== 'XRP' && (!issuer || !isValidClassicAddress(issuer))) {
            throw new Error('Valid issuer r-address is required for non-XRP token Payment.');
          }
        } else {
          if (!issuer || !isValidClassicAddress(issuer)) {
            throw new Error('Valid issuer r-address is required to draft a TrustSet.');
          }
          if (!currency || currency.toUpperCase() === 'XRP') {
            throw new Error('Issued token currency code is required for TrustSet.');
          }
          if (amount) {
            const limitNum = Number(amount);
            if (!/^\d+(\.\d+)?$/.test(amount) || !Number.isFinite(limitNum) || limitNum < 0) {
              throw new Error('TrustSet limit must be a non-negative numeric string.');
            }
          }
        }

        let destinationTag: number | undefined;
        if (
          args.destinationTag !== undefined &&
          args.destinationTag !== null &&
          args.destinationTag !== '' &&
          typeof args.destinationTag !== 'boolean'
        ) {
          const parsedTag = Number(args.destinationTag);
          if (Number.isInteger(parsedTag) && parsedTag >= 0 && parsedTag <= 0xffffffff) {
            destinationTag = parsedTag;
          }
        }
        const memoText = typeof args.memoText === 'string' ? args.memoText.trim() : undefined;

        this.deps.emitRendererAction({
          type: 'draft-tx',
          kind,
          destination,
          amount: amount || '1000000',
          currency,
          issuer,
          destinationTag,
          memoText,
        });

        return {
          data: {
            drafted: true,
            requiresHumanApproval: true,
            kind,
            currency,
            amount: amount || '1000000',
            destination,
            issuer,
          },
          summary: `Opened Human-in-the-Loop Signing Modal for ${kind} (${amount || '1000000'} ${currency})`,
        };
      }

      default:
        throw new Error(`Unsupported MCP tool: ${toolName}`);
    }
  }

  public async runAgentChat(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<{ ok: boolean; reply: AgentChatMessage; error?: string }> {
    await this.loadConfig();
    const clean = String(userMessage ?? '').trim();
    if (!clean) {
      return {
        ok: false,
        error: 'Message cannot be empty.',
        reply: { role: 'assistant', content: 'Enter a command or question.', timestamp: Date.now() },
      };
    }

    if (this.config.provider === 'local-rules') {
      return this.runLocalRulesCopilot(clean);
    }

    try {
      if (this.config.provider === 'ollama') {
        return await this.runOllamaAgent(clean, history);
      }
      if (this.config.provider === 'openai') {
        return await this.runOpenAiAgent(clean, history);
      }
      if (this.config.provider === 'anthropic') {
        return await this.runAnthropicAgent(clean, history);
      }
      if (this.config.provider === 'gemini') {
        return await this.runGeminiAgent(clean, history);
      }
      return this.runLocalRulesCopilot(clean);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Agent request failed';
      return {
        ok: false,
        error: msg,
        reply: {
          role: 'assistant',
          content: `Provider error (${this.config.provider}): ${msg}\n\nTip: Switch to **Built-in Local Copilot (Zero Key)** in the Model tab for instant offline command execution.`,
          timestamp: Date.now(),
        },
      };
    }
  }

  private async runLocalRulesCopilot(prompt: string): Promise<{ ok: boolean; reply: AgentChatMessage }> {
    const plan = parseNaturalLanguageAgentIntent(prompt);
    if (plan.length === 0) {
      return {
        ok: true,
        reply: {
          role: 'assistant',
          content: [
            `I can run live XRPL tools & manage your Command Center directly. Try commands like:`,
            `- **"network status"** or **"latest ledgers"**`,
            `- **"search token RIP"** or **"search token RLUSD"**`,
            `- **"inspect rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"**`,
            `- **"check my node"** or **"restart my node"**`,
            `- **"my portfolio"** *(requires unlocked vault)*`,
            `- **"go to globe"** / **"open tokens"** / **"open wallets"**`,
            `- **"alert xrp above $3.50"** or **"watch r..."**`,
            `- **"send 10 XRP to r..."** *(opens Signing Modal — never auto-signs)*`,
          ].join('\n'),
          timestamp: Date.now(),
        },
      };
    }

    const toolCalls: Array<{ name: string; ok: boolean; summary: string }> = [];
    const blocks: string[] = [];

    for (const step of plan) {
      const res = await this.executeTool(step.toolName, step.args, 'in-app-copilot');
      toolCalls.push({ name: step.toolName, ok: res.ok, summary: res.summary });

      if (!res.ok) {
        blocks.push(`**${step.toolName}** blocked/failed: ${res.error ?? res.summary}`);
        continue;
      }

      if (step.toolName === 'xrpl_search_tokens') {
        const payload = res.data as {
          query: string;
          source: string;
          tokens: Array<{ currency: string; issuer: string; trustlines: number; supply: number; domain?: string }>;
        };
        if (payload.tokens.length === 0) {
          blocks.push(
            `No tokens matched **"${payload.query}"** on ${payload.source}.\nTip: If you just created a token, search with its issuer address \`r...\` or \`${payload.query.toUpperCase()}:rIssuerAddress\` to query it directly on-ledger.`
          );
        } else {
          const lines = payload.tokens.slice(0, 8).map(
            (t, i) =>
              `${i + 1}. **${t.currency}** — \`${t.issuer}\`${t.domain ? ` (${t.domain})` : ''}${
                t.trustlines > 0 ? ` • ${t.trustlines.toLocaleString()} trustlines` : t.supply > 0 ? ` • Supply ${t.supply.toLocaleString()}` : ''
              }`
          );
          blocks.push(
            `Found **${payload.tokens.length}** match(es) for **"${payload.query}"** (${payload.source}):\n${lines.join('\n')}\n\nSay \`focus ${payload.tokens[0].currency}:${payload.tokens[0].issuer}\` to open it on the DEX chart.`
          );
        }
      } else if (step.toolName === 'xrpl_get_wallet_portfolio') {
        const payload = res.data as {
          totalXrp: number;
          accounts: Array<{ label: string; address: string; totalXrp?: number; spendableXrp?: number; trustlines?: Array<{ currency: string; balance: string }> }>;
        };
        const lines = payload.accounts.map(
          (a) =>
            `- **${a.label}** (\`${a.address.slice(0, 10)}…\`): **${(a.totalXrp ?? 0).toFixed(2)} XRP** (${(
              a.spendableXrp ?? 0
            ).toFixed(2)} spendable${a.trustlines?.length ? `, ${a.trustlines.length} trustlines` : ''})`
        );
        blocks.push(`**Vault Portfolio — ${payload.totalXrp.toFixed(2)} XRP total**\n${lines.join('\n')}`);
      } else {
        blocks.push(`**${res.summary}**\n\`\`\`json\n${JSON.stringify(res.data, null, 2).slice(0, 1400)}\n\`\`\``);
      }
    }

    return {
      ok: true,
      reply: {
        role: 'assistant',
        content: blocks.join('\n\n'),
        toolCalls,
        timestamp: Date.now(),
      },
    };
  }

  private getSystemPrompt(): string {
    return [
      'You are the XRPL Command Center AI Copilot running inside the user’s local desktop app.',
      'Use the provided MCP tools to inspect real-time XRPL ledger data, search tokens, audit node health, navigate UI tabs, set alerts, or draft transactions.',
      'SECURITY RULES: Never claim to sign or broadcast transactions autonomously — xrpl_draft_transaction only opens the Human-in-the-Loop Signing Modal for user approval. If the vault is locked, respect VAULT_LOCKED and tell the user to unlock their vault.',
      'Keep answers concise, factual, and grounded strictly in tool outputs.',
    ].join(' ');
  }

  private async runOpenAiAgent(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ ok: boolean; reply: AgentChatMessage }> {
    const apiKey = this.apiKeyCache;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured. Add it in Model & Audit Log settings.');
    }
    const baseUrl = this.config.endpointUrl.replace(/\/+$/, '');
    const tools = MCP_TOOLS_CATALOG.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: this.getSystemPrompt() },
      ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];
    const toolCallsLog: Array<{ name: string; ok: boolean; summary: string }> = [];

    for (let turn = 0; turn < 4; turn++) {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          tools,
          tool_choice: 'auto',
        }),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 180)}`);
      }
      const json = (await resp.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
        }>;
      };
      const msg = json.choices?.[0]?.message;
      if (!msg) throw new Error('Empty response from OpenAI endpoint.');

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
          } catch {
            parsedArgs = {};
          }
          const out = await this.executeTool(tc.function.name, parsedArgs, 'in-app-copilot');
          toolCallsLog.push({ name: tc.function.name, ok: out.ok, summary: out.summary });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(out.ok ? out.data : { error: out.error }),
          });
        }
        continue;
      }

      return {
        ok: true,
        reply: {
          role: 'assistant',
          content: msg.content || 'Completed.',
          toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
          timestamp: Date.now(),
        },
      };
    }

    return {
      ok: true,
      reply: {
        role: 'assistant',
        content: 'Executed requested tools.',
        toolCalls: toolCallsLog,
        timestamp: Date.now(),
      },
    };
  }

  private async runOllamaAgent(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ ok: boolean; reply: AgentChatMessage }> {
    const baseUrl = this.config.endpointUrl.replace(/\/+$/, '');
    const tools = MCP_TOOLS_CATALOG.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: this.getSystemPrompt() },
      ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];
    const toolCallsLog: Array<{ name: string; ok: boolean; summary: string }> = [];

    for (let turn = 0; turn < 4; turn++) {
      const resp = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          tools,
          stream: false,
        }),
      });
      if (!resp.ok) {
        throw new Error(`Ollama HTTP ${resp.status}: ${(await resp.text()).slice(0, 180)}`);
      }
      const json = (await resp.json()) as {
        message?: {
          content?: string;
          tool_calls?: Array<{ function?: { name?: string; arguments?: Record<string, unknown> } }>;
        };
      };
      const msg = json.message;
      if (!msg) throw new Error('Empty response from Ollama.');

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push(msg as Record<string, unknown>);
        for (const tc of msg.tool_calls) {
          const name = tc.function?.name ?? '';
          const args = tc.function?.arguments ?? {};
          const out = await this.executeTool(name, args, 'in-app-copilot');
          toolCallsLog.push({ name, ok: out.ok, summary: out.summary });
          messages.push({
            role: 'tool',
            content: JSON.stringify(out.ok ? out.data : { error: out.error }),
          });
        }
        continue;
      }

      return {
        ok: true,
        reply: {
          role: 'assistant',
          content: msg.content || 'Completed.',
          toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
          timestamp: Date.now(),
        },
      };
    }

    return {
      ok: true,
      reply: { role: 'assistant', content: 'Executed requested tools.', toolCalls: toolCallsLog, timestamp: Date.now() },
    };
  }

  private async runAnthropicAgent(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ ok: boolean; reply: AgentChatMessage }> {
    const apiKey = this.apiKeyCache;
    if (!apiKey) {
      throw new Error('Anthropic API key is not configured. Add it in Model & Audit Log settings.');
    }
    const baseUrl = this.config.endpointUrl.replace(/\/+$/, '');
    const tools = MCP_TOOLS_CATALOG.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));

    const messages: Array<Record<string, unknown>> = [
      ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];
    const toolCallsLog: Array<{ name: string; ok: boolean; summary: string }> = [];

    for (let turn = 0; turn < 4; turn++) {
      const resp = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 1024,
          system: this.getSystemPrompt(),
          tools,
          messages,
        }),
      });
      if (!resp.ok) {
        throw new Error(`Anthropic HTTP ${resp.status}: ${(await resp.text()).slice(0, 180)}`);
      }
      const json = (await resp.json()) as {
        content?: Array<
          | { type: 'text'; text: string }
          | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        >;
      };
      const blocks = json.content ?? [];
      const toolUses = blocks.filter(
        (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
          b.type === 'tool_use'
      );

      if (toolUses.length > 0) {
        messages.push({ role: 'assistant', content: blocks });
        const toolResults: Array<Record<string, unknown>> = [];
        for (const tu of toolUses) {
          const out = await this.executeTool(tu.name, tu.input ?? {}, 'in-app-copilot');
          toolCallsLog.push({ name: tu.name, ok: out.ok, summary: out.summary });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(out.ok ? out.data : { error: out.error }),
            is_error: !out.ok,
          });
        }
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      const text = blocks
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      return {
        ok: true,
        reply: {
          role: 'assistant',
          content: text || 'Completed.',
          toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
          timestamp: Date.now(),
        },
      };
    }

    return {
      ok: true,
      reply: { role: 'assistant', content: 'Executed requested tools.', toolCalls: toolCallsLog, timestamp: Date.now() },
    };
  }

  private async runGeminiAgent(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ ok: boolean; reply: AgentChatMessage }> {
    const apiKey = this.apiKeyCache;
    if (!apiKey) {
      throw new Error('Gemini API key is not configured. Add it in Model & Audit Log settings.');
    }
    const baseUrl = this.config.endpointUrl.replace(/\/+$/, '');
    const functionDeclarations = buildGeminiFunctionDeclarations(MCP_TOOLS_CATALOG);

    const contents: Array<Record<string, unknown>> = [
      ...history.slice(-8).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];
    const toolCallsLog: Array<{ name: string; ok: boolean; summary: string }> = [];

    for (let turn = 0; turn < 4; turn++) {
      const resp = await fetch(
        `${baseUrl}/models/${encodeURIComponent(this.config.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: this.getSystemPrompt() }] },
            contents,
            tools: [{ functionDeclarations }],
          }),
        }
      );
      if (!resp.ok) {
        throw new Error(`Gemini HTTP ${resp.status}: ${(await resp.text()).slice(0, 180)}`);
      }
      const json = (await resp.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
              functionCall?: { name: string; args?: Record<string, unknown> };
            }>;
          };
        }>;
      };
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);
      if (calls.length > 0) {
        contents.push({ role: 'model', parts });
        const fnResponses: Array<Record<string, unknown>> = [];
        for (const p of calls) {
          const fc = p.functionCall!;
          const out = await this.executeTool(fc.name, fc.args ?? {}, 'in-app-copilot');
          toolCallsLog.push({ name: fc.name, ok: out.ok, summary: out.summary });
          fnResponses.push({
            functionResponse: {
              name: fc.name,
              response: out.ok ? { result: out.data } : { error: out.error },
            },
          });
        }
        contents.push({ role: 'user', parts: fnResponses });
        continue;
      }

      const text = parts
        .map((p) => p.text ?? '')
        .join('\n')
        .trim();
      return {
        ok: true,
        reply: {
          role: 'assistant',
          content: text || 'Completed.',
          toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
          timestamp: Date.now(),
        },
      };
    }

    return {
      ok: true,
      reply: { role: 'assistant', content: 'Executed requested tools.', toolCalls: toolCallsLog, timestamp: Date.now() },
    };
  }
}
