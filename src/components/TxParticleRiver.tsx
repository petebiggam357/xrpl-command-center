import React, { useEffect, useRef } from 'react';
import { TX_CATEGORY_META } from '../shared/networks';
import type { LiveTransaction } from '../shared/types';
import { useCommandStore } from '../store/useCommandStore';

interface RiverPacket {
  tx: LiveTransaction;
  x: number; // 0..1 normalized progress across pipeline
  lane: number;
  yJitter: number;
  speed: number;
  radius: number;
  color: string;
}

const LANE_LABELS = [
  { label: 'XRP Payments', color: '#22d3ee' },
  { label: 'Tokens / MPT', color: '#34d399' },
  { label: 'DEX Orders', color: '#fbbf24' },
  { label: 'AMM Swaps', color: '#a78bfa' },
  { label: 'NFTokens', color: '#f472b6' },
  { label: 'Trust / Sys', color: '#60a5fa' },
];

export const TxParticleRiver: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const packetsRef = useRef<RiverPacket[]>([]);
  const lastTxIdRef = useRef<string>('');
  const inspectLiveTransaction = useCommandStore((s) => s.inspectLiveTransaction);
  const totalProcessedTxs = useCommandStore((s) => s.totalProcessedTxs);

  useEffect(() => {
    const unsub = useCommandStore.subscribe((state) => {
      const tx = state.transactions[0];
      if (!tx || tx.id === lastTxIdRef.current) return;
      lastTxIdRef.current = tx.id;
      if (state.paused || state.reducedMotion) return;

      const meta = TX_CATEGORY_META[tx.category] ?? TX_CATEGORY_META.system;
      const radius = tx.isWhale
        ? 7.5
        : Math.min(6, 2.6 + Math.log10(Math.max(1, tx.amountXrpEstimate)) * 0.6);

      packetsRef.current.push({
        tx,
        x: 0.02,
        lane: meta.lane,
        yJitter: (Math.random() - 0.5) * 14,
        speed: 0.0045 + Math.random() * 0.003,
        radius,
        color: meta.color,
      });

      if (packetsRef.current.length > 220) {
        packetsRef.current.splice(0, packetsRef.current.length - 220);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(parent.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(parent.clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const leftPad = 108;
      const rightPad = 24;
      const usableW = Math.max(80, w - leftPad - rightPad);
      const laneHeight = h / LANE_LABELS.length;
      const gateX = leftPad + usableW * 0.68;

      ctx.clearRect(0, 0, w, h);

      // Draw stage guide regions (Proposed -> Consensus Gate -> Validated)
      ctx.fillStyle = 'rgba(34, 211, 238, 0.03)';
      ctx.fillRect(leftPad, 0, usableW * 0.68, h);
      ctx.fillStyle = 'rgba(52, 211, 153, 0.04)';
      ctx.fillRect(gateX, 0, usableW * 0.32, h);

      // Consensus validation gate vertical beam
      ctx.beginPath();
      ctx.setLineDash([5, 5]);
      ctx.moveTo(gateX, 6);
      ctx.lineTo(gateX, h - 6);
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw lane tracks & labels
      ctx.font = '11px "JetBrains Mono", monospace';
      for (let i = 0; i < LANE_LABELS.length; i++) {
        const cy = laneHeight * i + laneHeight / 2;
        ctx.beginPath();
        ctx.moveTo(leftPad, cy);
        ctx.lineTo(w - rightPad, cy);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = LANE_LABELS[i].color;
        ctx.beginPath();
        ctx.arc(12, cy, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.textBaseline = 'middle';
        ctx.fillText(LANE_LABELS[i].label, 22, cy);
      }

      const state = useCommandStore.getState();
      const next: RiverPacket[] = [];

      for (const p of packetsRef.current) {
        if (!state.paused && !state.reducedMotion) {
          p.x += p.speed;
        }
        if (p.x <= 1.02) {
          const px = leftPad + p.x * usableW;
          const py = laneHeight * p.lane + laneHeight / 2 + p.yJitter;

          // Motion trail
          const trailGrad = ctx.createLinearGradient(px - 28, py, px, py);
          trailGrad.addColorStop(0, 'rgba(0,0,0,0)');
          trailGrad.addColorStop(1, p.color);
          ctx.beginPath();
          ctx.moveTo(Math.max(leftPad, px - 28), py);
          ctx.lineTo(px, py);
          ctx.strokeStyle = trailGrad;
          ctx.lineWidth = Math.max(1.5, p.radius * 0.7);
          ctx.stroke();

          // Packet core
          ctx.beginPath();
          ctx.arc(px, py, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.x > 0.68 ? '#ecfeff' : p.color;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(px, py, p.radius + 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.stroke();

          if (p.tx.isWhale) {
            ctx.beginPath();
            ctx.arc(px, py, p.radius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#fde68a';
            ctx.font = 'bold 10px "JetBrains Mono", monospace';
            ctx.fillText(`WHALE ${p.tx.amountDisplay}`, px + 10, py - 8);
          }

          next.push(p);
        }
      }
      packetsRef.current = next;

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const leftPad = 108;
    const rightPad = 24;
    const usableW = Math.max(80, rect.width - leftPad - rightPad);
    const laneHeight = rect.height / LANE_LABELS.length;

    let closest: RiverPacket | null = null;
    let bestDist = 22;
    for (const p of packetsRef.current) {
      const px = leftPad + p.x * usableW;
      const py = laneHeight * p.lane + laneHeight / 2 + p.yJitter;
      const d = Math.hypot(px - clickX, py - clickY);
      if (d < bestDist) {
        bestDist = d;
        closest = p;
      }
    }
    if (closest) {
      inspectLiveTransaction(closest.tx);
    }
  };

  return (
    <div className="hud-panel rounded-xl p-4 flex flex-col h-[340px]">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Real-Time Data Processing Pipeline
          </h2>
          <p className="text-[11px] text-slate-400">
            Live proposed &amp; validated XRPL packets • Click any particle to inspect
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-wider">
          <span className="text-cyan-300">Mempool / Open</span>
          <span className="text-emerald-300">Consensus Gate → Committed</span>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 tabular-nums">
            {totalProcessedTxs.toLocaleString()} rx
          </span>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full h-full block cursor-crosshair"
        />
      </div>
    </div>
  );
};
