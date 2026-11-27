// v0.3.0-beta: Pure MCP Protocol Definitions, Permission Policy & Client Config Generator

export type McpToolTier = 'read' | 'automation' | 'draft';

export interface McpToolSpec {
  name: string;
  tier: McpToolTier;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface McpAuditEntry {
  id: string;
  timestamp: number;
  source: 'mcp-http' | 'in-app-copilot';
  toolName: string;
  tier: McpToolTier;
  ok: boolean;
  durationMs: number;
  summary: string;
}

export type AgentProviderId = 'local-rules' | 'ollama' | 'openai' | 'anthropic' | 'gemini';

export interface AgentProviderConfig {
  provider: AgentProviderId;
  endpointUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface AgentProviderPreset {
  id: AgentProviderId;
  label: string;
  description: string;
  defaultEndpoint: string;
  defaultModel: string;
  requiresApiKey: boolean;
}

export const AGENT_PROVIDER_PRESETS: Record<AgentProviderId, AgentProviderPreset> = {
  'local-rules': {
    id: 'local-rules',
    label: 'Built-in Local Copilot (Zero Key)',
    description: '100% offline deterministic XRPL command & MCP tool router — no API key or external LLM required.',
    defaultEndpoint: 'local://built-in',
    defaultModel: 'xrpl-command-router-v1',
    requiresApiKey: false,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (Local LLM)',
    description: 'Private local LLM via Ollama OpenAI-compatible or /api/chat endpoint on 127.0.0.1:11434.',
    defaultEndpoint: 'http://127.0.0.1:11434',
    defaultModel: 'llama3.1:8b',
    requiresApiKey: false,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (or Compatible)',
    description: 'OpenAI Chat Completions with native MCP tool calling.',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresApiKey: true,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    description: 'Anthropic Messages API with native tool_use calling.',
    defaultEndpoint: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    requiresApiKey: true,
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini generateContent API with native function calling.',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    requiresApiKey: true,
  },
};

export interface McpServerStatus {
  enabled: boolean;
  running: boolean;
  host: string;
  port: number;
  endpointUrl: string;
  bearerToken: string;
  allowAutomation: boolean;
  allowTxDrafting: boolean;
  toolCount: number;
  auditLog: McpAuditEntry[];
  providerConfig: AgentProviderConfig;
  error?: string;
}

export interface AgentChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ name: string; ok: boolean; summary: string }>;
  timestamp: number;
}

export type McpRendererAction =
  | { type: 'navigate-tab'; tab: string }
  | { type: 'focus-token'; currency: string; currencyRaw: string; issuer: string }
  | { type: 'add-price-alert'; symbol: string; direction: 'above' | 'below'; targetUsd: number }
  | { type: 'add-watchlist'; label: string; targetType: 'account' | 'token'; target: string }
  | {
      type: 'draft-tx';
      kind: 'Payment' | 'TrustSet';
      destination?: string;
      amount?: string;
      currency?: string;
      issuer?: string;
      destinationTag?: number;
      memoText?: string;
    };

export const DEFAULT_MCP_PORT = 18490;

export const READ_ONLY_XRPL_COMMANDS = new Set([
  'account_info',
  'account_lines',
  'account_nfts',
  'account_objects',
  'account_offers',
  'account_tx',
  'amm_info',
  'book_offers',
  'deposit_authorized',
  'feature',
  'fee',
  'gateway_balances',
  'get_aggregate_price',
  'ledger',
  'ledger_closed',
  'ledger_current',
  'ledger_data',
  'ledger_entry',
  'manifest',
  'nft_buy_offers',
  'nft_sell_offers',
  'noripple_check',
  'ping',
  'ripple_path_find',
  'server_definitions',
  'server_info',
  'server_state',
  'tx',
  'vault_info',
]);

export function isReadOnlyXrplCommand(command: string): boolean {
  return READ_ONLY_XRPL_COMMANDS.has(String(command ?? '').trim().toLowerCase());
}

