import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Check,
  Copy,
  Crosshair,
  Globe2,
  MapPin,
  Network,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useCommandStore } from '../store/useCommandStore';
import {
  buildGlobeNodeItems,
  FALLBACK_HUBS,
  GlobeNodeItem,
  latLonToEquirectangularUV,
  latLonToGlobeCoords,
  WORLD_CONTINENT_POLYGONS,
} from '../shared/worldContinents';

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const { x, y, z } = latLonToGlobeCoords(lat, lon, radius);
  return new THREE.Vector3(x, y, z);
}

function createContinentTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Deep midnight ocean gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#040b18');
  oceanGrad.addColorStop(0.5, '#07152b');
  oceanGrad.addColorStop(1, '#040b18');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle latitude / longitude graticule lines
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * width;
    ctx.strokeStyle = lon === 0 ? 'rgba(56, 189, 248, 0.22)' : 'rgba(30, 64, 175, 0.16)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * height;
    ctx.strokeStyle = lat === 0 ? 'rgba(56, 189, 248, 0.24)' : 'rgba(30, 64, 175, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Draw filled continents + crisp luminous coastlines
  for (const poly of WORLD_CONTINENT_POLYGONS) {
    if (poly.coords.length < 3) continue;
    ctx.beginPath();
    for (let i = 0; i < poly.coords.length; i++) {
      const [lon, lat] = poly.coords[i];
      const { u, v } = latLonToEquirectangularUV(lat, lon);
      const px = u * width;
      const py = v * height;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();

    // Landmass fill
    ctx.fillStyle = poly.name === 'Antarctica' ? 'rgba(15, 42, 74, 0.65)' : 'rgba(16, 56, 94, 0.88)';
    ctx.fill();

    // Subtle inner coastline glow + crisp cyan border
    ctx.strokeStyle = poly.name === 'Antarctica' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(34, 211, 238, 0.72)';
    ctx.lineWidth = poly.name === 'Antarctica' ? 1.2 : 2.0;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function formatCoord(lat: number, lon: number): string {
  const latStr = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
}

function formatUptime(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatAgreement(val?: number | null): string {
  if (val == null || !Number.isFinite(val)) return '—';
  const pct = val <= 1 ? val * 100 : val;
  return `${pct.toFixed(2)}%`;
}

export const ValidatorGlobe3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(true);
  autoRotateRef.current = autoRotate;
  const targetRotationRef = useRef<{ x: number; y: number } | null>(null);
  const [focusedLabel, setFocusedLabel] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GlobeNodeItem | null>(null);
  const selectedNodeRef = useRef<GlobeNodeItem | null>(null);
  selectedNodeRef.current = selectedNode;
  const [copiedKey, setCopiedKey] = useState(false);

  const topologyNodes = useCommandStore((s) => s.topologyNodes);
  const validators = useCommandStore((s) => s.validators);
  const latestLedger = useCommandStore((s) => s.ledgers[0]);
  const tpsEstimate = useCommandStore((s) => s.tpsEstimate);
  const recentValidations = useCommandStore((s) => s.recentValidations);
  const reducedMotion = useCommandStore((s) => s.reducedMotion);

  const globeNodes = useMemo(
    () => buildGlobeNodeItems(topologyNodes, validators, FALLBACK_HUBS),
    [topologyNodes, validators],
  );

  const focusChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: GlobeNodeItem[] = [];
    for (const node of globeNodes) {
      const key = node.country && !node.isFallbackHub ? node.country : node.label;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push(node);
      if (chips.length >= 8) break;
    }
    return chips;
  }, [globeNodes]);

  const focusOnNode = (node: GlobeNodeItem) => {
    const v = latLonToVector3(node.lat, node.lon, 1);
    const targetY = Math.atan2(-v.x, v.z);
    const targetX = Math.max(-1.0, Math.min(1.0, ((node.lat * Math.PI) / 180) * 0.7));
    targetRotationRef.current = { x: targetX, y: targetY };
    setAutoRotate(false);
    setFocusedLabel(node.label);
    setSelectedNode(node);
  };

  const handleCopyKey = (key: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(key).catch(() => {});
    }
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1800);
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

    // Textured Earth sphere with actual continents & coastlines
    const continentTexture = createContinentTexture();
    if (continentTexture) {
      continentTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    const coreGeo = new THREE.SphereGeometry(RADIUS, 64, 48);
    const coreMat = new THREE.MeshBasicMaterial({
      map: continentTexture ?? undefined,
      color: continentTexture ? 0xffffff : 0x061024,
      transparent: true,
      opacity: 0.98,
    });
    globeGroup.add(new THREE.Mesh(coreGeo, coreMat));

    // Subtle holographic atmosphere shell
    const haloGeo = new THREE.SphereGeometry(RADIUS * 1.065, 48, 48);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.065,
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

    for (let i = 0; i < globeNodes.length; i++) {
      const node = globeNodes[i];
      const v = latLonToVector3(node.lat, node.lon, RADIUS * 1.016);
      points.push(v);
      nodePositions.push(v.x, v.y, v.z);
      const c = node.isUnl ? colorMint : node.isValidator ? colorViolet : colorCyan;
      nodeColors.push(c.r, c.g, c.b);
    }

    const ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
    ptsGeo.setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
    const ptsMat = new THREE.PointsMaterial({
      size: 0.075,
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
    });
    globeGroup.add(new THREE.Points(ptsGeo, ptsMat));

    // Glowing selection marker for the currently selected node
    const markerGeo = new THREE.SphereGeometry(0.036, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.95,
    });
    const selectionMarker = new THREE.Mesh(markerGeo, markerMat);
    selectionMarker.visible = false;
    globeGroup.add(selectionMarker);

    const ringGeo = new THREE.RingGeometry(0.052, 0.074, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const selectionRing = new THREE.Mesh(ringGeo, ringMat);
    selectionRing.visible = false;
    globeGroup.add(selectionRing);

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

    // Helper: pick closest front-facing node within pixel threshold
    const tempWorld = new THREE.Vector3();
    const tempProj = new THREE.Vector3();
    const tempToCam = new THREE.Vector3();
    const ringNormalZ = new THREE.Vector3(0, 0, 1);
    const tempUnitPos = new THREE.Vector3();
    const pickNodeAtClientPos = (clientX: number, clientY: number, maxDistPx = 20): GlobeNodeItem | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      globeGroup.updateMatrixWorld(true);

      let bestNode: GlobeNodeItem | null = null;
      let bestDistSq = maxDistPx * maxDistPx;

      for (let i = 0; i < points.length; i++) {
        tempWorld.copy(points[i]).applyMatrix4(globeGroup.matrixWorld);
        // Only allow picking nodes on the camera-facing hemisphere
        tempToCam.copy(camera.position).sub(tempWorld);
        if (tempWorld.dot(tempToCam) <= 0) continue;

        tempProj.copy(tempWorld).project(camera);
        const sx = (tempProj.x * 0.5 + 0.5) * rect.width;
        const sy = (-tempProj.y * 0.5 + 0.5) * rect.height;
        const dx = sx - x;
        const dy = sy - y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestNode = globeNodes[i];
        }
      }
      return bestNode;
    };

    // Lightweight pointer drag, click-to-inspect & zoom controls
    let dragging = false;
    let downX = 0;
    let downY = 0;
    let prevX = 0;
    let prevY = 0;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      targetRotationRef.current = null;
      downX = e.clientX;
      downY = e.clientY;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;
        globeGroup.rotation.y += dx * 0.006;
        globeGroup.rotation.x = Math.max(-1.1, Math.min(1.1, globeGroup.rotation.x + dy * 0.006));
        return;
      }
      if (e.target !== renderer.domElement) return;
      // Update cursor when hovering over a clickable node
      const hovered = pickNodeAtClientPos(e.clientX, e.clientY, 16);
      renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved < 6) {
        const picked = pickNodeAtClientPos(e.clientX, e.clientY, 22);
        if (picked) {
          focusOnNode(picked);
        }
      }
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
    let pulseTick = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      pulseTick += 0.06;

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

      // Update selected node 3D highlight marker
      const sel = selectedNodeRef.current;
      if (sel) {
        const pos = latLonToVector3(sel.lat, sel.lon, RADIUS * 1.022);
        selectionMarker.position.copy(pos);
        selectionMarker.visible = true;

        selectionRing.position.copy(pos);
        selectionRing.quaternion.setFromUnitVectors(ringNormalZ, tempUnitPos.copy(pos).normalize());
        const s = 1 + Math.sin(pulseTick) * 0.18;
        selectionRing.scale.set(s, s, 1);
        selectionRing.visible = true;
      } else {
        selectionMarker.visible = false;
        selectionRing.visible = false;
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
      continentTexture?.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      ptsGeo.dispose();
      ptsMat.dispose();
      markerGeo.dispose();
      markerMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, [globeNodes]);

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
              Drag to orbit • Scroll to zoom • Click any node to inspect details on the right
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
            onClick={() => focusOnNode(chip)}
            className={`px-2 py-0.5 rounded-md border shrink-0 transition-colors ${
              focusedLabel === chip.label
                ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-cyan-500/40'
            }`}
          >
            {chip.country && !chip.isFallbackHub ? chip.country : chip.label}
          </button>
        ))}
      </div>

      {/* Main Split Area: 3D Globe + Right-Side Node Details Panel */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <div className="flex-1 relative min-w-0">
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

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
              {!selectedNode && <span className="text-cyan-300/80">• Click a node to inspect</span>}
              {reducedMotion && <span className="text-amber-300">• Reduced Motion</span>}
            </div>
          </div>
        </div>

        {/* Right-Side Node Details Drawer */}
        {selectedNode && (
          <aside className="w-80 shrink-0 border-l border-slate-800/80 bg-slate-950/90 backdrop-blur-md flex flex-col overflow-y-auto z-10">
            <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-800/80">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  {selectedNode.isUnl ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      UNL Validator
                    </span>
                  ) : selectedNode.isValidator ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      Validator
                    </span>
                  ) : selectedNode.isFallbackHub ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      Regional Hub
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      Peer Node
                    </span>
                  )}
                  {selectedNode.domainVerified && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 font-mono">
                      <ShieldCheck className="w-3 h-3" /> Verified
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-white truncate" title={selectedNode.label}>
                  {selectedNode.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                aria-label="Close node details"
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 font-mono text-xs">
              {/* Location Card */}
              <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-3 space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-cyan-400" />
                    Geographic Location
                  </span>
                  <button
                    type="button"
                    onClick={() => focusOnNode(selectedNode)}
                    className="text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Center
                  </button>
                </div>
                <div className="text-slate-200 font-sans text-xs">
                  {selectedNode.country || 'Unknown Region'}
                  {selectedNode.region ? ` • ${selectedNode.region}` : ''}
                </div>
                <div className="text-[11px] text-cyan-300 tabular-nums">
                  {formatCoord(selectedNode.lat, selectedNode.lon)}
                </div>
              </div>

              {/* Public Key & Domain */}
              {selectedNode.pubkey && (
                <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
                    <span>Node Public Key</span>
                    <button
                      type="button"
                      onClick={() => handleCopyKey(selectedNode.pubkey!)}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors"
                    >
                      {copiedKey ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-300 break-all leading-relaxed">
                    {selectedNode.pubkey}
                  </div>
                  {selectedNode.domain && (
                    <div className="pt-1 border-t border-slate-800/70 text-[11px] text-cyan-300 truncate">
                      {selectedNode.domain}
                    </div>
                  )}
                </div>
              )}

              {/* Server & Peer Telemetry */}
              <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
                  <Server className="w-3 h-3 text-violet-400" />
                  Node Telemetry
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-[10px] text-slate-500">Version</div>
                    <div className="text-slate-200 truncate">{selectedNode.version || 'rippled'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Uptime</div>
                    <div className="text-slate-200 tabular-nums">{formatUptime(selectedNode.uptime)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Inbound Peers</div>
                    <div className="text-cyan-300 tabular-nums">
                      {selectedNode.inbound != null ? selectedNode.inbound : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Outbound Peers</div>
                    <div className="text-emerald-300 tabular-nums">
                      {selectedNode.outbound != null ? selectedNode.outbound : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Consensus Agreement (when matched with ValidatorRecord) */}
              {(selectedNode.agreement1h != null ||
                selectedNode.agreement24h != null ||
                selectedNode.agreement30d != null) && (
                <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
                    <Network className="w-3 h-3 text-emerald-400" />
                    Consensus Agreement
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded bg-slate-950/70 p-1.5 border border-slate-800/70">
                      <div className="text-[10px] text-slate-500">1H</div>
                      <div className="text-emerald-300 font-semibold tabular-nums">
                        {formatAgreement(selectedNode.agreement1h)}
                      </div>
                    </div>
                    <div className="rounded bg-slate-950/70 p-1.5 border border-slate-800/70">
                      <div className="text-[10px] text-slate-500">24H</div>
                      <div className="text-emerald-300 font-semibold tabular-nums">
                        {formatAgreement(selectedNode.agreement24h)}
                      </div>
                    </div>
                    <div className="rounded bg-slate-950/70 p-1.5 border border-slate-800/70">
                      <div className="text-[10px] text-slate-500">30D</div>
                      <div className="text-cyan-300 font-semibold tabular-nums">
                        {formatAgreement(selectedNode.agreement30d)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedNode.isFallbackHub && (
                <div className="text-[11px] text-slate-400 font-sans leading-relaxed bg-slate-900/50 border border-slate-800/60 rounded-lg p-2.5">
                  Showing regional XRPL validator hub coordinates. Live VHS peer topology metrics will populate automatically once topology sync completes.
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
