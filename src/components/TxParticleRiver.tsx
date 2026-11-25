import React, { useEffect, useRef } from 'react';
import { subscribeVisualTx } from '../services/streamVisualBus';
import { TX_CATEGORY_META } from '../shared/networks';
import type { LiveTransaction } from '../shared/types';
import { useCommandStore } from '../store/useCommandStore';

interface RiverPacket {
  tx: LiveTransaction;
  x: number; // 0..1 normalized progress across pipeline
  lane: number;
  yJitter: number;
  speedPerSec: number; // normalized width per second
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

const MAX_PACKETS = 120;

export const TxParticleRiver: React.FC = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const packetsRef = useRef<RiverPacket[]>([]);
  const inspectLiveTransaction = useCommandStore((s) => s.inspectLiveTransaction);
  const totalProcessedTxs = useCommandStore((s) => s.totalProcessedTxs);

  useEffect(() => {
    const unsub = subscribeVisualTx((tx) => {
      const state = useCommandStore.getState();
      if (state.paused || state.reducedMotion) return;

      const meta = TX_CATEGORY_META[tx.category] ?? TX_CATEGORY_META.system;
      const radius = tx.isWhale
        ? 7.5
        : Math.min(5.5, 2.6 + Math.log10(Math.max(1, tx.amountXrpEstimate)) * 0.55);

      const list = packetsRef.current;
      list.push({
        tx,
        x: 0.02,
        lane: meta.lane,
        yJitter: (Math.random() - 0.5) * 14,
        speedPerSec: 0.28 + Math.random() * 0.16,
        radius,
        color: meta.color,
      });

      if (list.length > MAX_PACKETS) {
        list.splice(0, list.length - MAX_PACKETS);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Offscreen static backdrop (lanes, labels, consensus gate) — only redrawn on resize
    const bgCanvas = document.createElement('canvas');
    const bgCtx = bgCanvas.getContext('2d');

    let rafId = 0;
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let lastTs = performance.now();

    const redrawStaticBackdrop = () => {
      if (!bgCtx || cssW <= 0 || cssH <= 0) return;
      bgCanvas.width = Math.max(1, Math.floor(cssW * dpr));
      bgCanvas.height = Math.max(1, Math.floor(cssH * dpr));
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bgCtx.clearRect(0, 0, cssW, cssH);

      const leftPad = 108;
      const rightPad = 24;
      const usableW = Math.max(80, cssW - leftPad - rightPad);
      const laneHeight = cssH / LANE_LABELS.length;
      const gateX = leftPad + usableW * 0.68;

      // Stage guide regions (Proposed -> Consensus Gate -> Validated)
      bgCtx.fillStyle = 'rgba(34, 211, 238, 0.03)';
      bgCtx.fillRect(leftPad, 0, usableW * 0.68, cssH);
      bgCtx.fillStyle = 'rgba(52, 211, 153, 0.04)';
      bgCtx.fillRect(gateX, 0, usableW * 0.32, cssH);

      // Consensus validation gate vertical beam
      bgCtx.beginPath();
      bgCtx.setLineDash([5, 5]);
      bgCtx.moveTo(gateX, 6);
      bgCtx.lineTo(gateX, cssH - 6);
      bgCtx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
      bgCtx.lineWidth = 1.5;
      bgCtx.stroke();
      bgCtx.setLineDash([]);

      // Lane tracks & labels
      bgCtx.font = '11px "JetBrains Mono", monospace';
      bgCtx.textBaseline = 'middle';
      for (let i = 0; i < LANE_LABELS.length; i++) {
        const cy = laneHeight * i + laneHeight / 2;
        bgCtx.beginPath();
        bgCtx.moveTo(leftPad, cy);
        bgCtx.lineTo(cssW - rightPad, cy);
        bgCtx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
        bgCtx.lineWidth = 1;
        bgCtx.stroke();

        bgCtx.fillStyle = LANE_LABELS[i].color;
        bgCtx.beginPath();
        bgCtx.arc(12, cy, 3.5, 0, Math.PI * 2);
        bgCtx.fill();

        bgCtx.fillStyle = '#94a3b8';
        bgCtx.fillText(LANE_LABELS[i].label, 22, cy);
      }
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cssW = parent.clientWidth;
      cssH = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.max(1, Math.floor(cssH * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redrawStaticBackdrop();
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw);
      if (document.hidden || cssW <= 0 || cssH <= 0) {
        lastTs = now;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      const leftPad = 108;
      const rightPad = 24;
      const usableW = Math.max(80, cssW - leftPad - rightPad);
      const laneHeight = cssH / LANE_LABELS.length;

      ctx.clearRect(0, 0, cssW, cssH);
      if (bgCanvas.width > 0 && bgCanvas.height > 0) {
        ctx.drawImage(bgCanvas, 0, 0, cssW, cssH);
      }

      const state = useCommandStore.getState();
      const shouldMove = !state.paused && !state.reducedMotion;
      const list = packetsRef.current;
      let writeIdx = 0;

      ctx.lineCap = 'round';
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (shouldMove) {
          p.x += p.speedPerSec * dt;
        }
        if (p.x <= 1.02) {
          const px = leftPad + p.x * usableW;
          const py = laneHeight * p.lane + laneHeight / 2 + p.yJitter;

          // Zero-allocation neon motion trail (no per-frame createLinearGradient!)
          const trailStart = Math.max(leftPad, px - 26);
          ctx.globalAlpha = 0.28;
          ctx.beginPath();
          ctx.moveTo(trailStart, py);
          ctx.lineTo(px, py);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1.5, p.radius * 0.72);
          ctx.stroke();

          // Packet core
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(px, py, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.x > 0.68 ? '#ecfeff' : p.color;
          ctx.fill();

          if (p.tx.isWhale) {
            ctx.beginPath();
            ctx.arc(px, py, p.radius + 5.5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#fde68a';
            ctx.font = 'bold 10px "JetBrains Mono", monospace';
            ctx.fillText(`WHALE ${p.tx.amountDisplay}`, px + 10, py - 8);
          }

          list[writeIdx++] = p;
        }
      }
      list.length = writeIdx;
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
});