export const MCP_TOOLS_CATALOG: McpToolSpec[] = [
  {
    name: 'xrpl_get_network_status',
    tier: 'read',
    description:
      'Returns live XRPL Command Center connection status, active network, endpoint, latest validated ledger index, fee, TPS estimate, and XRP/USD spot price.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'xrpl_get_latest_ledgers',
    tier: 'read',
    description: 'Returns recent validated XRPL ledgers with transaction counts, fees, and close times.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of ledgers to return (1-20, default 10).' },
      },
    },
  },
  {
    name: 'xrpl_rpc_query',
    tier: 'read',
    description:
      'Executes a read-only XRPL JSON-RPC command (e.g., account_info, book_offers, amm_info, gateway_balances, server_info, fee, tx, ledger_entry) against the connected node.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Read-only rippled/Clio RPC method name.' },
        params: { type: 'object', description: 'Optional JSON parameters object for the RPC command.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'xrpl_inspect_account',
    tier: 'read',
    description:
      'Inspects an XRPL classic address, transaction hash, or ledger index with decoded flags, reserves, and summary metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'XRPL address (r...), 64-hex tx hash, or ledger index.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'xrpl_search_tokens',
    tier: 'read',
    description:
      'Searches the full XRPLMeta registry (100,000+ XRPL tokens) and live on-ledger issuers by currency symbol (e.g., RIP, RLUSD, SOLO) or issuer r-address.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Currency ticker, token name, or issuer r-address.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'xrpl_get_token_market',
    tier: 'read',
    description:
      'Fetches live on-ledger issuer risk flags, CLOB orderbook, XLS-30 AMM pool, OHLCV candles, and EMA/RSI/MACD/Bollinger technical summary for XRP/USD or any XRPL token.',
    inputSchema: {
      type: 'object',
      properties: {
        pairType: {
          type: 'string',
          description: 'Market pair type.',
          enum: ['xrp-usd', 'token-xrp'],
        },
        currency: { type: 'string', description: 'Token currency code (required when pairType is token-xrp).' },
        issuer: { type: 'string', description: 'Token issuer r-address (required when pairType is token-xrp).' },
        timeframe: {
          type: 'string',
          description: 'Candlestick timeframe (default 1h).',
          enum: ['15m', '1h', '4h', '1d'],
        },
      },
      required: ['pairType'],
    },
  },
  {
    name: 'xrpl_get_node_health',
    tier: 'read',
    description:
      'Polls the user’s local rippled / Docker node admin RPC and returns sync state, peers, validated ledgers, disk storage info, and recent log lines.',
    inputSchema: {
      type: 'object',
      properties: {
        includeLogs: { type: 'boolean', description: 'Include last 20 lines of node logs (default true).' },
      },
    },
  },
  {
    name: 'xrpl_get_wallet_portfolio',
    tier: 'read',
    description:
      'Returns public wallet addresses, XRP balances, trustlines, and Post-Quantum exposure status. Strictly respects Vault Lock — returns VAULT_LOCKED if locked and NEVER exposes seeds.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cc_navigate_tab',
    tier: 'automation',
    description: 'Switches the active module in XRPL Command Center UI.',
    inputSchema: {
      type: 'object',
      properties: {
        tab: {
          type: 'string',
          description: 'Target tab id.',
          enum: [
            'command',
            'wallets',
            'globe',
            'validators',
            'tokens',
            'launcher',
            'nftstudio',
            'vaults',
            'primitives',
            'rpc',
            'nodeops',
            'analytics',
            'education',
          ],
        },
      },
      required: ['tab'],
    },
  },
  {
    name: 'cc_focus_token',
    tier: 'automation',
    description:
      'Opens Tokens & DEX, pins/selects a specific XRPL token by currency + issuer, and loads its live OHLCV chart and on-ledger audit.',
    inputSchema: {
      type: 'object',
      properties: {
        currency: { type: 'string', description: 'Currency ticker (e.g., RIP, RLUSD, SOLO) or 40-hex.' },
        issuer: { type: 'string', description: 'Issuer classic address (r...).' },
      },
      required: ['currency', 'issuer'],
    },
  },
  {
    name: 'cc_add_price_alert',
    tier: 'automation',
    description: 'Adds a live XRP/USD price alert target plotted directly on the Tokens & DEX chart.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', description: 'Trigger direction.', enum: ['above', 'below'] },
        targetUsd: { type: 'number', description: 'Target USD price (e.g., 3.50).' },
      },
      required: ['direction', 'targetUsd'],
    },
  },
  {
    name: 'cc_add_watchlist',
    tier: 'automation',
    description: 'Adds an XRPL address or token ticker to the live desktop watchlist.',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Display name for the watchlist entry.' },
        type: { type: 'string', description: 'Watchlist target type.', enum: ['account', 'token'] },
        target: { type: 'string', description: 'r-address or token currency symbol.' },
      },
      required: ['label', 'type', 'target'],
    },
  },
  {
    name: 'cc_node_docker_action',
    tier: 'automation',
    description: 'Starts, stops, or restarts the managed local Docker rippled node.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Docker lifecycle action.', enum: ['start', 'stop', 'restart'] },
      },
      required: ['action'],
    },
  },
  {
    name: 'xrpl_draft_transaction',
    tier: 'draft',
    description:
      'Drafts an XRPL Payment or TrustSet transaction and opens XRPL Command Center’s native Human-in-the-Loop Signing Modal for explicit user review & signing. NEVER signs or broadcasts autonomously.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Draft transaction type.', enum: ['Payment', 'TrustSet'] },
        destination: { type: 'string', description: 'Destination r-address (for Payment).' },
        amount: { type: 'string', description: 'Amount string (e.g., "10" XRP or token units).' },
        currency: { type: 'string', description: 'Currency code ("XRP" or token ticker, default XRP).' },
        issuer: { type: 'string', description: 'Token issuer r-address (required for non-XRP or TrustSet).' },
        destinationTag: { type: 'number', description: 'Optional integer Destination Tag.' },
        memoText: { type: 'string', description: 'Optional plain-text memo.' },
      },
      required: ['kind'],
    },
  },
];

