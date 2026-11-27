import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DirectoryService } from '../electron/directoryService';
import { McpAgentService } from '../electron/mcpAgentService';
import type { RustVaultSidecarClient } from '../electron/rustVaultClient';
import { WalletVaultService } from '../electron/walletVaultService';
import type { XrplStreamManager } from '../electron/xrplStream';
import {
  buildGeminiFunctionDeclarations,
  buildMcpClientConfigJson,
  buildMcpCurlTestSnippet,
  evaluateToolPermission,
  isReadOnlyXrplCommand,
  MCP_TOOLS_CATALOG,
  normalizeAutoLockMinutes,
  parseNaturalLanguageAgentIntent,
  sanitizeAuditSummary,
  validateMcpPort,
  type McpRendererAction,
} from '../src/shared/mcpAgentUtils';
import {
  canonicalTokenKey,
  extractIssuedTokensFromTx,
  mergeTokenCollections,
  parseTokenQueryInput,
} from '../src/shared/tokenDiscoveryUtils';
import type { TokenRecord } from '../src/shared/types';
import { parseLiveTransactionEvent } from '../src/shared/xrplCodec';

const RIP_ISSUER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const RLUSD_ISSUER = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';

describe('v0.3.0-beta Agent & MCP Hub, Vault Lock Privacy/Timeout, and Full-Ledger Token Discovery', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xrpl-cc-v030-test-'));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('enforces read-only XRPL RPC allowlist, 3-tier MCP permissions, and Vault Lock guards', () => {
    expect(isReadOnlyXrplCommand('account_info')).toBe(true);
    expect(isReadOnlyXrplCommand('gateway_balances')).toBe(true);
    expect(isReadOnlyXrplCommand('AMM_INFO')).toBe(true);
    expect(isReadOnlyXrplCommand('sign')).toBe(false);
    expect(isReadOnlyXrplCommand('submit')).toBe(false);
    expect(isReadOnlyXrplCommand('wallet_propose')).toBe(false);
    expect(isReadOnlyXrplCommand('')).toBe(false);

    // Tier 1 read tools allowed even when locked (except portfolio!)
    expect(
      evaluateToolPermission('xrpl_get_network_status', {
        allowAutomation: false,
        allowTxDrafting: false,
        vaultUnlocked: false,
      }).allowed
    ).toBe(true);

    // Portfolio strictly respects Vault Lock
    const lockedPortfolio = evaluateToolPermission('xrpl_get_wallet_portfolio', {
      allowAutomation: true,
      allowTxDrafting: true,
      vaultUnlocked: false,
    });
    expect(lockedPortfolio.allowed).toBe(false);
    expect(lockedPortfolio.reason).toContain('VAULT_LOCKED');

    // Tier 2 automation blocked when allowAutomation is false
    expect(
      evaluateToolPermission('cc_navigate_tab', {
        allowAutomation: false,
        allowTxDrafting: false,
        vaultUnlocked: true,
      }).allowed
    ).toBe(false);

    // Tier 3 tx drafting requires BOTH allowTxDrafting AND vaultUnlocked
    expect(
      evaluateToolPermission('xrpl_draft_transaction', {
        allowAutomation: true,
        allowTxDrafting: true,
        vaultUnlocked: false,
      }).allowed
    ).toBe(false);
    expect(
      evaluateToolPermission('xrpl_draft_transaction', {
        allowAutomation: true,
        allowTxDrafting: true,
        vaultUnlocked: true,
      }).allowed
    ).toBe(true);
  });

  it('sanitizes accidental XRPL seeds/tokens from audit logs and validates ports & client config snippets', () => {
    const clean = sanitizeAuditSummary(
      'Attempted sEd7rBGm5kxzauRTAV2hbsNz7N45X91 with Bearer abcdef1234567890xyz'
    );
    expect(clean).not.toContain('sEd7rBGm5kxzauRTAV2hbsNz7N45X91');
    expect(clean).not.toContain('abcdef1234567890xyz');
    expect(clean).toContain('[REDACTED_SEED]');
    expect(clean).toContain('Bearer [REDACTED]');

    expect(validateMcpPort(18490)).toBe(18490);
    expect(validateMcpPort(80)).toBe(18490);
    expect(validateMcpPort(99999)).toBe(18490);

    const cfgJson = buildMcpClientConfigJson('http://127.0.0.1:18490/mcp', 'tok_secret_123');
    expect(JSON.parse(cfgJson).mcpServers['xrpl-command-center'].url).toBe('http://127.0.0.1:18490/mcp');
    expect(buildMcpCurlTestSnippet('http://127.0.0.1:18490/mcp', 'tok_secret_123')).toContain('tools/list');
  });

  it('routes natural language commands accurately for Built-in Local Copilot', () => {
    expect(parseNaturalLanguageAgentIntent('search token RIP')[0]).toEqual({
      toolName: 'xrpl_search_tokens',
      args: { query: 'RIP' },
    });
    expect(parseNaturalLanguageAgentIntent(`send 12.5 XRP to ${RLUSD_ISSUER} tag 42`)[0]).toEqual({
      toolName: 'xrpl_draft_transaction',
      args: {
        kind: 'Payment',
        amount: '12.5',
        currency: 'XRP',
        destination: RLUSD_ISSUER,
        destinationTag: 42,
      },
    });
    expect(parseNaturalLanguageAgentIntent('alert xrp above $3.50')[0]).toEqual({
      toolName: 'cc_add_price_alert',
      args: { direction: 'above', targetUsd: 3.5 },
    });
    expect(parseNaturalLanguageAgentIntent('go to 3d globe')[0]).toEqual({
      toolName: 'cc_navigate_tab',
      args: { tab: 'globe' },
    });
    expect(parseNaturalLanguageAgentIntent('restart my docker node')[0]).toEqual({
      toolName: 'cc_node_docker_action',
      args: { action: 'restart' },
    });
    expect(parseNaturalLanguageAgentIntent('my portfolio')[0].toolName).toBe('xrpl_get_wallet_portfolio');
    expect(parseNaturalLanguageAgentIntent('')).toEqual([]);
  });

  it('runs a live loopback-only HTTP MCP server with Bearer auth, Vault Lock enforcement, and Human-in-the-Loop Tx Drafting', async () => {
    let vaultUnlocked = false;
    const emittedActions: McpRendererAction[] = [];

    const mcp = new McpAgentService({
      storageDir: tmpDir,
      appVersion: '0.3.0-beta',
      streamManager: {
        getStatus: () => ({
          connected: true,
          connecting: false,
          networkId: 'mainnet',
          endpoint: 'wss://xrplcluster.com/',
          latencyMs: 24,
          serverLoadFactor: 1,
          consensusPhase: 'accepted',
        }),
        request: async (cmd) => ({ result: { command: cmd, ok: true } }),
      },
      directoryService: {
        fetchMarketPrices: async () => ({
          xrpUsd: 2.5,
          change24hPct: 3.1,
          source: 'mock',
          fetchedAt: Date.now(),
        }),
        fetchMarketOhlc: async () => ({
          pairLabel: 'XRP / USD',
          quoteSymbol: 'USD',
          timeframe: '1h',
          source: 'mock',
          fetchedAt: Date.now(),
          candles: [],
        }),
        inspectQuery: async () => ({
          kind: 'account',
          query: RLUSD_ISSUER,
          title: RLUSD_ISSUER,
          summary: [],
          raw: {},
        }),
        inspectTokenOnLedger: async () => ({
          currency: 'RIP',
          currencyRaw: 'RIP',
          issuer: RIP_ISSUER,
          fetchedAt: Date.now(),
          xrpBalance: '100',
          flags: {
            blackholed: false,
            disableMaster: false,
            globalFreeze: false,
            noFreeze: true,
            allowClawback: false,
            requireAuth: false,
            defaultRipple: true,
            depositAuth: false,
          },
          bids: [],
          asks: [],
          amm: null,
        }),
        searchTokens: async (_s, q) => ({
          tokens: [
            {
              id: `RIP:${RIP_ISSUER}`,
              currency: q.toUpperCase(),
              currencyRaw: q.toUpperCase(),
              issuer: RIP_ISSUER,
              holders: 12,
              trustlines: 25,
              supply: 1_000_000,
              volume24hUsd: 0,
              marketcapUsd: 0,
              priceUsd: 0,
              source: 'on-ledger',
            },
          ],
          source: 'on-ledger RPC',
          fetchedAt: Date.now(),
        }),
      },
      nodeOpsService: {
        pollNode: async () => ({
          connected: false,
          endpoint: 'http://127.0.0.1:5005',
          checkedAt: Date.now(),
          peers: [],
          amendments: [],
          adminAvailable: false,
        }),
      },
      dockerService: {
        getStatus: async () => ({
          dockerInstalled: true,
          daemonRunning: true,
          containerExists: false,
          containerRunning: false,
          containerName: 'xrpl-cc',
          storageRoot: tmpDir,
          configDir: tmpDir,
          dataDir: tmpDir,
        }),
        lifecycleAction: async (action) => ({ ok: true, message: `mock ${action}` }),
        readLogs: async () => ({ ok: true, lines: [] }),
      },
      walletVault: {
        getStatus: async () => ({
          initialized: true,
          unlocked: vaultUnlocked,
          osKeychainAvailable: false,
          accounts: [
            {
              id: 'w1',
              label: 'Treasury',
              address: RIP_ISSUER,
              kind: 'custodial',
              algorithm: 'ed25519',
              createdAt: Date.now(),
            },
          ],
        }),
        fetchPortfolio: async (_s, addr) => ({
          address: addr,
          funded: true,
          fetchedAt: Date.now(),
          totalXrp: 100,
          totalXrpDisplay: '100',
          baseReserveXrp: 1,
          ownerReserveXrp: 0,
          spendableXrp: 99,
          sequence: 1,
          ownerCount: 0,
          flags: {
            blackholed: false,
            disableMaster: false,
            globalFreeze: false,
            noFreeze: false,
            allowClawback: false,
            requireAuth: false,
            defaultRipple: false,
            depositAuth: false,
          },
          tokens: [],
          offers: [],
          escrows: [],
          checks: [],
          nfts: [],
          recentTransactions: [],
        }),
      },
      getRecentLedgers: () => [],
      getLastNodeConfig: () => ({ label: 'Local', rpcUrl: 'http://127.0.0.1:5005' }),
      emitStatus: () => undefined,
      emitRendererAction: (a) => emittedActions.push(a),
    });

    try {
      const st = await mcp.updateConfig({
        enabled: true,
        port: 0, // ephemeral loopback port
        allowAutomation: true,
        allowTxDrafting: true,
      });
      expect(st.running).toBe(true);
      expect(st.host).toBe('127.0.0.1');
      expect(st.port).toBeGreaterThan(0);

      // 1) Unauthorized call rejected with 401
      const unauth = await fetch(st.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      expect(unauth.status).toBe(401);

      const authHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${st.bearerToken}`,
      };

      // 2) tools/list returns all 14 MCP tools
      const listRes = await fetch(st.endpointUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      });
      expect(listRes.status).toBe(200);
      const listJson = (await listRes.json()) as { result: { tools: unknown[] } };
      expect(listJson.result.tools).toHaveLength(MCP_TOOLS_CATALOG.length);

      // 3) Portfolio call blocked while Vault is locked
      const lockedRes = await fetch(st.endpointUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'xrpl_get_wallet_portfolio', arguments: {} },
        }),
      });
      const lockedJson = (await lockedRes.json()) as { result: { isError: boolean; content: Array<{ text: string }> } };
      expect(lockedJson.result.isError).toBe(true);
      expect(lockedJson.result.content[0].text).toContain('VAULT_LOCKED');

      // 4) Unlock vault -> draft tx emits renderer action (opens Signing Modal, NEVER auto-signs)
      vaultUnlocked = true;
      const draftRes = await fetch(st.endpointUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'xrpl_draft_transaction',
            arguments: { kind: 'Payment', destination: RLUSD_ISSUER, amount: '5', currency: 'XRP' },
          },
        }),
      });
      const draftJson = (await draftRes.json()) as { result: { isError: boolean; content: Array<{ text: string }> } };
      expect(draftJson.result.isError).toBe(false);
      expect(emittedActions).toHaveLength(1);
      expect(emittedActions[0]).toMatchObject({
        type: 'draft-tx',
        kind: 'Payment',
        destination: RLUSD_ISSUER,
        amount: '5',
      });

      // 5) Audit log captured calls
      expect(mcp.getStatus().auditLog.length).toBeGreaterThanOrEqual(2);
    } finally {
      await mcp.shutdown();
    }
  });

  it('persists configurable Vault lock timeout (including manual-only 0) and notifies lock listeners', async () => {
    expect(normalizeAutoLockMinutes(0)).toBe(0);
    expect(normalizeAutoLockMinutes(-5)).toBe(0);
    expect(normalizeAutoLockMinutes(500)).toBe(240);
    expect(normalizeAutoLockMinutes(30)).toBe(30);

    const vault = new WalletVaultService(tmpDir);
    let lockNotified = 0;
    vault.setOnLockListener(() => {
      lockNotified += 1;
    });

    await vault.setupVault('super-secret-passphrase-123');
    expect(vault.setAutoLockMinutes(30)).toBe(30);
    const unlockedStatus = await vault.getStatus();
    expect(unlockedStatus.autoLockMinutes).toBe(30);
    expect(typeof unlockedStatus.autoLockAt).toBe('number');
    expect(unlockedStatus.autoLockAt!).toBeGreaterThan(Date.now());

    // Manual-only (0) disables auto-lock countdown
    expect(vault.setAutoLockMinutes(0)).toBe(0);
    expect((await vault.getStatus()).autoLockAt).toBeNull();

    // Locking clears autoLockAt and triggers listener
    vault.lock();
    expect(lockNotified).toBe(1);
    expect((await vault.getStatus()).unlocked).toBe(false);

    // Wait briefly for async vault-prefs.json write, then verify persistence across a fresh instance
    await new Promise((r) => setTimeout(r, 40));
    const reloaded = new WalletVaultService(tmpDir);
    const reloadedStatus = await reloaded.getStatus();
    expect(reloadedStatus.autoLockMinutes).toBe(0);
  });

  it('extracts multi-token live stream assets with canonical 40-hex currencyRaw, parses queries, and merges collections', () => {
    // Token-to-token OfferCreate carrying RIP (3-char) and RLUSD (40-hex)
    const offerTx = {
      TransactionType: 'OfferCreate',
      Account: RIP_ISSUER,
      TakerGets: { currency: 'RIP', issuer: RIP_ISSUER, value: '1000' },
      TakerPays: {
        currency: '524C555344000000000000000000000000000000',
        issuer: RLUSD_ISSUER,
        value: '50',
      },
      Fee: '12',
    };
    const extracted = extractIssuedTokensFromTx(offerTx);
    expect(extracted).toHaveLength(2);
    expect(extracted.find((t) => t.currency === 'RIP')).toEqual({
      currency: 'RIP',
      currencyRaw: 'RIP',
      issuer: RIP_ISSUER,
    });
    expect(extracted.find((t) => t.currency === 'RLUSD')).toEqual({
      currency: 'RLUSD',
      currencyRaw: '524C555344000000000000000000000000000000',
      issuer: RLUSD_ISSUER,
    });

    // Live transaction parser attaches observedTokens
    const parsedLive = parseLiveTransactionEvent({ transaction: offerTx, validated: true, hash: 'ABC' });
    expect(parsedLive?.observedTokens).toHaveLength(2);

    // Query parser handles CURRENCY:rIssuer, issuer, hex, and symbol queries
    expect(parseTokenQueryInput(`RIP:${RIP_ISSUER}`)).toMatchObject({
      kind: 'pair',
      currency: 'RIP',
      currencyRaw: 'RIP',
      issuer: RIP_ISSUER,
    });
    expect(parseTokenQueryInput(RIP_ISSUER)).toMatchObject({ kind: 'issuer', issuer: RIP_ISSUER });
    expect(parseTokenQueryInput('RIP')).toMatchObject({ kind: 'search', query: 'RIP', encodedCurrency: 'RIP' });

    // Collection merge deduplicates and preserves liveTxCount + pinned + directory trustlines
    const dirTok: TokenRecord = {
      id: canonicalTokenKey('RIP', RIP_ISSUER),
      currency: 'RIP',
      currencyRaw: 'RIP',
      issuer: RIP_ISSUER,
      holders: 50,
      trustlines: 80,
      supply: 1_000_000,
      volume24hUsd: 0,
      marketcapUsd: 0,
      priceUsd: 0,
      source: 'xrplmeta',
    };
    const liveTok: TokenRecord = {
      ...dirTok,
      holders: 0,
      trustlines: 0,
      supply: 0,
      source: 'live-stream',
      liveTxCount: 7,
      lastSeenAt: 1700000000000,
    };
    const merged = mergeTokenCollections({
      directory: [dirTok],
      liveStream: [liveTok],
      pinned: [{ ...liveTok, pinned: true }],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].trustlines).toBe(80);
    expect(merged[0].liveTxCount).toBe(7);
    expect(merged[0].pinned).toBe(true);
  });

  it('discovers unindexed/custom tokens (like RIP) directly on-ledger via gateway_balances RPC', async () => {
    const dir = new DirectoryService();
    const mockStream = {
      request: async (cmd: string) => {
        if (cmd === 'account_info') {
          return { result: { account_data: { Domain: '7269702E6578616D706C65' } } }; // "rip.example"
        }
        if (cmd === 'gateway_balances') {
          return { result: { obligations: { RIP: '5000000' } } };
        }
        return { result: {} };
      },
    } as unknown as XrplStreamManager;

    const found = await dir.searchTokens(mockStream, RIP_ISSUER, 'testnet');
    expect(found.tokens).toHaveLength(1);
    expect(found.tokens[0].currency).toBe('RIP');
    expect(found.tokens[0].supply).toBe(5_000_000);
    expect(found.tokens[0].domain).toBe('rip.example');
    expect(found.tokens[0].source).toBe('on-ledger');
  });

  it('routes natural language token search variants and builds Gemini-compliant function declarations', () => {
    expect(parseNaturalLanguageAgentIntent('show me token RIP')[0]).toEqual({
      toolName: 'xrpl_search_tokens',
      args: { query: 'RIP' },
    });
    expect(parseNaturalLanguageAgentIntent('find RIP')[0]).toEqual({
      toolName: 'xrpl_search_tokens',
      args: { query: 'RIP' },
    });
    expect(parseNaturalLanguageAgentIntent('search for RLUSD')[0]).toEqual({
      toolName: 'xrpl_search_tokens',
      args: { query: 'RLUSD' },
    });
    expect(parseNaturalLanguageAgentIntent('show me tokens')[0]).toEqual({
      toolName: 'cc_navigate_tab',
      args: { tab: 'tokens' },
    });

    const geminiDecls = buildGeminiFunctionDeclarations(MCP_TOOLS_CATALOG);
    expect(geminiDecls).toHaveLength(MCP_TOOLS_CATALOG.length);
    const statusDecl = geminiDecls.find((d) => d.name === 'xrpl_get_network_status');
    expect(statusDecl?.parameters).toBeUndefined();
    const rpcDecl = geminiDecls.find((d) => d.name === 'xrpl_rpc_query');
    expect(rpcDecl?.parameters?.properties.params.type).toBe('STRING');
    for (const d of geminiDecls) {
      if (d.parameters) {
        expect(Object.keys(d.parameters.properties).length).toBeGreaterThan(0);
      }
    }
  });

  it('hardens MCP HTTP against non-object JSON, notifications, DNS rebinding Host headers, and invalid tx draft inputs', async () => {
    const emittedActions: McpRendererAction[] = [];
    const mcp = new McpAgentService({
      storageDir: tmpDir,
      appVersion: '0.3.0-beta',
      streamManager: {
        getStatus: () => ({
          connected: true,
          connecting: false,
          networkId: 'mainnet',
          endpoint: 'wss://xrplcluster.com/',
          latencyMs: 18,
          serverLoadFactor: 1,
          consensusPhase: 'accepted',
        }),
        request: async (cmd, params) => ({ result: { command: cmd, params } }),
      },
      directoryService: {
        fetchMarketPrices: async () => ({ xrpUsd: 2.5, change24hPct: 1, source: 'mock', fetchedAt: Date.now() }),
        fetchMarketOhlc: async () => ({
          pairLabel: 'XRP / USD',
          quoteSymbol: 'USD',
          timeframe: '1h',
          source: 'mock',
          fetchedAt: Date.now(),
          candles: [],
        }),
        inspectQuery: async () => ({ kind: 'account', query: RIP_ISSUER, title: RIP_ISSUER, summary: [], raw: {} }),
        inspectTokenOnLedger: async () => {
          throw new Error('unused');
        },
        searchTokens: async () => ({ tokens: [], source: 'mock', fetchedAt: Date.now() }),
      },
      nodeOpsService: {
        pollNode: async () => ({
          connected: false,
          endpoint: 'http://127.0.0.1:5005',
          checkedAt: Date.now(),
          peers: [],
          amendments: [],
          adminAvailable: false,
        }),
      },
      dockerService: {
        getStatus: async () => ({
          dockerInstalled: false,
          daemonRunning: false,
          containerExists: false,
          containerRunning: false,
          containerName: 'xrpl-cc',
          storageRoot: tmpDir,
          configDir: tmpDir,
          dataDir: tmpDir,
        }),
        lifecycleAction: async () => ({ ok: true, message: 'ok' }),
        readLogs: async () => ({ ok: true, lines: [] }),
      },
      walletVault: {
        getStatus: async () => ({
          initialized: true,
          unlocked: true,
          osKeychainAvailable: false,
          accounts: [],
        }),
        fetchPortfolio: async () => {
          throw new Error('unused');
        },
      },
      getRecentLedgers: () => [],
      getLastNodeConfig: () => ({ label: 'Local', rpcUrl: 'http://127.0.0.1:5005' }),
      emitStatus: () => undefined,
      emitRendererAction: (a) => emittedActions.push(a),
    });

    try {
      const st = await mcp.updateConfig({ enabled: true, port: 0, allowAutomation: true, allowTxDrafting: true });
      const authHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${st.bearerToken}`,
      };

      // JSON primitive `null` returns 400 Invalid Request instead of crashing/hanging
      const nullRes = await fetch(st.endpointUrl, { method: 'POST', headers: authHeaders, body: 'null' });
      expect(nullRes.status).toBe(400);
      const nullJson = (await nullRes.json()) as { error: { code: number } };
      expect(nullJson.error.code).toBe(-32600);

      // JSON array returns 400 Invalid Request
      const arrRes = await fetch(st.endpointUrl, { method: 'POST', headers: authHeaders, body: '[]' });
      expect(arrRes.status).toBe(400);

      // Generic MCP notification returns 202 Accepted
      const notifRes = await fetch(st.endpointUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled' }),
      });
      expect(notifRes.status).toBe(202);

      // Non-loopback Host header rejected with 403 Forbidden (DNS rebinding protection)
      const rebindStatus = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: st.port,
            path: '/health',
            method: 'GET',
            headers: { Host: 'evil.example.com' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          }
        );
        req.on('error', reject);
        req.end();
      });
      expect(rebindStatus).toBe(403);

      // xrpl_draft_transaction rejects non-numeric amount ("abc", "NaN")
      const badAmt = await mcp.executeTool(
        'xrpl_draft_transaction',
        { kind: 'Payment', destination: RLUSD_ISSUER, amount: 'abc', currency: 'XRP' },
        'mcp-http'
      );
      expect(badAmt.ok).toBe(false);
      expect(emittedActions).toHaveLength(0);

      // xrpl_draft_transaction does NOT coerce empty string destinationTag to 0
      const okDraft = await mcp.executeTool(
        'xrpl_draft_transaction',
        { kind: 'Payment', destination: RLUSD_ISSUER, amount: '10', currency: 'XRP', destinationTag: '' },
        'mcp-http'
      );
      expect(okDraft.ok).toBe(true);
      expect(emittedActions).toHaveLength(1);
      expect(emittedActions[0]).toMatchObject({ type: 'draft-tx', destinationTag: undefined });

      // xrpl_rpc_query accepts stringified JSON params (Gemini tool-calling format)
      const rpcRes = await mcp.executeTool(
        'xrpl_rpc_query',
        { command: 'account_info', params: JSON.stringify({ account: RIP_ISSUER }) },
        'in-app-copilot'
      );
      expect(rpcRes.ok).toBe(true);
      expect(rpcRes.data).toEqual({ command: 'account_info', params: { account: RIP_ISSUER } });
    } finally {
      await mcp.shutdown();
    }
  });

  it('re-arms auto-lock countdown from Never (0) -> 5m on unlocked Rust sidecar and persists prefs synchronously', async () => {
    let sidecarUnlocked = false;
    let sidecarLockCount = 0;
    const mockSidecar = {
      isRunning: () => true,
      getStatus: async () => ({
        initialized: true,
        unlocked: sidecarUnlocked,
        osKeychainAvailable: false,
        backend: 'rust-sidecar' as const,
        kdf: 'argon2id+aes-256-gcm' as const,
        accounts: [],
      }),
      setupVault: async () => {
        sidecarUnlocked = true;
        return {
          initialized: true,
          unlocked: true,
          osKeychainAvailable: false,
          backend: 'rust-sidecar' as const,
          kdf: 'argon2id+aes-256-gcm' as const,
          accounts: [],
        };
      },
      unlock: async () => {
        sidecarUnlocked = true;
        return {
          initialized: true,
          unlocked: true,
          osKeychainAvailable: false,
          backend: 'rust-sidecar' as const,
          kdf: 'argon2id+aes-256-gcm' as const,
          accounts: [],
        };
      },
      lock: async () => {
        await new Promise((r) => setTimeout(r, 15));
        sidecarUnlocked = false;
        sidecarLockCount += 1;
      },
    } as unknown as RustVaultSidecarClient;

    const vault = new WalletVaultService(tmpDir, undefined, mockSidecar);
    let listenerSawUnlocked: boolean | null = null;
    const lockDone = new Promise<void>((resolve) => {
      vault.setOnLockListener(() => {
        listenerSawUnlocked = sidecarUnlocked;
        resolve();
      });
    });

    await vault.unlock('passphrase-12345');
    expect((await vault.getStatus()).autoLockAt).not.toBeNull();

    // Switch to Never (0), then back to 5m while Rust sidecar is still unlocked
    expect(vault.setAutoLockMinutes(0)).toBe(0);
    expect(vault.getAutoLockAt()).toBeNull();
    expect(vault.setAutoLockMinutes(5)).toBe(5);
    expect(vault.getAutoLockAt()).not.toBeNull();
    expect(vault.getAutoLockAt()!).toBeGreaterThan(Date.now() + 4 * 60_000);

    // Persists synchronously (readable immediately by a fresh instance without sleep)
    const fresh = new WalletVaultService(tmpDir);
    expect((await fresh.getStatus()).autoLockMinutes).toBe(5);

    // lock() waits for Rust sidecar lock before notifying listener
    vault.lock();
    await lockDone;
    expect(sidecarLockCount).toBe(1);
    expect(listenerSawUnlocked).toBe(false);
  });

  it('executes multi-turn tool calling loops against mock Ollama, OpenAI, Anthropic, and Gemini HTTP endpoints', async () => {
    const turnCounts: Record<string, number> = { ollama: 0, openai: 0, anthropic: 0, gemini: 0 };
    const mockLlmServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c.toString()));
      req.on('end', () => {
        const url = req.url ?? '';
        const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });

        if (url.endsWith('/api/chat')) {
          turnCounts.ollama += 1;
          if (turnCounts.ollama === 1) {
            res.end(
              JSON.stringify({
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [{ function: { name: 'xrpl_get_network_status', arguments: {} } }],
                },
              })
            );
          } else {
            res.end(JSON.stringify({ message: { role: 'assistant', content: 'Ollama: MAINNET LIVE' } }));
          }
          return;
        }

        if (url.endsWith('/chat/completions')) {
          turnCounts.openai += 1;
          if (turnCounts.openai === 1) {
            res.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: null,
                      tool_calls: [
                        { id: 'call_1', function: { name: 'xrpl_get_network_status', arguments: '{}' } },
                      ],
                    },
                  },
                ],
              })
            );
          } else {
            res.end(JSON.stringify({ choices: [{ message: { content: 'OpenAI: MAINNET LIVE' } }] }));
          }
          return;
        }

        if (url.endsWith('/messages')) {
          turnCounts.anthropic += 1;
          if (turnCounts.anthropic === 1) {
            res.end(
              JSON.stringify({
                content: [{ type: 'tool_use', id: 'tu_1', name: 'xrpl_get_network_status', input: {} }],
              })
            );
          } else {
            res.end(JSON.stringify({ content: [{ type: 'text', text: 'Anthropic: MAINNET LIVE' }] }));
          }
          return;
        }

        if (url.includes(':generateContent')) {
          turnCounts.gemini += 1;
          // Verify Gemini schema has zero empty `properties: {}` objects!
          const tools = parsed.tools as Array<{ functionDeclarations: Array<{ parameters?: { properties?: Record<string, unknown> } }> }>;
          for (const fd of tools[0].functionDeclarations) {
            if (fd.parameters) {
              expect(Object.keys(fd.parameters.properties ?? {}).length).toBeGreaterThan(0);
            }
          }
          if (turnCounts.gemini === 1) {
            res.end(
              JSON.stringify({
                candidates: [
                  { content: { parts: [{ functionCall: { name: 'xrpl_get_network_status', args: {} } }] } },
                ],
              })
            );
          } else {
            res.end(
              JSON.stringify({
                candidates: [{ content: { parts: [{ text: 'Gemini: MAINNET LIVE' }] } }],
              })
            );
          }
          return;
        }

        res.end('{}');
      });
    });

    await new Promise<void>((resolve) => mockLlmServer.listen(0, '127.0.0.1', resolve));
    const addr = mockLlmServer.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const mcp = new McpAgentService({
      storageDir: tmpDir,
      appVersion: '0.3.0-beta',
      streamManager: {
        getStatus: () => ({
          connected: true,
          connecting: false,
          networkId: 'mainnet',
          endpoint: 'wss://xrplcluster.com/',
          latencyMs: 20,
          serverLoadFactor: 1,
          consensusPhase: 'accepted',
        }),
        request: async () => ({ result: {} }),
      },
      directoryService: {
        fetchMarketPrices: async () => ({ xrpUsd: 2.5, change24hPct: 2, source: 'mock', fetchedAt: Date.now() }),
        fetchMarketOhlc: async () => ({
          pairLabel: 'XRP / USD',
          quoteSymbol: 'USD',
          timeframe: '1h',
          source: 'mock',
          fetchedAt: Date.now(),
          candles: [],
        }),
        inspectQuery: async () => ({ kind: 'account', query: RIP_ISSUER, title: RIP_ISSUER, summary: [], raw: {} }),
        inspectTokenOnLedger: async () => {
          throw new Error('unused');
        },
        searchTokens: async () => ({ tokens: [], source: 'mock', fetchedAt: Date.now() }),
      },
      nodeOpsService: {
        pollNode: async () => ({
          connected: false,
          endpoint: 'http://127.0.0.1:5005',
          checkedAt: Date.now(),
          peers: [],
          amendments: [],
          adminAvailable: false,
        }),
      },
      dockerService: {
        getStatus: async () => ({
          dockerInstalled: false,
          daemonRunning: false,
          containerExists: false,
          containerRunning: false,
          containerName: 'xrpl-cc',
          storageRoot: tmpDir,
          configDir: tmpDir,
          dataDir: tmpDir,
        }),
        lifecycleAction: async () => ({ ok: true, message: 'ok' }),
        readLogs: async () => ({ ok: true, lines: [] }),
      },
      walletVault: {
        getStatus: async () => ({ initialized: false, unlocked: false, osKeychainAvailable: false, accounts: [] }),
        fetchPortfolio: async () => {
          throw new Error('unused');
        },
      },
      getRecentLedgers: () => [],
      getLastNodeConfig: () => ({ label: 'Local', rpcUrl: 'http://127.0.0.1:5005' }),
      emitStatus: () => undefined,
      emitRendererAction: () => undefined,
    });

    try {
      await mcp.updateProvider({ provider: 'ollama', endpointUrl: baseUrl, model: 'llama3.1:8b' });
      const ollamaOut = await mcp.runAgentChat('check status');
      expect(ollamaOut.ok).toBe(true);
      expect(ollamaOut.reply.content).toContain('Ollama: MAINNET LIVE');
      expect(ollamaOut.reply.toolCalls?.[0].name).toBe('xrpl_get_network_status');

      await mcp.updateProvider({ provider: 'openai', endpointUrl: baseUrl, model: 'gpt-4o-mini', apiKey: 'sk-test' });
      const openaiOut = await mcp.runAgentChat('check status');
      expect(openaiOut.ok).toBe(true);
      expect(openaiOut.reply.content).toContain('OpenAI: MAINNET LIVE');
      expect(openaiOut.reply.toolCalls?.[0].name).toBe('xrpl_get_network_status');

      await mcp.updateProvider({ provider: 'anthropic', endpointUrl: baseUrl, model: 'claude-3-5-sonnet-latest', apiKey: 'ak-test' });
      const anthropicOut = await mcp.runAgentChat('check status');
      expect(anthropicOut.ok).toBe(true);
      expect(anthropicOut.reply.content).toContain('Anthropic: MAINNET LIVE');
      expect(anthropicOut.reply.toolCalls?.[0].name).toBe('xrpl_get_network_status');

      await mcp.updateProvider({ provider: 'gemini', endpointUrl: baseUrl, model: 'gemini-2.5-flash', apiKey: 'gk-test' });
      const geminiOut = await mcp.runAgentChat('check status');
      expect(geminiOut.ok).toBe(true);
      expect(geminiOut.reply.content).toContain('Gemini: MAINNET LIVE');
      expect(geminiOut.reply.toolCalls?.[0].name).toBe('xrpl_get_network_status');
    } finally {
      await mcp.shutdown();
      await new Promise<void>((resolve) => mockLlmServer.close(() => resolve()));
    }
  });
});
