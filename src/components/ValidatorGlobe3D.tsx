import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Crosshair, Globe2, RotateCcw, Sparkles } from 'lucide-react';
import { useCommandStore } from '../store/useCommandStore';

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// Deterministic fallback geographic coordinates for validators if VHS topology isn't loaded yet
const FALLBACK_HUBS: Array<{ lat: number; lon: number; label: string }> = [
  { lat: 37.77, lon: -122.41, label: 'San Francisco' },
  { lat: 40.71, lon: -74.0, label: 'New York' },
  { lat: 51.5, lon: -0.12, label: 'London' },
  { lat: 50.11, lon: 8.68, label: 'Frankfurt' },
  { lat: 47.37, lon: 8.54, label: 'Zurich' },
  { lat: 35.67, lon: 139.65, label: 'Tokyo' },
  { lat: 1.35, lon: 103.81, label: 'Singapore' },
  { lat: -33.86, lon: 151.2, label: 'Sydney' },
  { lat: 37.56, lon: 126.97, label: 'Seoul' },
  { lat: 43.65, lon: -79.38, label: 'Toronto' },
  { lat: 52.36, lon: 4.9, label: 'Amsterdam' },
  { lat: 48.85, lon: 2.35, label: 'Paris' },
  { lat: -23.55, lon: -46.63, label: 'Sao Paulo' },
  { lat: 19.07, lon: 72.87, label: 'Mumbai' },
  { lat: 39.04, lon: -77.48, label: 'Ashburn' },
  { lat: 47.6, lon: -122.33, label: 'Seattle' },
];

