import React, { useEffect, useMemo, useRef } from 'react';
import { subscribeVisualLedgerPulse, subscribeVisualTx } from '../services/streamVisualBus';
import { TX_CATEGORY_META } from '../shared/networks';
import { useCommandStore } from '../store/useCommandStore';

interface OrbitParticle {
  angle: number;
  radius: number;
  angularSpeed: number; // rad/sec
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

const MAX_ORBIT_PARTICLES = 96;

export const ConsensusCoreCanvas: React.FC = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<OrbitParticle[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);

  const streamStatus = useCommandStore((s) => s.streamStatus);
  const latestLedger = useCommandStore((s) => s.ledgers[0]);
  const tpsEstimate = useCommandStore((s) => s.tpsEstimate);
  const currentLedgerValidators = useCommandStore((s) => s.currentLedgerValidators);
  const validators = useCommandStore((s) => s.validators);
  const paused = useCommandStore((s) => s.paused);
  const reducedMotion = useCommandStore((s) => s.reducedMotion);

  const unlCount = useMemo(
    () => Math.max(validators.filter((v) => v.unl).length, 35),
    [validators]
  );
  const activeVotes = useMemo(
    () => Object.keys(currentLedgerValidators).length,
    [currentLedgerValidators]
  );

  // Mirror lightweight scalar metrics into refs so the 60fps loop never scans arrays/objects
  const metricsRef = useRef({
    activeVotes: 0,
    unlCount: 35,
    phase: 'open',
    connected: false,
    paused: false,
    reducedMotion: false,
  });

  metricsRef.current.activeVotes = activeVotes;
  metricsRef.current.unlCount = unlCount;
  metricsRef.current.phase = streamStatus.consensusPhase;
  metricsRef.current.connected = streamStatus.connected;
  metricsRef.current.paused = paused;
  metricsRef.current.reducedMotion = reducedMotion;

  // Spawn particles & shockwaves directly from zero-overhead visual bus
  useEffect(() => {
    const unsubTx = subscribeVisualTx((tx) => {
      const m = metricsRef.current;
      if (m.paused || m.reducedMotion) return;
      const list = particlesRef.current;
      if (list.length >= MAX_ORBIT_PARTICLES) return;

      const meta = TX_CATEGORY_META[tx.category] ?? TX_CATEGORY_META.system;
      list.push({
        angle: Math.random() * Math.PI * 2,
        radius: 155 + Math.random() * 28,
        angularSpeed: 1.1 + Math.random() * 1.1,
        size: tx.isWhale
          ? 5.5
          : Math.min(4, 1.8 + Math.log10(Math.max(1, tx.amountXrpEstimate)) * 0.45),
        color: meta.color,
        alpha: 1,
        isWhale: tx.isWhale,
      });
    });

    const unsubPulse = subscribeVisualLedgerPulse(() => {
      if (shockwavesRef.current.length < 6) {
        shockwavesRef.current.push({
          radius: 42,
          alpha: 0.95,
          color: '#34d399',
        });
      }
    });

    return () => {
      unsubTx();
      unsubPulse();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Pre-build radial glow gradient once (zero per-frame gradient allocation!)
    const coreGlow = ctx.createRadialGradient(0, 0, 8, 0, 0, 62);
    coreGlow.addColorStop(0, 'rgba(34, 211, 238, 0.28)');
    coreGlow.addColorStop(0.65, 'rgba(14, 165, 233, 0.09)');
    coreGlow.addColorStop(1, 'rgba(4, 8, 17, 0)');

    let rafId = 0;
    let tick = 0;
    let cssW = 0;
    let cssH = 0;
    let lastTs = performance.now();

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cssW = parent.clientWidth;
      cssH = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.max(1, Math.floor(cssH * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

      const cx = cssW / 2;
      const cy = cssH / 2;
      const scale = Math.min(cssW, cssH) / 360;

      ctx.clearRect(0, 0, cssW, cssH);

      const m = metricsRef.current;
      const shouldMove = !m.paused && !m.reducedMotion;
      const quorumRatio = Math.min(1, m.activeVotes / Math.max(1, Math.round(m.unlCount * 0.8)));

      if (shouldMove) {
        tick += dt * 0.9;
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      // Subtle radar rings
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.11)';
      ctx.lineWidth = 1;
      for (const r of [64, 108, 146]) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
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
        m.phase === 'accepted'
          ? '#34d399'
          : m.phase === 'establish'
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
      const ringNodes = Math.min(m.unlCount, 42);
      for (let i = 0; i < ringNodes; i++) {
        const a = (i / ringNodes) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * 146;
        const y = Math.sin(a) * 146;
        const isLit =
          i < m.activeVotes ||
          (m.activeVotes === 0 && m.connected && Math.sin(tick * 3 + i) > 0.65);

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

      // Spiraling transaction packets entering the consensus core (delta-time normalized)
      const pList = particlesRef.current;
      let pWrite = 0;
      for (let i = 0; i < pList.length; i++) {
        const p = pList[i];
        if (shouldMove) {
          p.angle += p.angularSpeed * dt;
          p.radius -= 86 * dt;
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
          pList[pWrite++] = p;
        }
      }
      pList.length = pWrite;
      ctx.globalAlpha = 1;

      // Ledger close shockwaves (delta-time normalized)
      const wList = shockwavesRef.current;
      let wWrite = 0;
      const fadeFactor = Math.pow(0.035, dt);
      for (let i = 0; i < wList.length; i++) {
        const wave = wList[i];
        if (shouldMove) {
          wave.radius += 165 * dt;
          wave.alpha *= fadeFactor;
        }
        if (wave.alpha > 0.04 && wave.radius < 185) {
          ctx.beginPath();
          ctx.arc(0, 0, wave.radius, 0, Math.PI * 2);
          ctx.strokeStyle = wave.color;
          ctx.globalAlpha = wave.alpha;
          ctx.lineWidth = 2.4;
          ctx.stroke();
          wList[wWrite++] = wave;
        }
      }
      wList.length = wWrite;
      ctx.globalAlpha = 1;

      // Central core glow (pre-allocated gradient)
      ctx.beginPath();
      ctx.arc(0, 0, 62, 0, Math.PI * 2);
      ctx.fillStyle = coreGlow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6, 14, 28, 0.92)';
      ctx.fill();
      ctx.strokeStyle = phaseColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.restore();
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

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
});