export function evaluateToolPermission(
  toolName: string,
  policy: { allowAutomation: boolean; allowTxDrafting: boolean; vaultUnlocked: boolean }
): { allowed: boolean; tier: McpToolTier | null; reason?: string } {
  const spec = MCP_TOOLS_CATALOG.find((t) => t.name === toolName);
  if (!spec) {
    return { allowed: false, tier: null, reason: `Unknown MCP tool: ${toolName}` };
  }
  if (spec.tier === 'automation' && !policy.allowAutomation) {
    return {
      allowed: false,
      tier: spec.tier,
      reason: 'Cockpit Automation tools are disabled. Enable Tier 2 Automation in Agent / MCP Hub.',
    };
  }
  if (spec.tier === 'draft') {
    if (!policy.allowTxDrafting) {
      return {
        allowed: false,
        tier: spec.tier,
        reason: 'Transaction Drafting is disabled. Enable Tier 3 Tx Drafting in Agent / MCP Hub.',
      };
    }
    if (!policy.vaultUnlocked) {
      return {
        allowed: false,
        tier: spec.tier,
        reason: 'VAULT_LOCKED: Unlock your XRPL Wallet Vault before drafting transactions.',
      };
    }
  }
  if (toolName === 'xrpl_get_wallet_portfolio' && !policy.vaultUnlocked) {
    return {
      allowed: false,
      tier: spec.tier,
      reason: 'VAULT_LOCKED: Wallet addresses and balances are hidden while the vault is locked.',
    };
  }
  return { allowed: true, tier: spec.tier };
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: 'OBJECT';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

/**
 * Converts MCP_TOOLS_CATALOG into Gemini REST API `functionDeclarations`.
 * Gemini rejects OBJECT schemas with empty `properties: {}` or free-form nested `object` fields
 * lacking `properties`, so zero-arg tools omit `parameters` and free-form JSON objects are typed
 * as JSON-encoded STRINGs (which `xrpl_rpc_query` parses transparently).
 */
export function buildGeminiFunctionDeclarations(
  catalog: McpToolSpec[] = MCP_TOOLS_CATALOG
): GeminiFunctionDeclaration[] {
  const mapType = (t: string): string => {
    switch (t.toLowerCase()) {
      case 'number':
      case 'integer':
        return 'NUMBER';
      case 'boolean':
        return 'BOOLEAN';
      default:
        return 'STRING';
    }
  };

  return catalog.map((tool) => {
    const entries = Object.entries(tool.inputSchema.properties ?? {});
    if (entries.length === 0) {
      return {
        name: tool.name,
        description: tool.description,
      };
    }
    const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
    for (const [key, prop] of entries) {
      const isFreeObject = prop.type.toLowerCase() === 'object';
      properties[key] = {
        type: mapType(prop.type),
        description: isFreeObject ? `${prop.description} (Pass as a JSON string, e.g. "{}")` : prop.description,
        ...(prop.enum ? { enum: prop.enum } : {}),
      };
    }
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'OBJECT',
        properties,
        ...(tool.inputSchema.required && tool.inputSchema.required.length > 0
          ? { required: tool.inputSchema.required }
          : {}),
      },
    };
  });
}

