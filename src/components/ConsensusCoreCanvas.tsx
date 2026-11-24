import React, { useEffect, useRef } from 'react';
import { TX_CATEGORY_META } from '../shared/networks';
import { useCommandStore } from '../store/useCommandStore';

interface OrbitParticle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  color: string;
  alpha: number;
  isWhale: boolean;
}

interface Shockwave {
  radius: number;
  alpha: number;
  color: string;
}

export const ConsensusCoreCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<OrbitParticle[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const lastTxIdRef = useRef<string>('');
  const lastLedgerPulseRef = useRef<number>(0);

  const streamStatus = useCommandStore((s) => s.streamStatus);
  const latestLedger = useCommandStore((s) => s.ledgers[0]);
  const tpsEstimate = useCommandStore((s) => s.tpsEstimate);
  const currentLedgerValidators = useCommandStore((s) => s.currentLedgerValidators);
  const unlCount = useCommandStore((s) => Math.max(s.validators.filter((v) => v.unl).length, 35));
  const paused = useCommandStore((s) => s.paused);
  const reducedMotion = useCommandStore((s) => s.reducedMotion);

  // Spawn particles when transactions arrive
  useEffect(() => {
    const unsub = useCommandStore.subscribe((state) => {
      const topTx = state.transactions[0];
      if (topTx && topTx.id !== lastTxIdRef.current) {
        lastTxIdRef.current = topTx.id;
        if (!state.paused && !state.reducedMotion && particlesRef.current.length < 140) {
          const meta = TX_CATEGORY_META[topTx.category] ?? TX_CATEGORY_META.system;
          particlesRef.current.push({
            angle: Math.random() * Math.PI * 2,
            radius: 155 + Math.random() * 28,
            speed: 0.018 + Math.random() * 0.02,
            size: topTx.isWhale ? 5.5 : Math.min(4, 1.8 + Math.log10(Math.max(1, topTx.amountXrpEstimate)) * 0.45),
            color: meta.color,
            alpha: 1,
            isWhale: topTx.isWhale,
          });
        }
      }

      if (state.lastLedgerPulseAt > lastLedgerPulseRef.current) {
        lastLedgerPulseRef.current = state.lastLedgerPulseAt;
        shockwavesRef.current.push({
          radius: 42,
          alpha: 0.95,
          color: '#34d399',
        });
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
    let tick = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) / 360;

      ctx.clearRect(0, 0, w, h);

      const state = useCommandStore.getState();
      const activeVals = Object.keys(state.currentLedgerValidators).length;
      const totalSlots = Math.max(state.validators.filter((v) => v.unl).length, 35);
      const quorumRatio = Math.min(1, activeVals / Math.max(1, Math.round(totalSlots * 0.8)));

      if (!state.paused && !state.reducedMotion) {
        tick += 0.015;
      }

      // Subtle radar rings
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      for (const r of [64, 108, 146]) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.11)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Rotating dashed outer scan ring
      ctx.save();
      ctx.rotate(tick * 0.45);
      ctx.beginPath();
      ctx.setLineDash([7, 11]);
      ctx.arc(0, 0, 162, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Quorum progress arc
      const startAngle = -Math.PI / 2;
      const phaseColor =
        state.streamStatus.consensusPhase === 'accepted'
          ? '#34d399'
          : state.streamStatus.consensusPhase === 'establish'
            ? '#fbbf24'
            : '#22d3ee';

      ctx.beginPath();
      ctx.arc(0, 0, 128, startAngle, startAngle + Math.PI * 2 * Math.max(0.08, quorumRatio));
      ctx.strokeStyle = phaseColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 80% supermajority notch marker
      const eightyAngle = startAngle + Math.PI * 2 * 0.8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(eightyAngle) * 121, Math.sin(eightyAngle) * 121);
      ctx.lineTo(Math.cos(eightyAngle) * 135, Math.sin(eightyAngle) * 135);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.stroke();

      // UNL Validator ring nodes
      const ringNodes = Math.min(totalSlots, 42);
      for (let i = 0; i < ringNodes; i++) {
        const a = (i / ringNodes) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * 146;
        const y = Math.sin(a) * 146;
        const isLit = i < activeVals || (activeVals === 0 && state.streamStatus.connected && Math.sin(tick * 3 + i) > 0.65);

        if (isLit) {
          ctx.beginPath();
          ctx.moveTo(x * 0.96, y * 0.96);
          ctx.lineTo(x * 0.45, y * 0.45);
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.16)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(x, y, isLit ? 3.5 : 2.1, 0, Math.PI * 2);
        ctx.fillStyle = isLit ? '#34d399' : 'rgba(148, 163, 184, 0.35)';
        ctx.fill();
      }

      // Spiraling transaction packets entering the consensus core
      const nextParticles: OrbitParticle[] = [];
      for (const p of particlesRef.current) {
        if (!state.paused && !state.reducedMotion) {
          p.angle += p.speed;
          p.radius -= 1.45;
          p.alpha = Math.min(1, Math.max(0, (p.radius - 36) / 48));
        }
        if (p.radius > 38) {
          const px = Math.cos(p.angle) * p.radius;
          const py = Math.sin(p.angle) * p.radius;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.fill();

          if (p.isWhale) {
            ctx.beginPath();
            ctx.arc(px, py, p.size * 2.2, 0, Math.PI * 2);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          nextParticles.push(p);
        }
      }
      particlesRef.current = nextParticles;

      // Ledger close shockwaves
      const nextWaves: Shockwave[] = [];
      for (const wave of shockwavesRef.current) {
        if (!state.paused && !state.reducedMotion) {
          wave.radius += 2.8;
          wave.alpha *= 0.945;
        }
        if (wave.alpha > 0.04 && wave.radius < 185) {
          ctx.beginPath();
          ctx.arc(0, 0, wave.radius, 0, Math.PI * 2);
          ctx.strokeStyle = wave.color;
          ctx.globalAlpha = wave.alpha;
          ctx.lineWidth = 2.4;
          ctx.stroke();
          ctx.globalAlpha = 1;
          nextWaves.push(wave);
        }
      }
      shockwavesRef.current = nextWaves;

      // Central core glow
      const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, 62);
      grad.addColorStop(0, 'rgba(34, 211, 238, 0.28)');
      grad.addColorStop(0.65, 'rgba(14, 165, 233, 0.09)');
      grad.addColorStop(1, 'rgba(4, 8, 17, 0)');
      ctx.beginPath();
      ctx.arc(0, 0, 62, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6, 14, 28, 0.92)';
      ctx.fill();
      ctx.strokeStyle = phaseColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.restore();
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const activeVotes = Object.keys(currentLedgerValidators).length;

  return (
    <div className="hud-panel rounded-xl p-4 flex flex-col relative overflow-hidden h-[340px]">
      <div className="flex items-center justify-between mb-1 z-10">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Live Consensus Core
          </h2>
          <p className="text-[11px] text-slate-400">
            Open → Establish → 80% UNL Quorum → Validated
          </p>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border ${
            streamStatus.consensusPhase === 'accepted'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
              : streamStatus.consensusPhase === 'establish'
                ? 'bg-amber-500/15 text-amber-300 border-amber-400/40'
                : 'bg-cyan-500/15 text-cyan-300 border-cyan-400/40'
          }`}
        >
          {paused ? 'PAUSED' : streamStatus.consensusPhase}
        </span>
      </div>

      <div className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="w-full h-full block" />
        {/* Crisp HTML center overlay for sharp monospace telemetry */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Ledger</span>
          <span className="font-mono text-base font-bold text-white tabular-nums">
            {latestLedger ? `#${latestLedger.ledgerIndex.toLocaleString()}` : 'SYNCING'}
          </span>
          <span className="font-mono text-[11px] text-cyan-300 tabular-nums mt-0.5">
            {tpsEstimate.toFixed(1)} tx/s
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono z-10">
        <div>
          <div className="text-slate-500 text-[10px] uppercase">Votes Seen</div>
          <div className="text-emerald-300 tabular-nums">
            {activeVotes} / {unlCount}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-[10px] uppercase">Last Txns</div>
          <div className="text-cyan-300 tabular-nums">{latestLedger?.txnCount ?? 0}</div>
        </div>
        <div>
          <div className="text-slate-500 text-[10px] uppercase">Close Time</div>
          <div className="text-slate-200 tabular-nums">
            {latestLedger?.closeDurationMs
              ? `${(latestLedger.closeDurationMs / 1000).toFixed(2)}s`
              : '~3.5s'}
          </div>
        </div>
      </div>
      {reducedMotion && (
        <div className="absolute bottom-14 right-3 text-[10px] font-mono text-slate-500">
          Reduced Motion
        </div>
      )}
    </div>
  );
};
