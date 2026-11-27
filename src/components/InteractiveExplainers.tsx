import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  Landmark,
  Pause,
  Play,
  RotateCcw,
  Server,
  ShieldCheck,
} from 'lucide-react';

type ExplainerSceneId = 'consensus' | 'fees' | 'clob-amm' | 'vault-lending' | 'docker-node';

interface ExplainerMeta {
  id: ExplainerSceneId;
  title: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
  keyPoints: string[];
}

export const INTERACTIVE_EXPLAINERS: ExplainerMeta[] = [
  {
    id: 'consensus',
    title: 'Consensus & 80% UNL Quorum',
    badge: '~3.5s Finality',
    icon: ShieldCheck,
    summary:
      'Watch how independent XRPL UNL validators exchange transaction sets and converge to an 80% supermajority in ~3.5 seconds with zero Proof-of-Work mining.',
    keyPoints: [
      'OPEN: Transactions enter the open ledger and propagate across P2P nodes.',
      'ESTABLISH: Validators compare candidate transaction sets over 2–3 fast rounds.',
      '80% QUORUM → VALIDATED: Once ≥80% of trusted UNL validators sign the identical ledger hash, the block is irreversibly final.',
    ],
  },
  {
    id: 'fees',
    title: 'Fee Escalation & Open-Ledger Queue',
    badge: 'Spam Defense',
    icon: Activity,
    summary:
      'Drag the Load Multiplier slider (or click "Try 945x Spike") to watch how XRPL protects the network from spam via dynamic open-ledger fee auctions—while still keeping costs under 2¢.',
    keyPoints: [
      'Normal base fee is 10 drops (0.00001 XRP). Every drop paid is permanently burned.',
      'When transactions exceed the expected ledger size, overflow queues up and the open-ledger fee escalates automatically.',
      'Even a 945x spike (9,450 drops = 0.00945 XRP) costs less than 2 cents and drops back to 10d once traffic clears.',
    ],
  },
  {
    id: 'clob-amm',
    title: 'CLOB DEX + XLS-30 AMM Auto-Bridging',
    badge: 'Hybrid Liquidity',
    icon: ArrowLeftRight,
    summary:
      'See how XRPL natively splits a single swap across both the Central Limit Order Book (CLOB) and the XLS-30 Constant-Product AMM (x·y=k) to deliver the best execution price.',
    keyPoints: [
      'XRPL evaluates both CLOB limit offers and AMM pool quotes simultaneously inside consensus.',
      'Whichever venue offers the better marginal rate gets filled first—eliminating fragmented liquidity.',
      'No smart-contract approvals, no MEV sandwich bots, and atomic all-or-nothing settlement.',
    ],
  },
  {
    id: 'vault-lending',
    title: 'XLS-65 Vaults & XLS-66 First-Loss Cover',
    badge: 'Native Credit',
    icon: Landmark,
    summary:
      'Trigger a Borrower Default Shock to watch the XLS-66 Loss Waterfall slash the Loan Broker’s First-Loss Cover shield before regular XLS-65 Vault depositors lose any principal.',
    keyPoints: [
      'Depositors supply one asset (e.g. RLUSD or XRP) into an XLS-65 Single Asset Vault and receive XLS-33 MPT Vault Shares.',
      'Loan Brokers underwrite fixed-term loans and post on-ledger First-Loss Cover with skin in the game.',
      'If a borrower defaults, the protocol automatically absorbs losses from Broker Cover first.',
    ],
  },
  {
    id: 'docker-node',
    title: 'Local Docker Node Sync & Stock Mode',
    badge: 'Trustless Telemetry',
    icon: Server,
    summary:
      'See why a local stock node downloads only ~18–25 GB (one current state snapshot) instead of multi-TB history, verifies both dUNLs, and streams trustless local data to Command Center.',
    keyPoints: [
      'Stock Mode (pubkey_validator: none) independently verifies every ledger without needing a 24/7 validator signing key.',
      'Both dUNL manifests (vl.xrplf.org + vl.ripple.com) must verify active so validation_quorum drops to 28.',
      'online_delete=2000 automatically prunes old ledgers so your SSD stays lean while serving 1ms local WS/RPC.',
    ],
  },
];

