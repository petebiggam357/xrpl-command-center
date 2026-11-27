import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plug,
  Power,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import {
  AGENT_PROVIDER_PRESETS,
  buildMcpClientConfigJson,
  buildMcpCurlTestSnippet,
  MCP_TOOLS_CATALOG,
  validateMcpPort,
  type AgentChatMessage,
  type AgentProviderId,
} from '../shared/mcpAgentUtils';
import { useCommandStore } from '../store/useCommandStore';

type DrawerTab = 'copilot' | 'mcp' | 'model-audit';

const QUICK_PROMPTS = [
  'Network status',
  'Search token RIP',
  'Check my node',
  'My portfolio',
  'Latest ledgers',
  'Go to 3D Globe',
];

export const AgentMcpDrawer: React.FC = () => {
  const open = useCommandStore((s) => s.agentDrawerOpen);
  const setOpen = useCommandStore((s) => s.setAgentDrawerOpen);
  const mcpStatus = useCommandStore((s) => s.mcpStatus);
  const ingestMcpStatus = useCommandStore((s) => s.ingestMcpStatus);
  const refreshMcpStatus = useCommandStore((s) => s.refreshMcpStatus);
  const vaultStatus = useCommandStore((s) => s.vaultStatus);

  const [tab, setTab] = useState<DrawerTab>('copilot');
  const [messages, setMessages] = useState<AgentChatMessage[]>([
    {
      role: 'assistant',
      content:
        'XRPL Agent & MCP Hub ready. Ask about live ledgers, search any token (e.g., "search token RIP"), inspect an r-address, check your Docker node, or control Command Center tabs. Transactions only open the Signing Modal — I never sign autonomously.',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // MCP Server UI state
  const [portInput, setPortInput] = useState('18490');
  const [showToken, setShowToken] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showToolsList, setShowToolsList] = useState(false);
  const [busyConfig, setBusyConfig] = useState(false);

  // Provider config UI state
  const [providerId, setProviderId] = useState<AgentProviderId>('local-rules');
  const [endpointInput, setEndpointInput] = useState(AGENT_PROVIDER_PRESETS['local-rules'].defaultEndpoint);
  const [modelInput, setModelInput] = useState(AGENT_PROVIDER_PRESETS['local-rules'].defaultModel);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [providerSavedMsg, setProviderSavedMsg] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      void refreshMcpStatus();
    }
  }, [open, refreshMcpStatus]);

  const syncedPort = mcpStatus?.port;
  const syncedProvider = mcpStatus?.providerConfig.provider;
  const syncedEndpoint = mcpStatus?.providerConfig.endpointUrl;
  const syncedModel = mcpStatus?.providerConfig.model;

  useEffect(() => {
    if (typeof syncedPort === 'number') {
      setPortInput(String(syncedPort));
    }
  }, [syncedPort]);

  useEffect(() => {
    if (syncedProvider) setProviderId(syncedProvider);
    if (syncedEndpoint) setEndpointInput(syncedEndpoint);
    if (syncedModel) setModelInput(syncedModel);
  }, [syncedProvider, syncedEndpoint, syncedModel]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  if (!open) return null;

  const copyText = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
  };

  const handleSend = async (promptOverride?: string) => {
    const text = (promptOverride ?? input).trim();
    if (!text || sending) return;
    const userMsg: AgentChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!promptOverride) setInput('');
    setSending(true);
    try {
      const compactHistory = nextHistory.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const res = await getXrplBridge().agentSendMessage(text, compactHistory.slice(0, -1));
      setMessages((prev) => [...prev, res.reply]);
      void refreshMcpStatus();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Unable to reach Agent Copilot.'}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const updateMcp = async (patch: {
    enabled?: boolean;
    port?: number;
    allowAutomation?: boolean;
    allowTxDrafting?: boolean;
  }) => {
    setBusyConfig(true);
    try {
      const st = await getXrplBridge().mcpUpdateConfig(patch);
      ingestMcpStatus(st);
    } finally {
      setBusyConfig(false);
    }
  };

  const handleRotateToken = async () => {
    setBusyConfig(true);
    try {
      const st = await getXrplBridge().mcpRotateToken();
      ingestMcpStatus(st);
    } finally {
      setBusyConfig(false);
    }
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setProviderSavedMsg(null);
    const st = await getXrplBridge().mcpUpdateProvider({
      provider: providerId,
      endpointUrl: endpointInput,
      model: modelInput,
      ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
    });
    ingestMcpStatus(st);
    setApiKeyInput('');
    setProviderSavedMsg(`Saved ${AGENT_PROVIDER_PRESETS[providerId].label}`);
    setTimeout(() => setProviderSavedMsg(null), 2500);
  };

  const handleClearApiKey = async () => {
    const st = await getXrplBridge().mcpUpdateProvider({ apiKey: null });
    ingestMcpStatus(st);
    setApiKeyInput('');
    setProviderSavedMsg('Stored API key removed.');
    setTimeout(() => setProviderSavedMsg(null), 2500);
  };

  const clientConfigJson = mcpStatus
    ? buildMcpClientConfigJson(mcpStatus.endpointUrl, mcpStatus.bearerToken)
    : '';
  const curlSnippet = mcpStatus
    ? buildMcpCurlTestSnippet(mcpStatus.endpointUrl, mcpStatus.bearerToken)
    : '';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-[2px]">
      <div
        className="flex-1"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside className="w-[480px] max-w-[95vw] h-full bg-panel border-l border-cyan-500/35 shadow-2xl flex flex-col">
        {/* Drawer Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/90">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/25 to-violet-500/25 border border-cyan-400/45 flex items-center justify-center">
              <Bot className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-white">
                  Agent &amp; MCP Hub
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                    mcpStatus?.running
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      mcpStatus?.running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                    }`}
                  />
                  {mcpStatus?.running ? `MCP :${mcpStatus.port}` : 'MCP OFF'}
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 truncate">
                Local-only MCP server + XRPL Command Copilot • Human-in-the-Loop Safe
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Agent & MCP Hub"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950/70 p-1.5 gap-1 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => setTab('copilot')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg border transition-colors ${
              tab === 'copilot'
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Copilot Chat
          </button>
          <button
            type="button"
            onClick={() => setTab('mcp')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg border transition-colors ${
              tab === 'mcp'
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plug className="w-3.5 h-3.5" />
            MCP Server
          </button>
          <button
            type="button"
            onClick={() => setTab('model-audit')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg border transition-colors ${
              tab === 'model-audit'
                ? 'bg-violet-500/20 border-violet-400/50 text-violet-200 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Model &amp; Audit
          </button>
        </div>

        {/* Tab 1: In-App Agent Copilot Chat */}
        {tab === 'copilot' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Active Provider & Vault Guard Strip */}
            <div className="px-3.5 py-2 border-b border-slate-800/80 bg-slate-950/50 flex items-center justify-between gap-2 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setTab('model-audit')}
                className="text-cyan-300 hover:text-cyan-200 truncate"
                title="Change AI provider or model"
              >
                Engine: <strong>{AGENT_PROVIDER_PRESETS[mcpStatus?.providerConfig.provider ?? 'local-rules'].label}</strong>
              </button>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border shrink-0 ${
                  vaultStatus.unlocked
                    ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-400/30 text-amber-200'
                }`}
              >
                <Lock className="w-2.5 h-2.5" />
                {vaultStatus.unlocked ? 'Vault Open' : 'Vault Locked'}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
              {messages.map((m, idx) => (
                <div
                  key={`${m.timestamp}-${idx}`}
                  className={`rounded-xl p-3 text-xs border ${
                    m.role === 'user'
                      ? 'ml-8 bg-cyan-500/15 border-cyan-400/35 text-slate-100'
                      : 'mr-4 bg-slate-950/85 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                    <span className={m.role === 'user' ? 'text-cyan-300' : 'text-emerald-300'}>
                      {m.role === 'user' ? 'YOU' : 'XRPL COPILOT'}
                    </span>
                    <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                  </div>

                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {m.toolCalls.map((tc, tIdx) => (
                        <span
                          key={`${tc.name}-${tIdx}`}
                          title={tc.summary}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                            tc.ok
                              ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                              : 'bg-rose-500/15 border-rose-400/35 text-rose-200'
                          }`}
                        >
                          {tc.ok ? (
                            <CheckCircle2 className="w-2.5 h-2.5" />
                          ) : (
                            <XCircle className="w-2.5 h-2.5" />
                          )}
                          {tc.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="whitespace-pre-wrap break-words leading-relaxed font-sans text-[12px]">
                    {m.content}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="mr-4 rounded-xl p-3 bg-slate-950/85 border border-cyan-500/30 text-xs font-mono text-cyan-300 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Executing XRPL MCP tools…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick Prompt Chips */}
            <div className="px-3.5 py-2 border-t border-slate-800/80 bg-slate-950/60 flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp}
                  type="button"
                  disabled={sending}
                  onClick={() => void handleSend(qp)}
                  className="px-2 py-1 rounded-md bg-slate-900 border border-slate-700/90 hover:border-cyan-400/50 text-[10px] font-mono text-slate-300 hover:text-cyan-200 transition-colors"
                >
                  {qp}
                </button>
              ))}
            </div>

            {/* Prompt Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="p-3 border-t border-slate-800 bg-slate-950/90 flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder='Ask anything (e.g. "search token RIP", "alert xrp above 3.5")…'
                className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="px-3 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40 flex items-center gap-1 text-xs font-mono"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Local MCP Server & External Client Integration */}
        {tab === 'mcp' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* Master Server Card */}
            <div className="rounded-xl p-3.5 bg-slate-950/85 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-mono uppercase text-cyan-300 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5" />
                    Loopback MCP Server (127.0.0.1 Only)
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {mcpStatus?.endpointUrl ?? 'http://127.0.0.1:18490/mcp'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyConfig}
                  onClick={() => void updateMcp({ enabled: !mcpStatus?.running })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs font-semibold transition-colors ${
                    mcpStatus?.running
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 hover:bg-rose-500/20 hover:border-rose-400/50 hover:text-rose-200'
                      : 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/30'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {mcpStatus?.running ? 'Stop Server' : 'Start MCP Server'}
                </button>
              </div>

              {mcpStatus?.error && (
                <div className="px-2.5 py-2 rounded-lg bg-rose-500/15 border border-rose-400/40 text-rose-200 font-mono text-[11px]">
                  {mcpStatus.error}
                </div>
              )}

              {/* Port Selector */}
              <div className="flex items-center gap-2 pt-1">
                <label className="text-[11px] font-mono text-slate-400">Loopback Port:</label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={portInput}
                  onChange={(e) => setPortInput(e.target.value)}
                  className="w-24 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 font-mono text-xs text-white"
                />
                <button
                  type="button"
                  disabled={busyConfig}
                  onClick={() => {
                    const safePort = validateMcpPort(Number(portInput));
                    setPortInput(String(safePort));
                    void updateMcp({ port: safePort });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400/50 font-mono text-[11px] text-slate-200"
                >
                  Apply Port
                </button>
              </div>
            </div>

            {/* 3-Tier Permission Gates */}
            <div className="rounded-xl p-3.5 bg-slate-950/85 border border-slate-800 space-y-2.5">
              <div className="text-[11px] font-mono uppercase text-cyan-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Zero-Trust Permission Tiers
              </div>

              <div className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-slate-900/70 border border-slate-800">
                <div>
                  <div className="font-mono text-[11px] font-semibold text-emerald-300">
                    Tier 1 • Read-Only Telemetry &amp; RPC (8 tools)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Allowlisted read RPCs, full token search, market indicators, node health. Portfolio strictly respects Vault Lock.
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/35 text-[10px] font-mono text-emerald-300 shrink-0">
                  ACTIVE
                </span>
              </div>

              <label className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 cursor-pointer">
                <div>
                  <div className="font-mono text-[11px] font-semibold text-cyan-300">
                    Tier 2 • Cockpit UI &amp; Node Automation (5 tools)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Switch tabs, focus token charts, add price alerts / watchlists, and start/stop/restart Docker node.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(mcpStatus?.allowAutomation)}
                  onChange={(e) => void updateMcp({ allowAutomation: e.target.checked })}
                  className="mt-1 accent-cyan-400 w-4 h-4 shrink-0"
                />
              </label>

              <label className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-slate-900/70 border border-amber-500/25 cursor-pointer">
                <div>
                  <div className="font-mono text-[11px] font-semibold text-amber-200 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-amber-400" />
                    Tier 3 • Human-in-the-Loop Tx Drafting (1 tool)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Opens the native Signing Modal for Payment/TrustSet drafts. Agents can NEVER sign or broadcast autonomously.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(mcpStatus?.allowTxDrafting)}
                  onChange={(e) => void updateMcp({ allowTxDrafting: e.target.checked })}
                  className="mt-1 accent-amber-400 w-4 h-4 shrink-0"
                />
              </label>
            </div>

            {/* Bearer Auth & External Client Config */}
            <div className="rounded-xl p-3.5 bg-slate-950/85 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-cyan-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  256-Bit Bearer Token
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
                    title={showToken ? 'Hide token' : 'Reveal token'}
                  >
                    {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText('token', mcpStatus?.bearerToken ?? '')}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-200 hover:border-cyan-400/50 inline-flex items-center gap-1"
                  >
                    {copiedId === 'token' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    Copy
                  </button>
                  <button
                    type="button"
                    disabled={busyConfig}
                    onClick={() => void handleRotateToken()}
                    className="px-2 py-1 rounded bg-amber-500/15 border border-amber-400/40 text-[10px] font-mono text-amber-200 hover:bg-amber-500/25"
                  >
                    Rotate
                  </button>
                </div>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 break-all">
                {showToken
                  ? mcpStatus?.bearerToken || '—'
                  : mcpStatus?.bearerToken
                    ? `${mcpStatus.bearerToken.slice(0, 8)}••••••••••••••••••••••••••••••••${mcpStatus.bearerToken.slice(-6)}`
                    : '—'}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-slate-400">
                    Claude Desktop / Cursor / Antigravity MCP Config
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('json', clientConfigJson)}
                    className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/40 text-[10px] font-mono text-cyan-200 hover:bg-cyan-500/25 inline-flex items-center gap-1"
                  >
                    {copiedId === 'json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    Copy JSON
                  </button>
                </div>
                <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[10px] text-cyan-200/90 overflow-x-auto">
                  {showToken
                    ? clientConfigJson
                    : buildMcpClientConfigJson(mcpStatus?.endpointUrl ?? 'http://127.0.0.1:18490/mcp', '<YOUR_BEARER_TOKEN>')}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] font-mono text-slate-400 inline-flex items-center gap-1">
                  <Terminal className="w-3 h-3 text-emerald-400" />
                  Quick Terminal Smoke Test
                </span>
                <button
                  type="button"
                  onClick={() => copyText('curl', curlSnippet)}
                  className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-200 hover:border-emerald-400/50 inline-flex items-center gap-1"
                >
                  {copiedId === 'curl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  Copy curl
                </button>
              </div>
            </div>

            {/* Collapsible MCP Tool Catalog */}
            <div className="rounded-xl p-3.5 bg-slate-950/85 border border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => setShowToolsList((v) => !v)}
                className="w-full flex items-center justify-between text-[11px] font-mono uppercase text-cyan-300"
              >
                <span>Exposed MCP Tools ({MCP_TOOLS_CATALOG.length})</span>
                <span className="text-[10px] text-slate-400">{showToolsList ? 'Hide ▲' : 'Show ▼'}</span>
              </button>
              {showToolsList && (
                <div className="space-y-1.5 pt-1 max-h-60 overflow-y-auto">
                  {MCP_TOOLS_CATALOG.map((tool) => (
                    <div
                      key={tool.name}
                      className="p-2 rounded-lg bg-slate-900/70 border border-slate-800 space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-semibold text-white">{tool.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase ${
                            tool.tier === 'read'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : tool.tier === 'automation'
                                ? 'bg-cyan-500/15 text-cyan-300'
                                : 'bg-amber-500/15 text-amber-200'
                          }`}
                        >
                          {tool.tier}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">{tool.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: AI Provider Configuration & Live Tool Audit Log */}
        {tab === 'model-audit' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            <form
              onSubmit={(e) => void handleSaveProvider(e)}
              className="rounded-xl p-3.5 bg-slate-950/85 border border-slate-800 space-y-3"
            >
              <div className="text-[11px] font-mono uppercase text-violet-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                In-App Copilot Engine (BYO Local or Cloud LLM)
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase">Provider</label>
                <select
                  value={providerId}
                  onChange={(e) => {
                    const next = e.target.value as AgentProviderId;
                    setProviderId(next);
                    setEndpointInput(AGENT_PROVIDER_PRESETS[next].defaultEndpoint);
                    setModelInput(AGENT_PROVIDER_PRESETS[next].defaultModel);
                  }}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                >
                  {(Object.keys(AGENT_PROVIDER_PRESETS) as AgentProviderId[]).map((id) => (
                    <option key={id} value={id}>
                      {AGENT_PROVIDER_PRESETS[id].label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400">{AGENT_PROVIDER_PRESETS[providerId].description}</p>
              </div>

              {providerId !== 'local-rules' && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 uppercase">Endpoint URL</label>
                    <input
                      type="text"
                      value={endpointInput}
                      onChange={(e) => setEndpointInput(e.target.value)}
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 uppercase">Model ID</label>
                    <input
                      type="text"
                      value={modelInput}
                      onChange={(e) => setModelInput(e.target.value)}
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                    />
                  </div>
                </>
              )}

              {AGENT_PROVIDER_PRESETS[providerId].requiresApiKey && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono text-slate-400 uppercase">
                      API Key (Encrypted via OS Keyring)
                    </label>
                    {mcpStatus?.providerConfig.hasApiKey && (
                      <button
                        type="button"
                        onClick={() => void handleClearApiKey()}
                        className="text-[10px] font-mono text-rose-300 hover:text-rose-200"
                      >
                        Clear Saved Key
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      mcpStatus?.providerConfig.hasApiKey
                        ? 'Saved securely (enter new key to replace)…'
                        : 'Paste provider API key…'
                    }
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] font-mono text-emerald-300">{providerSavedMsg ?? ''}</span>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-400/50 text-xs font-mono text-violet-200 hover:bg-violet-500/30"
                >
                  Save Engine Settings
                </button>
              </div>
            </form>

            {/* Live Audit Log */}
            <div className="rounded-xl p-3.5 bg-slate-950/85 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-cyan-300">
                  Live Tool Audit Log ({mcpStatus?.auditLog.length ?? 0})
                </span>
                {(mcpStatus?.auditLog.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => void getXrplBridge().mcpClearAuditLog().then(ingestMcpStatus)}
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-rose-300"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>

              {!mcpStatus?.auditLog.length ? (
                <div className="py-6 text-center font-mono text-[11px] text-slate-500">
                  No MCP or Copilot tool calls recorded yet.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {mcpStatus.auditLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-2 rounded-lg bg-slate-900/75 border border-slate-800 font-mono text-[10px] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={entry.ok ? 'text-emerald-400' : 'text-rose-400'}>
                            {entry.ok ? '●' : '✕'}
                          </span>
                          <span className="text-white font-semibold truncate">{entry.toolName}</span>
                          <span className="px-1 rounded bg-slate-800 text-slate-400 uppercase text-[9px]">
                            {entry.source === 'mcp-http' ? 'MCP' : 'COPILOT'}
                          </span>
                        </div>
                        <span className="text-slate-500 shrink-0 tabular-nums">
                          {entry.durationMs}ms • {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-slate-400 break-words">{entry.summary}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};