export const ValidatorGlobe3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(true);
  autoRotateRef.current = autoRotate;
  const targetRotationRef = useRef<{ x: number; y: number } | null>(null);
  const [focusedLabel, setFocusedLabel] = useState<string | null>(null);

  const topologyNodes = useCommandStore((s) => s.topologyNodes);
  const validators = useCommandStore((s) => s.validators);
  const latestLedger = useCommandStore((s) => s.ledgers[0]);
  const tpsEstimate = useCommandStore((s) => s.tpsEstimate);
  const recentValidations = useCommandStore((s) => s.recentValidations);
  const reducedMotion = useCommandStore((s) => s.reducedMotion);

  const focusChips = useMemo(() => {
    if (topologyNodes.length > 0) {
      const seen = new Set<string>();
      const chips: Array<{ id: string; label: string; lat: number; lon: number }> = [];
      for (const n of topologyNodes) {
        const label = n.country || n.pubkey.slice(0, 10);
        if (seen.has(label)) continue;
        seen.add(label);
        chips.push({ id: n.pubkey, label, lat: n.lat, lon: n.lon });
        if (chips.length >= 8) break;
      }
      return chips;
    }
    return FALLBACK_HUBS.slice(0, 8).map((h) => ({
      id: h.label,
      label: h.label,
      lat: h.lat,
      lon: h.lon,
    }));
  }, [topologyNodes]);

  const focusOnLatLon = (label: string, lat: number, lon: number) => {
    const v = latLonToVector3(lat, lon, 1);
    const targetY = Math.atan2(-v.x, v.z);
    const targetX = Math.max(-1.0, Math.min(1.0, ((lat * Math.PI) / 180) * 0.7));
    targetRotationRef.current = { x: targetX, y: targetY };
    setAutoRotate(false);
    setFocusedLabel(label);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.35, 4.4);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const RADIUS = 1.48;

    // Dark core sphere
    const coreGeo = new THREE.SphereGeometry(RADIUS * 0.992, 48, 48);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x061024,
      transparent: true,
      opacity: 0.94,
    });
    globeGroup.add(new THREE.Mesh(coreGeo, coreMat));

    // Glowing latitude / longitude wireframe shell
    const wireGeo = new THREE.SphereGeometry(RADIUS, 36, 24);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x1e40af,
      wireframe: true,
      transparent: true,
      opacity: 0.24,
    });
    globeGroup.add(new THREE.Mesh(wireGeo, wireMat));

    // Atmospheric outer halo ring
    const haloGeo = new THREE.SphereGeometry(RADIUS * 1.07, 40, 40);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
    });
    globeGroup.add(new THREE.Mesh(haloGeo, haloMat));

    // Plot topology nodes + fallback UNL hubs
    const points: THREE.Vector3[] = [];
    const nodePositions: number[] = [];
    const nodeColors: number[] = [];
    const colorCyan = new THREE.Color('#22d3ee');
    const colorMint = new THREE.Color('#34d399');
    const colorViolet = new THREE.Color('#a78bfa');

    const sourcePoints =
      topologyNodes.length > 0
        ? topologyNodes.slice(0, 320).map((n, i) => ({
            lat: n.lat,
            lon: n.lon,
            isUnl: i < 38,
          }))
        : FALLBACK_HUBS.map((h, i) => ({ lat: h.lat, lon: h.lon, isUnl: i < 12 }));

    for (let i = 0; i < sourcePoints.length; i++) {
      const pt = sourcePoints[i];
      const v = latLonToVector3(pt.lat, pt.lon, RADIUS * 1.015);
      points.push(v);
      nodePositions.push(v.x, v.y, v.z);
      const c = pt.isUnl ? colorMint : i % 3 === 0 ? colorViolet : colorCyan;
      nodeColors.push(c.r, c.g, c.b);
    }

    const ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
    ptsGeo.setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
    const ptsMat = new THREE.PointsMaterial({
      size: 0.065,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
    });
    globeGroup.add(new THREE.Points(ptsGeo, ptsMat));

    // Animated geodesic consensus arcs
    const arcGroup = new THREE.Group();
    globeGroup.add(arcGroup);

    const activeArcs: Array<{ line: THREE.Line; material: THREE.LineBasicMaterial; life: number }> = [];

    const spawnArc = (colorHex: number) => {
      if (points.length < 2 || activeArcs.length > 26) return;
      const a = points[Math.floor(Math.random() * points.length)];
      const b = points[Math.floor(Math.random() * points.length)];
      if (a.distanceTo(b) < 0.35) return;

      const mid = a.clone().add(b).multiplyScalar(0.5);
      const elev = RADIUS * (1.18 + Math.min(0.45, a.distanceTo(b) * 0.14));
      mid.normalize().multiplyScalar(elev);

      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(28));
      const mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.85,
      });
      const line = new THREE.Line(geo, mat);
      arcGroup.add(line);
      activeArcs.push({ line, material: mat, life: 1.0 });
    };

    // Seed initial topology links
    for (let i = 0; i < 8; i++) {
      spawnArc(i % 2 === 0 ? 0x22d3ee : 0x34d399);
    }

    // Subscribe to live store pulses to emit real-time consensus/tx arcs
    let lastPulseCount = 0;
    const unsub = useCommandStore.subscribe((st) => {
      if (st.reducedMotion || st.paused) return;
      if (st.totalProcessedTxs !== lastPulseCount) {
        lastPulseCount = st.totalProcessedTxs;
        if (Math.random() < 0.45) {
          spawnArc(st.streamStatus.consensusPhase === 'accepted' ? 0x34d399 : 0x22d3ee);
        }
      }
    });

    // Lightweight pointer drag & zoom controls
    let dragging = false;
    let prevX = 0;
    let prevY = 0;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      targetRotationRef.current = null;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;
      globeGroup.rotation.y += dx * 0.006;
      globeGroup.rotation.x = Math.max(-1.1, Math.min(1.1, globeGroup.rotation.x + dy * 0.006));
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.position.z = Math.max(2.5, Math.min(7.5, camera.position.z + e.deltaY * 0.002));
    };

    const el = renderer.domElement;
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(container);

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (!dragging && targetRotationRef.current) {
        const target = targetRotationRef.current;
        const dx = target.x - globeGroup.rotation.x;
        const TWO_PI = Math.PI * 2;
        const dy = ((((target.y - globeGroup.rotation.y) + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI - Math.PI;
        globeGroup.rotation.x += dx * 0.09;
        globeGroup.rotation.y += dy * 0.09;
        if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) {
          targetRotationRef.current = null;
        }
      } else if (!dragging && autoRotateRef.current && !useCommandStore.getState().reducedMotion) {
        globeGroup.rotation.y += 0.0024;
      }

      for (let i = activeArcs.length - 1; i >= 0; i--) {
        const item = activeArcs[i];
        item.life -= 0.012;
        item.material.opacity = Math.max(0, item.life * 0.85);
        if (item.life <= 0) {
          arcGroup.remove(item.line);
          item.line.geometry.dispose();
          item.material.dispose();
          activeArcs.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      unsub();
      resizeObs.disconnect();
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      for (const a of activeArcs) {
        a.line.geometry.dispose();
        a.material.dispose();
      }
      coreGeo.dispose();
      coreMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      ptsGeo.dispose();
      ptsMat.dispose();
      renderer.dispose();
    };
  }, [topologyNodes]);

  return (
    <div className="hud-panel rounded-xl relative overflow-hidden h-[calc(100vh-146px)] min-h-[500px] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 z-10 bg-panel/80 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <Globe2 className="w-4 h-4 text-cyan-400" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
              3D Holographic XRPL Validator &amp; Consensus Globe
            </h2>
            <p className="text-[11px] text-slate-400">
              Drag to orbit • Scroll to zoom • Geodesic arcs fire live on consensus &amp; transaction propagation
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            targetRotationRef.current = null;
            setFocusedLabel(null);
            setAutoRotate((v) => !v);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700/80 text-xs text-slate-300 hover:border-cyan-400/50"
        >
          <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
          {autoRotate ? 'Auto-Orbit ON' : 'Auto-Orbit OFF'}
        </button>
      </div>

      {/* Click-to-Focus Validator Hub Chips */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-800/60 bg-slate-950/75 overflow-x-auto z-10 font-mono text-[11px]">
        <span className="inline-flex items-center gap-1 text-slate-500 uppercase tracking-wider shrink-0 mr-1">
          <Crosshair className="w-3 h-3 text-cyan-400" />
          Focus Hub:
        </span>
        {focusChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => focusOnLatLon(chip.label, chip.lat, chip.lon)}
            className={`px-2 py-0.5 rounded-md border shrink-0 transition-colors ${
              focusedLabel === chip.label
                ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-cyan-500/40'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div ref={mountRef} className="flex-1 w-full cursor-grab active:cursor-grabbing" />

      {/* Floating Telemetry Overlay */}
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-3">
        <div className="bg-slate-950/85 backdrop-blur border border-cyan-500/25 rounded-lg px-3.5 py-2.5 font-mono text-xs flex items-center gap-5">
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Geo Nodes Mapped</div>
            <div className="text-cyan-300 font-semibold tabular-nums">
              {topologyNodes.length > 0 ? topologyNodes.length : `${FALLBACK_HUBS.length} hubs`}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">UNL Validators</div>
            <div className="text-emerald-300 font-semibold tabular-nums">
              {validators.filter((v) => v.unl).length}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Live Ledger</div>
            <div className="text-white font-semibold tabular-nums">
              {latestLedger ? `#${latestLedger.ledgerIndex.toLocaleString()}` : 'Syncing'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Flow Rate</div>
            <div className="text-violet-300 font-semibold tabular-nums">{tpsEstimate.toFixed(1)} tx/s</div>
          </div>
        </div>

        <div className="bg-slate-950/85 backdrop-blur border border-slate-800 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-400 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>{recentValidations.length} recent validation pulses</span>
          {reducedMotion && <span className="text-amber-300">• Reduced Motion</span>}
        </div>
      </div>
    </div>
  );
};