export function buildMcpClientConfigJson(endpointUrl: string, bearerToken: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        'xrpl-command-center': {
          url: endpointUrl,
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
        },
      },
    },
    null,
    2
  );
}

export function buildMcpCurlTestSnippet(endpointUrl: string, bearerToken: string): string {
  return `curl -s -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${bearerToken}" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;
}

export function validateMcpPort(port: number): number {
  const num = Math.round(Number(port));
  if (!Number.isFinite(num) || num < 1024 || num > 65535) {
    return DEFAULT_MCP_PORT;
  }
  return num;
}

/**
 * Strips any accidental XRPL family seeds or secret keys before recording audit log entries.
 */
export function sanitizeAuditSummary(text: string, maxLen = 180): string {
  const redacted = String(text ?? '')
    .replace(/\bsEd[1-9A-HJ-NP-Za-km-z]{20,36}\b/g, '[REDACTED_SEED]')
    .replace(/\bs[1-9A-HJ-NP-Za-km-z]{25,35}\b/g, '[REDACTED_SEED]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, 'Bearer [REDACTED]');
  return redacted.length > maxLen ? `${redacted.slice(0, maxLen - 1)}…` : redacted;
}

/**
 * Normalizes Vault auto-lock minutes: 0 = Never (manual lock only), or 1..240 minutes.
 */
export function normalizeAutoLockMinutes(minutes: number): number {
  const n = Math.round(Number(minutes));
  if (!Number.isFinite(n)) return 15;
  if (n <= 0) return 0;
  return Math.max(1, Math.min(240, n));
}

export interface ParsedAgentToolPlan {
  toolName: string;
  args: Record<string, unknown>;
}

const TAB_SYNONYMS: Array<{ tab: string; patterns: RegExp }> = [
  { tab: 'globe', patterns: /\b(3d\s*globe|globe|world\s*map|earth)\b/i },
  { tab: 'validators', patterns: /\b(validator|validators|unl|amendment|amendments)\b/i },
  { tab: 'tokens', patterns: /\b(tokens?|dex|chart|charts|amm|orderbook)\b/i },
  { tab: 'launcher', patterns: /\b(launcher|launch\s*token|create\s*token|airdrop)\b/i },
  { tab: 'nftstudio', patterns: /\b(nft|nfts|nft\s*studio|xls-?20)\b/i },
  { tab: 'vaults', patterns: /\b(lending|xls-?65|xls-?66|single\s*asset\s*vault)\b/i },
  { tab: 'wallets', patterns: /\b(wallets?|vault|defi\s*studio)\b/i },
  { tab: 'primitives', patterns: /\b(institutional|oracle|did|mpt|clawback)\b/i },
  { tab: 'rpc', patterns: /\b(rpc|console|time\s*machine|replay)\b/i },
  { tab: 'nodeops', patterns: /\b(node\s*ops|my\s*node|docker\s*node)\b/i },
  { tab: 'analytics', patterns: /\b(analytics|themes?|updater|diagnostics|settings)\b/i },
  { tab: 'education', patterns: /\b(academy|education|learn|lessons?|glossary)\b/i },
  { tab: 'command', patterns: /\b(command\s*deck|dashboard|home|main\s*screen)\b/i },
];

/**
 * Deterministic natural-language command parser for the zero-key Built-in Local Copilot.
 * Maps plain English requests to canonical MCP tool calls (which still go through the
 * exact same Tier 1/2/3 permission gate and audit log as external MCP clients).
 */
export function parseNaturalLanguageAgentIntent(prompt: string): ParsedAgentToolPlan[] {
  const clean = String(prompt ?? '').trim();
  if (!clean) return [];
  const lower = clean.toLowerCase();

  // 1) Draft Payment: "send 10 XRP to r..." or "pay 25 RIP:rIssuer to rDest"
  const sendMatch = clean.match(
    /\b(?:send|pay|transfer|draft\s+payment)\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9_$-]{2,20})(?:[:.](r[1-9A-HJ-NP-Za-km-z]{24,34}))?\s+to\s+(r[1-9A-HJ-NP-Za-km-z]{24,34})(?:.*?\btag\s+(\d+))?/i
  );
  if (sendMatch) {
    const [, amount, currency, issuer, destination, tagStr] = sendMatch;
    return [
      {
        toolName: 'xrpl_draft_transaction',
        args: {
          kind: 'Payment',
          amount,
          currency: currency.toUpperCase(),
          ...(issuer ? { issuer } : {}),
          destination,
          ...(tagStr ? { destinationTag: Number(tagStr) } : {}),
        },
      },
    ];
  }

  // 2) Draft TrustSet: "trustline RIP rIssuer..." or "trust 1000000 RIP rIssuer..."
  const trustMatch = clean.match(
    /\b(?:trust\s*line|trustset|trust)\s+(?:for\s+)?(?:(\d+(?:\.\d+)?)\s+)?([A-Za-z0-9_$-]{2,20})[:.\s]+(r[1-9A-HJ-NP-Za-km-z]{24,34})/i
  );
  if (trustMatch) {
    const [, limit, currency, issuer] = trustMatch;
    return [
      {
        toolName: 'xrpl_draft_transaction',
        args: {
          kind: 'TrustSet',
          currency: currency.toUpperCase(),
          issuer,
          amount: limit || '1000000',
        },
      },
    ];
  }

  // 3) Price alert: "alert xrp above 3.50" or "notify if xrp drops below $2.10"
  const alertMatch = clean.match(
    /\b(?:alert|notify|ping).*?\b(above|over|below|under)\s+\$?(\d+(?:\.\d+)?)/i
  );
  if (alertMatch) {
    const dir = /below|under/i.test(alertMatch[1]) ? 'below' : 'above';
    const targetUsd = Number(alertMatch[2]);
    if (Number.isFinite(targetUsd) && targetUsd > 0) {
      return [
        {
          toolName: 'cc_add_price_alert',
          args: { direction: dir, targetUsd },
        },
      ];
    }
  }

  // 4) Docker node actions: "start docker node", "restart my docker node", "stop local rippled node"
  const dockerMatch = clean.match(
    /\b(start|stop|restart)\s+(?:(?:my|the|local|docker|rippled|xrpl)\s+)*node\b/i
  );
  if (dockerMatch) {
    return [
      {
        toolName: 'cc_node_docker_action',
        args: { action: dockerMatch[1].toLowerCase() },
      },
    ];
  }

  // 5) Focus a specific token pair: "focus RIP:r..." or "chart SOLO r..."
  const focusPairMatch = clean.match(
    /\b(?:focus|chart|open\s+token|select\s+token)\s+([A-Za-z0-9_$-]{2,20})[:.\s]+(r[1-9A-HJ-NP-Za-km-z]{24,34})/i
  );
  if (focusPairMatch) {
    return [
      {
        toolName: 'cc_focus_token',
        args: { currency: focusPairMatch[1], issuer: focusPairMatch[2] },
      },
    ];
  }

  // 6) Add to watchlist: "watch r..." or "watch token RIP"
  const watchAddrMatch = clean.match(/\b(?:watch|watchlist|track)\s+(r[1-9A-HJ-NP-Za-km-z]{24,34})(?:\s+as\s+(.+))?/i);
  if (watchAddrMatch) {
    const addr = watchAddrMatch[1];
    return [
      {
        toolName: 'cc_add_watchlist',
        args: {
          label: watchAddrMatch[2]?.trim() || `Watched ${addr.slice(0, 8)}`,
          type: 'account',
          target: addr,
        },
      },
    ];
  }
  const watchTokMatch = clean.match(/\b(?:watch|watchlist)\s+token\s+([A-Za-z0-9_$-]{2,20})/i);
  if (watchTokMatch) {
    const sym = watchTokMatch[1].toUpperCase();
    return [
      {
        toolName: 'cc_add_watchlist',
        args: { label: `${sym} Token`, type: 'token', target: sym },
      },
    ];
  }

  // 7) Search tokens (must precede generic "show me" tab navigation so "show me token RIP" searches RIP!)
  const explicitTokenSearchMatch = clean.match(
    /\b(?:search|find|lookup|look\s+up|discover|show(?:\s+me)?)\s+(?:for\s+)?(?:tokens?|coins?|assets?|iou)\s+([A-Za-z0-9_$.:-]{2,64})/i
  );
  if (explicitTokenSearchMatch) {
    return [{ toolName: 'xrpl_search_tokens', args: { query: explicitTokenSearchMatch[1].trim() } }];
  }

  // Short direct search without the word "token": e.g. "find RIP", "search RIP", "lookup RLUSD"
  const shortSearchMatch = clean.match(
    /^\s*(?:search|find|lookup|look\s+up)\s+(?:for\s+)?([A-Za-z0-9_$.:-]{2,64})\s*$/i
  );
  if (
    shortSearchMatch &&
    !/^(?:tokens?|coins?|assets?|status|network|node|wallets?|validators?|ledgers?|portfolio)$/i.test(
      shortSearchMatch[1]
    )
  ) {
    return [{ toolName: 'xrpl_search_tokens', args: { query: shortSearchMatch[1].trim() } }];
  }

  // 8) Explicit navigation: "go to globe", "open wallets", "switch to tokens"
  if (/^\s*(?:go\s+to|open|switch\s+to|show\s+me|navigate\s+to)\b/i.test(clean)) {
    for (const item of TAB_SYNONYMS) {
      if (item.patterns.test(clean)) {
        return [{ toolName: 'cc_navigate_tab', args: { tab: item.tab } }];
      }
    }
  }

  // 9) Inspect address, tx hash, or ledger index
  const hashMatch = clean.match(/\b([0-9A-Fa-f]{64})\b/);
  if (hashMatch) {
    return [{ toolName: 'xrpl_inspect_account', args: { query: hashMatch[1] } }];
  }
  const addrMatch = clean.match(/\b(r[1-9A-HJ-NP-Za-km-z]{24,34})\b/);
  if (addrMatch) {
    if (/\btokens?\b|\bissued\b|\bissuer\b/i.test(clean)) {
      return [{ toolName: 'xrpl_search_tokens', args: { query: addrMatch[1] } }];
    }
    return [{ toolName: 'xrpl_inspect_account', args: { query: addrMatch[1] } }];
  }

  // 10) Direct RPC: "rpc server_info" or "run fee"
  const rpcMatch = clean.match(/\b(?:rpc|command)\s+([a-z_]{3,32})\b/i);
  if (rpcMatch) {
    return [{ toolName: 'xrpl_rpc_query', args: { command: rpcMatch[1].toLowerCase(), params: {} } }];
  }

  // 11) Wallet portfolio
  if (/\b(portfolio|my\s+wallets?|my\s+balances?|how\s+much\s+xrp|vault\s+balances?)\b/i.test(lower)) {
    return [{ toolName: 'xrpl_get_wallet_portfolio', args: {} }];
  }

  // 12) Node health
  if (/\b(my\s+node|node\s+health|rippled\s+health|node\s+status|docker\s+status|sync\s+state)\b/i.test(lower)) {
    return [{ toolName: 'xrpl_get_node_health', args: { includeLogs: true } }];
  }

  // 13) Market / XRP price / technicals
  if (/\b(xrp\s+price|market|rsi|macd|chart\s+summary|technicals?|candles?)\b/i.test(lower)) {
    return [
      { toolName: 'xrpl_get_network_status', args: {} },
      { toolName: 'xrpl_get_token_market', args: { pairType: 'xrp-usd', timeframe: '1h' } },
    ];
  }

  // 14) Recent ledgers
  if (/\b(latest\s+ledgers?|recent\s+ledgers?|ledger\s+history)\b/i.test(lower)) {
    return [{ toolName: 'xrpl_get_latest_ledgers', args: { limit: 8 } }];
  }

  // 15) Network status default
  if (/\b(status|network|tps|fee|ledger|health|live|overview|summary)\b/i.test(lower)) {
    return [{ toolName: 'xrpl_get_network_status', args: {} }];
  }

  // 16) Short single-word token ticker query fallback (e.g., "RIP" or "RLUSD")
  if (/^[A-Za-z0-9_$-]{2,12}$/.test(clean) && clean.toUpperCase() !== 'HELP') {
    return [{ toolName: 'xrpl_search_tokens', args: { query: clean } }];
  }

  return [];
}

