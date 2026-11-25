import React, { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { useCommandStore } from '../store/useCommandStore';

export const PerfHudPill: React.FC = () => {
  const showPerfHud = useCommandStore((s) => s.showPerfHud);
  const latencyMs = useCommandStore((s) => s.streamStatus.latencyMs);
  const tpsEstimate = useCommandStore((s) => s.tpsEstimate);

  const [fps, setFps] = useState(60);
  const [heapMb, setHeapMb] = useState<number | null>(null);

  useEffect(() => {
    if (!showPerfHud) return;
    let rafId = 0;
    let frames = 0;
    let lastCheck = performance.now();

    const loop = (now: number) => {
      frames += 1;
      const elapsed = now - lastCheck;
      if (elapsed >= 750) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        lastCheck = now;
        const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
        if (mem?.usedJSHeapSize) {
          setHeapMb(Math.round(mem.usedJSHeapSize / (1024 * 1024)));
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [showPerfHud]);

  if (!showPerfHud) return null;

  return (
    <div className="fixed bottom-3 right-3 z-40 px-3 py-1.5 rounded-xl bg-slate-950/90 border border-cyan-400/35 shadow-xl font-mono text-[11px] flex items-center gap-3 text-slate-300">
      <span className="flex items-center gap-1.5">
        <Gauge className="w-3.5 h-3.5 text-cyan-400" />
        <span className={fps >= 50 ? 'text-emerald-300 font-bold' : fps >= 30 ? 'text-amber-300 font-bold' : 'text-rose-300 font-bold'}>
          {fps} FPS
        </span>
      </span>
      <span className="text-slate-700">|</span>
      <span className="tabular-nums">{tpsEstimate.toFixed(1)} tx/s</span>
      {latencyMs !== null && (
        <>
          <span className="text-slate-700">|</span>
          <span className="tabular-nums text-cyan-300">{latencyMs}ms</span>
        </>
      )}
      {heapMb !== null && (
        <>
          <span className="text-slate-700">|</span>
          <span className="tabular-nums text-slate-400">{heapMb} MB</span>
        </>
      )}
    </div>
  );
};
