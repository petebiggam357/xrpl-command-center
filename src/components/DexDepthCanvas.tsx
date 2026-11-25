import React, { useEffect, useRef, useState } from 'react';
import { simulateAmmConstantProductSwap } from '../shared/studioUtils';
import type { OrderbookLevel } from '../shared/types';
import { formatCompactNumber } from '../shared/xrplCodec';

interface DexDepthCanvasProps {
  currencyLabel: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  ammReserveXrp?: number;
  ammReserveToken?: number;
  ammFeeBps?: number;
  simulatedSwapXrpIn?: number;
}

export const DexDepthCanvas: React.FC<DexDepthCanvasProps> = ({
  currencyLabel,
  bids,
  asks,
  ammReserveXrp = 50_000,
  ammReserveToken = 100_000,
  ammFeeBps = 30,
  simulatedSwapXrpIn = 2_500,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'depth' | 'amm-curve'>(
    bids.length > 0 || asks.length > 0 ? 'depth' : 'amm-curve'
  );
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);

  const sim = simulateAmmConstantProductSwap({
    reserveIn: ammReserveXrp,
    reserveOut: ammReserveToken,
    amountIn: Math.max(1, simulatedSwapXrpIn || 100),
    tradingFeeBps: ammFeeBps,
    slippagePct: 1.0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth || 460;
    const h = parent.clientHeight || 210;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    const pad = { left: 44, right: 18, top: 16, bottom: 26 };
    const pw = Math.max(60, w - pad.left - pad.right);
    const ph = Math.max(50, h - pad.top - pad.bottom);

    // Subtle HUD grid lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = pad.top + (ph / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(w - pad.right, gy);
      ctx.stroke();
    }

    if (mode === 'depth') {
      const sortedBids = [...bids].sort((a, b) => a.price - b.price);
      const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

      if (sortedBids.length === 0 && sortedAsks.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No open CLOB depth loaded — switch to AMM Curve view', w / 2, h / 2);
        return;
      }

      const allPrices = [...sortedBids.map((b) => b.price), ...sortedAsks.map((a) => a.price)];
      const minP = Math.min(...allPrices) * 0.98;
      const maxP = Math.max(...allPrices) * 1.02 || minP + 1;
      const maxTotal = Math.max(
        sortedBids.reduce((m, b) => Math.max(m, b.total), 0),
        sortedAsks.reduce((m, a) => Math.max(m, a.total), 0),
        1
      );

      const xOf = (p: number) => pad.left + ((p - minP) / Math.max(1e-9, maxP - minP)) * pw;
      const yOf = (tot: number) => pad.top + ph - (tot / maxTotal) * ph;

      // Bid wall (emerald)
      if (sortedBids.length > 0) {
        ctx.beginPath();
        ctx.moveTo(xOf(sortedBids[0].price), pad.top + ph);
        for (const b of sortedBids) {
          ctx.lineTo(xOf(b.price), yOf(b.total));
        }
        ctx.lineTo(xOf(sortedBids[sortedBids.length - 1].price), pad.top + ph);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
        grad.addColorStop(0, 'rgba(52, 211, 153, 0.38)');
        grad.addColorStop(1, 'rgba(52, 211, 153, 0.03)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        sortedBids.forEach((b, idx) => {
          if (idx === 0) ctx.moveTo(xOf(b.price), yOf(b.total));
          else ctx.lineTo(xOf(b.price), yOf(b.total));
        });
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Ask wall (rose)
      if (sortedAsks.length > 0) {
        ctx.beginPath();
        ctx.moveTo(xOf(sortedAsks[0].price), pad.top + ph);
        for (const a of sortedAsks) {
          ctx.lineTo(xOf(a.price), yOf(a.total));
        }
        ctx.lineTo(xOf(sortedAsks[sortedAsks.length - 1].price), pad.top + ph);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
        grad.addColorStop(0, 'rgba(251, 113, 133, 0.38)');
        grad.addColorStop(1, 'rgba(251, 113, 133, 0.03)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        sortedAsks.forEach((a, idx) => {
          if (idx === 0) ctx.moveTo(xOf(a.price), yOf(a.total));
          else ctx.lineTo(xOf(a.price), yOf(a.total));
        });
        ctx.strokeStyle = '#fb7185';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Mid-spread divider
      const midX = pad.left + pw * 0.5;
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(midX, pad.top);
      ctx.lineTo(midX, pad.top + ph);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${minP.toPrecision(4)} XRP`, pad.left, h - 8);
      ctx.textAlign = 'right';
      ctx.fillText(`${maxP.toPrecision(4)} XRP`, w - pad.right, h - 8);
    } else {
      // XLS-30 Constant Product Curve: x * y = k
      const x0 = Math.max(10, ammReserveXrp);
      const y0 = Math.max(10, ammReserveToken);
      const k = x0 * y0;
      const minX = x0 * 0.45;
      const maxX = Math.max(x0 * 1.9, sim.newReserveIn * 1.15);
      const maxY = k / minX;
      const minY = k / maxX;

      const xPos = (x: number) => pad.left + ((x - minX) / (maxX - minX)) * pw;
      const yPos = (y: number) => pad.top + ph - ((y - minY) / Math.max(1e-9, maxY - minY)) * ph;

      // Invariant hyperbola
      ctx.beginPath();
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const x = minX + ((maxX - minX) * i) / steps;
        const y = k / x;
        if (i === 0) ctx.moveTo(xPos(x), yPos(y));
        else ctx.lineTo(xPos(x), yPos(y));
      }
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Current pool point (x0, y0)
      const cx0 = xPos(x0);
      const cy0 = yPos(y0);
      ctx.beginPath();
      ctx.arc(cx0, cy0, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#22d3ee';
      ctx.fill();

      // Post-swap point (newReserveIn, newReserveOut)
      const cx1 = xPos(Math.min(maxX, sim.newReserveIn));
      const cy1 = yPos(Math.max(minY, sim.newReserveOut));

      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(cx0, cy0);
      ctx.lineTo(cx1, cy1);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(cx1, cy1, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#34d399';
      ctx.fill();

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#22d3ee';
      ctx.textAlign = 'left';
      ctx.fillText(`Spot (${formatCompactNumber(x0)} XRP)`, cx0 + 8, cy0 - 6);
      ctx.fillStyle = '#34d399';
      ctx.fillText(
        `After Swap (-${sim.priceImpactPct.toFixed(2)}% impact)`,
        Math.min(w - 175, cx1 + 8),
        Math.min(pad.top + ph - 6, cy1 + 12)
      );
    }
  }, [mode, bids, asks, ammReserveXrp, ammReserveToken, ammFeeBps, simulatedSwapXrpIn, sim]);

  return (
    <div className="rounded-xl bg-slate-950/85 border border-slate-800 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-mono text-slate-300">
          {mode === 'depth'
            ? `Cumulative CLOB Depth (XRP / ${currencyLabel})`
            : `AMM Invariant Curve x·y=k (Impact: ${sim.priceImpactPct.toFixed(2)}%)`}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-slate-700 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => setMode('depth')}
            className={`px-2 py-0.5 ${
              mode === 'depth' ? 'bg-cyan-500/25 text-cyan-200' : 'bg-slate-900 text-slate-400'
            }`}
          >
            CLOB Depth
          </button>
          <button
            type="button"
            onClick={() => setMode('amm-curve')}
            className={`px-2 py-0.5 ${
              mode === 'amm-curve' ? 'bg-violet-500/25 text-violet-200' : 'bg-slate-900 text-slate-400'
            }`}
          >
            AMM x·y=k
          </button>
        </div>
      </div>

      <div
        className="h-[195px] w-full relative"
        onMouseMove={(e) => {
          if (mode === 'amm-curve') {
            setHoverInfo(
              `Est. Out: ${formatCompactNumber(sim.amountOut)} ${currencyLabel} • Min (1% slip): ${formatCompactNumber(sim.minOutWithSlippage)}`
            );
          } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / Math.max(1, rect.width) * 100).toFixed(0);
            setHoverInfo(`Depth Cursor: ${pct}% across spread`);
          }
        }}
        onMouseLeave={() => setHoverInfo(null)}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
        <span>
          {hoverInfo ??
            (mode === 'amm-curve'
              ? `Spot: ${sim.spotPrice.toPrecision(4)} ${currencyLabel}/XRP • Fee: ${(ammFeeBps / 100).toFixed(2)}%`
              : `${bids.length} bid levels • ${asks.length} ask levels`)}
        </span>
      </div>
    </div>
  );
};