export const InteractiveExplainers: React.FC = () => {
  const [scene, setScene] = useState<ExplainerSceneId>('consensus');
  const [playing, setPlaying] = useState(true);
  const [feeLoadMultiplier, setFeeLoadMultiplier] = useState(1);
  const [defaultShockTriggered, setDefaultShockTriggered] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simTimeRef = useRef(0);

  const activeMeta = INTERACTIVE_EXPLAINERS.find((e) => e.id === scene) ?? INTERACTIVE_EXPLAINERS[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTs = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      if (playing) {
        simTimeRef.current += dt;
      }
      const t = simTimeRef.current;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 760;
      const h = canvas.clientHeight || 340;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.save();
      ctx.scale(dpr, dpr);

      // Cyber HUD Backdrop
      ctx.fillStyle = '#060c18';
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.06)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 36) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += 36) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      if (scene === 'consensus') {
        const cycle = (t % 7) / 7; // 7s visual cycle
        const phase =
          cycle < 0.3 ? 'OPEN' : cycle < 0.7 ? 'ESTABLISH' : cycle < 0.88 ? '80% QUORUM' : 'VALIDATED';
        const cx = w * 0.5;
        const cy = h * 0.52;
        const radius = Math.min(w, h) * 0.34;
        const nodes = 10;

        // Ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = phase === 'VALIDATED' ? 'rgba(52, 211, 153, 0.5)' : 'rgba(34, 211, 238, 0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Validator gossip pulses
        for (let i = 0; i < nodes; i++) {
          const a1 = (i / nodes) * Math.PI * 2 - Math.PI / 2;
          const x1 = cx + Math.cos(a1) * radius;
          const y1 = cy + Math.sin(a1) * radius;
          const agreed =
            phase === 'VALIDATED'
              ? true
              : phase === '80% QUORUM'
                ? i < 9
                : phase === 'ESTABLISH'
                  ? i < Math.floor(((cycle - 0.3) / 0.4) * 8) + 1
                  : false;

          // Pulse traveling to center during establish/quorum
          if (phase === 'ESTABLISH' || phase === '80% QUORUM') {
            const p = (t * 1.4 + i * 0.17) % 1;
            const px = x1 + (cx - x1) * p;
            const py = y1 + (cy - y1) * p;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = agreed ? '#34d399' : '#22d3ee';
            ctx.fill();
          }

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(cx, cy);
          ctx.strokeStyle = agreed ? 'rgba(52, 211, 153, 0.28)' : 'rgba(148, 163, 184, 0.14)';
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x1, y1, 10, 0, Math.PI * 2);
          ctx.fillStyle = agreed ? '#064e3b' : '#0f172a';
          ctx.fill();
          ctx.strokeStyle = agreed ? '#34d399' : '#38bdf8';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#e2e8f0';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`V${i + 1}`, x1, y1 + 3.5);
        }

        // Center Ledger Block
        const pulseR = phase === 'VALIDATED' ? 42 + Math.sin(t * 10) * 3 : 38;
        ctx.beginPath();
        ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = phase === 'VALIDATED' ? 'rgba(16, 185, 129, 0.22)' : 'rgba(8, 47, 73, 0.85)';
        ctx.fill();
        ctx.strokeStyle = phase === 'VALIDATED' ? '#34d399' : '#22d3ee';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = phase === 'VALIDATED' ? '#6ee7b7' : '#67e8f9';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(phase, cx, cy - 2);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(phase === 'VALIDATED' ? 'FINAL (0 PoW)' : 'UNL Consensus', cx, cy + 14);
      } else if (scene === 'fees') {
        const effDrops = Math.round(10 * feeLoadMultiplier);
        const effXrp = (effDrops / 1_000_000).toFixed(6);
        const isHigh = feeLoadMultiplier >= 50;
        const isBusy = feeLoadMultiplier >= 5 && feeLoadMultiplier < 50;

        // Open Ledger Box vs Overflow Queue Box
        const leftX = 48;
        const midX = w * 0.44;
        const rightX = w * 0.72;
        const boxY = 85;
        const boxH = 175;

        // Draw Open Ledger bucket
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = isHigh ? '#fb7185' : isBusy ? '#fbbf24' : '#22d3ee';
        ctx.lineWidth = 2;
        ctx.fillRect(midX, boxY, 150, boxH);
        ctx.strokeRect(midX, boxY, 150, boxH);

        const fillRatio = Math.min(1, 0.25 + Math.log10(Math.max(1, feeLoadMultiplier)) / 3.2);
        const fillH = boxH * fillRatio;
        ctx.fillStyle = isHigh
          ? 'rgba(244, 63, 94, 0.28)'
          : isBusy
            ? 'rgba(245, 158, 11, 0.25)'
            : 'rgba(34, 211, 238, 0.22)';
        ctx.fillRect(midX + 2, boxY + boxH - fillH, 146, fillH - 2);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('OPEN LEDGER', midX + 75, boxY - 12);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(`${Math.round(fillRatio * 100)}% full`, midX + 75, boxY + boxH + 18);

        // Escalation Queue box
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.fillRect(rightX, boxY, 155, boxH);
        ctx.strokeRect(rightX, boxY, 155, boxH);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('FEE BURN & QUEUE', rightX + 77, boxY - 12);

        ctx.fillStyle = isHigh ? '#fda4af' : '#67e8f9';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`${effDrops.toLocaleString()}d`, rightX + 77, boxY + 62);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px monospace';
        ctx.fillText(`${effXrp} XRP`, rightX + 77, boxY + 84);
        ctx.fillStyle = '#34d399';
        ctx.font = '10px monospace';
        ctx.fillText(`${feeLoadMultiplier}x base fee`, rightX + 77, boxY + 112);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('100% Burned Forever', rightX + 77, boxY + 140);

        // Animated incoming tx particles
        const count = Math.min(28, 6 + Math.floor(Math.log2(feeLoadMultiplier + 1) * 3));
        for (let i = 0; i < count; i++) {
          const p = (t * (0.45 + (i % 4) * 0.12) + i * 0.19) % 1;
          const x = leftX + p * (midX - leftX + 20);
          const y = boxY + 20 + ((i * 29) % (boxH - 40));
          ctx.beginPath();
          ctx.arc(x, y, i % 5 === 0 ? 4.5 : 3, 0, Math.PI * 2);
          ctx.fillStyle = i % 5 === 0 && isHigh ? '#fb7185' : '#22d3ee';
          ctx.fill();
        }
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Incoming Tx Stream →', leftX, boxY - 12);
      } else if (scene === 'clob-amm') {
        const srcX = 90;
        const midX = w * 0.5;
        const dstX = w - 95;
        const topY = 95;
        const botY = 245;
        const midY = (topY + botY) / 2;

        // Paths
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(srcX, midY);
        ctx.quadraticCurveTo(midX * 0.6, topY, midX, topY);
        ctx.quadraticCurveTo(midX * 1.4, topY, dstX, midY);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(167, 139, 250, 0.45)';
        ctx.beginPath();
        ctx.moveTo(srcX, midY);
        ctx.quadraticCurveTo(midX * 0.6, botY, midX, botY);
        ctx.quadraticCurveTo(midX * 1.4, botY, dstX, midY);
        ctx.stroke();

        // Moving swap particles along both venues
        for (let i = 0; i < 8; i++) {
          const p = (t * 0.45 + i * 0.125) % 1;
          const isTop = i % 2 === 0;
          const yPeak = isTop ? topY : botY;
          const x = srcX + (dstX - srcX) * p;
          const y = midY + Math.sin(p * Math.PI) * (yPeak - midY);
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = isTop ? '#22d3ee' : '#a78bfa';
          ctx.fill();
        }

        // Venue boxes
        const drawBox = (x: number, y: number, title: string, sub: string, border: string) => {
          ctx.fillStyle = '#0b1325';
          ctx.strokeStyle = border;
          ctx.lineWidth = 2;
          ctx.fillRect(x - 82, y - 28, 164, 56);
          ctx.strokeRect(x - 82, y - 28, 164, 56);
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(title, x, y - 4);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '10px monospace';
          ctx.fillText(sub, x, y + 14);
        };

        drawBox(srcX, midY, 'USER SWAP', 'e.g. 5,000 XRP', '#38bdf8');
        drawBox(midX, topY, 'CLOB ORDERBOOK', 'Best Limit Bids/Asks', '#22d3ee');
        drawBox(midX, botY, 'XLS-30 AMM POOL', 'x · y = k Curve', '#a78bfa');
        drawBox(dstX, midY, 'BEST FILL', 'Atomic Settlement', '#34d399');
      } else if (scene === 'vault-lending') {
        const y = h * 0.5;
        const xs = [w * 0.14, w * 0.39, w * 0.65, w * 0.87];

        // Connecting lines
        ctx.strokeStyle = defaultShockTriggered ? 'rgba(244, 63, 94, 0.55)' : 'rgba(52, 211, 153, 0.45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xs[0] + 62, y);
        ctx.lineTo(xs[3] - 62, y);
        ctx.stroke();

        // Moving liquidity / shock pulses
        for (let i = 0; i < 6; i++) {
          const p = (t * 0.5 + i * 0.16) % 1;
          const x = defaultShockTriggered
            ? xs[3] - 60 - p * (xs[3] - xs[2]) // shock slams into Broker Cover!
            : xs[0] + 60 + p * (xs[3] - xs[0] - 120);
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = defaultShockTriggered ? '#fb7185' : '#34d399';
          ctx.fill();
        }

        const drawNode = (cx: number, title: string, sub: string, border: string, accent: string) => {
          ctx.fillStyle = '#0b1325';
          ctx.strokeStyle = border;
          ctx.lineWidth = 2;
          ctx.fillRect(cx - 66, y - 42, 132, 84);
          ctx.strokeRect(cx - 66, y - 42, 132, 84);
          ctx.fillStyle = accent;
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(title, cx, y - 10);
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '10px monospace';
          ctx.fillText(sub, cx, y + 12);
        };

        drawNode(xs[0], 'DEPOSITORS', defaultShockTriggered ? 'Principal SAFE!' : 'XRP / RLUSD', '#34d399', '#6ee7b7');
        drawNode(xs[1], 'XLS-65 VAULT', 'MPT Vault Shares', '#22d3ee', '#67e8f9');
        drawNode(
          xs[2],
          'XLS-66 BROKER',
          defaultShockTriggered ? 'FIRST-LOSS ABSORBS!' : 'First-Loss Shield',
          defaultShockTriggered ? '#fb7185' : '#fbbf24',
          defaultShockTriggered ? '#fda4af' : '#fde68a'
        );
        drawNode(xs[3], 'BORROWERS', defaultShockTriggered ? 'DEFAULT SHOCK' : 'Fixed-Term Loan', '#a78bfa', '#ddd6fe');

        // Banner status
        ctx.fillStyle = defaultShockTriggered ? '#fda4af' : '#6ee7b7';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          defaultShockTriggered
            ? 'WATERFALL ACTIVE: Loan Broker First-Loss Cover absorbs default BEFORE depositors lose a drop!'
            : 'STEADY STATE: Borrower interest flows back to XLS-65 Vault Shares (~3.5s L1 settlement)',
          w * 0.5,
          44
        );
      } else if (scene === 'docker-node') {
        const stageProgress = (t * 0.25) % 4;
        const stages = ['1. Peer Mesh (10+)', '2. Active dUNL (2/2)', '3. State Tree (~20 GB)', '4. FULL Validated'];
        const activeStage = Math.min(3, Math.floor(stageProgress));

        for (let i = 0; i < 4; i++) {
          const bx = 46 + i * ((w - 92) / 4) + 6;
          const bw = (w - 92) / 4 - 14;
          const by = 110;
          const bh = 120;
          const done = i < activeStage;
          const curr = i === activeStage;

          ctx.fillStyle = done
            ? 'rgba(16, 185, 129, 0.14)'
            : curr
              ? 'rgba(34, 211, 238, 0.16)'
              : 'rgba(15, 23, 42, 0.85)';
          ctx.strokeStyle = done ? '#34d399' : curr ? '#22d3ee' : '#334155';
          ctx.lineWidth = curr ? 2.5 : 1.5;
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeRect(bx, by, bw, bh);

          ctx.fillStyle = done ? '#6ee7b7' : curr ? '#67e8f9' : '#94a3b8';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(stages[i], bx + bw / 2, by + 44);

          const sub =
            i === 0
              ? 'TCP 51235 Gossip'
              : i === 1
                ? 'XRPLF + Ripple Keys'
                : i === 2
                  ? 'NuDB online_delete'
                  : '1ms Local 127.0.0.1';
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '10px monospace';
          ctx.fillText(sub, bx + bw / 2, by + 72);

          if (curr) {
            const pct = Math.round((stageProgress - Math.floor(stageProgress)) * 100);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(bx + 14, by + 92, bw - 28, 7);
            ctx.fillStyle = '#22d3ee';
            ctx.fillRect(bx + 14, by + 92, ((bw - 28) * pct) / 100, 7);
          }
        }

        ctx.fillStyle = '#67e8f9';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          '1-Click Docker Stock Node: Verifies live Mainnet independently (~20 GB SSD, no multi-TB archive needed)',
          w * 0.5,
          62
        );
      }

      ctx.restore();
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [scene, playing, feeLoadMultiplier, defaultShockTriggered]);

  return (
    <div className="space-y-4">
      {/* Scene Selector Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {INTERACTIVE_EXPLAINERS.map((item) => {
          const Icon = item.icon;
          const active = scene === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setScene(item.id);
                setDefaultShockTriggered(false);
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                active
                  ? 'bg-cyan-500/15 border-cyan-400/60 text-white shadow-glowCyan'
                  : 'bg-panel border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <Icon className={`w-4 h-4 ${active ? 'text-cyan-300' : 'text-slate-500'}`} />
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-300">
                  {item.badge}
                </span>
              </div>
              <div className="text-xs font-semibold leading-tight">{item.title}</div>
            </button>
          );
        })}
      </div>

      {/* Main Interactive Animation Canvas + Controls */}
      <div className="hud-panel rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">{activeMeta.title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{activeMeta.summary}</p>
          </div>

          <div className="flex items-center gap-2">
            {scene === 'fees' && (
              <button
                type="button"
                onClick={() => setFeeLoadMultiplier(feeLoadMultiplier === 945 ? 1 : 945)}
                className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 border border-rose-400/50 text-[11px] font-mono text-rose-200 hover:bg-rose-500/30"
              >
                {feeLoadMultiplier === 945 ? 'Reset to 1x (10d)' : 'Try 945x Spike!'}
              </button>
            )}
            {scene === 'vault-lending' && (
              <button
                type="button"
                onClick={() => setDefaultShockTriggered((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono ${
                  defaultShockTriggered
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                    : 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                }`}
              >
                {defaultShockTriggered ? 'Restore Normal Yield' : 'Trigger Default Shock!'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-cyan-200"
            >
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => {
                simTimeRef.current = 0;
              }}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:text-white"
              title="Restart animation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {scene === 'fees' && (
          <div className="flex items-center gap-3 font-mono text-xs bg-slate-950/75 border border-slate-800 rounded-lg px-3 py-2">
            <span className="text-slate-400 shrink-0">Load Multiplier:</span>
            <input
              type="range"
              min={1}
              max={1000}
              step={1}
              value={feeLoadMultiplier}
              onChange={(e) => setFeeLoadMultiplier(Number(e.target.value))}
              className="flex-1 accent-cyan-400"
            />
            <span className="text-cyan-300 font-bold w-24 text-right">{feeLoadMultiplier}x</span>
          </div>
        )}

        <div className="rounded-xl overflow-hidden border border-slate-800">
          <canvas ref={canvasRef} className="w-full h-[320px] block" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {activeMeta.keyPoints.map((pt, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 leading-relaxed"
            >
              <span className="font-mono text-cyan-400 font-bold mr-1.5">0{idx + 1}.</span>
              {pt}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
