import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Activity,
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
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { subscribeVisualLedgerPulse, subscribeVisualTx } from '../services/streamVisualBus';
import {
  buildGlobeNodeItems,
  FALLBACK_HUBS,
  GlobeNodeItem,
  latLonToEquirectangularUV,
  latLonToGlobeCoords,
  WORLD_CONTINENT_POLYGONS,
} from '../shared/worldContinents';
import { useCommandStore } from '../store/useCommandStore';

type GlobeNodeFilter = 'all' | 'unl' | 'validators' | 'peers';

const MAJOR_CITY_CLUSTERS: Array<[number, number, number]> = [
  // [lat, lon, intensity]
  [37.77, -122.42, 1.0],
  [40.71, -74.01, 1.0],
  [38.9, -77.04, 0.9],
  [41.88, -87.63, 0.75],
  [33.75, -84.39, 0.65],
  [43.65, -79.38, 0.7],
  [51.51, -0.13, 1.0],
  [50.11, 8.68, 1.0],
  [48.86, 2.35, 0.85],
  [52.37, 4.9, 0.9],
  [47.37, 8.54, 0.85],
  [59.33, 18.07, 0.65],
  [35.68, 139.69, 1.0],
  [37.57, 126.98, 0.9],
  [1.35, 103.82, 1.0],
  [22.32, 114.17, 0.85],
  [-33.87, 151.21, 0.9],
  [-23.55, -46.63, 0.8],
  [19.08, 72.88, 0.75],
  [25.2, 55.27, 0.8],
];

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const { x, y, z } = latLonToGlobeCoords(lat, lon, radius);
  return new THREE.Vector3(x, y, z);
}

function createEarthTextures(): {
  albedo: THREE.CanvasTexture;
  specular: THREE.CanvasTexture;
} | null {
  if (typeof document === 'undefined') return null;
  const width = 2048;
  const height = 1024;

  // 1) Albedo + Night-City Lights + Luminous Coastlines Canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 2) Specular Map Canvas (ocean shiny, land matte)
  const specCanvas = document.createElement('canvas');
  specCanvas.width = width / 2;
  specCanvas.height = height / 2;
  const sCtx = specCanvas.getContext('2d');

  if (!ctx || !sCtx) return null;

  // Deep bathymetric midnight ocean gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#030a17');
  oceanGrad.addColorStop(0.25, '#051226');
  oceanGrad.addColorStop(0.5, '#081b38');
  oceanGrad.addColorStop(0.75, '#051226');
  oceanGrad.addColorStop(1, '#030a17');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Specular base: oceans reflect subtle cool specular light
  sCtx.fillStyle = '#384b68';
  sCtx.fillRect(0, 0, specCanvas.width, specCanvas.height);

  // Fine holographic lat/lon graticule
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * width;
    ctx.strokeStyle = lon === 0 ? 'rgba(56, 189, 248, 0.24)' : 'rgba(30, 64, 175, 0.14)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * height;
    ctx.strokeStyle =
      lat === 0
        ? 'rgba(34, 211, 238, 0.30)'
        : Math.abs(lat) === 30
          ? 'rgba(56, 189, 248, 0.17)'
          : 'rgba(30, 64, 175, 0.13)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Draw continents with coastal shelf glow, elevation tint, and matte specular mask
  for (const poly of WORLD_CONTINENT_POLYGONS) {
    if (poly.coords.length < 3) continue;
    const isAntarctica = poly.name === 'Antarctica';

    // Outer coastal bathymetry glow
    ctx.beginPath();
    sCtx.beginPath();
    for (let i = 0; i < poly.coords.length; i++) {
      const [lon, lat] = poly.coords[i];
      const { u, v } = latLonToEquirectangularUV(lat, lon);
      const px = u * width;
      const py = v * height;
      const sx = u * specCanvas.width;
      const sy = v * specCanvas.height;
      if (i === 0) {
        ctx.moveTo(px, py);
        sCtx.moveTo(sx, sy);
      } else {
        ctx.lineTo(px, py);
        sCtx.lineTo(sx, sy);
      }
    }
    ctx.closePath();
    sCtx.closePath();

    // Soft cyan coastal shelf aura
    ctx.save();
    ctx.shadowColor = isAntarctica ? 'rgba(56, 189, 248, 0.22)' : 'rgba(34, 211, 238, 0.42)';
    ctx.shadowBlur = isAntarctica ? 6 : 12;
    ctx.fillStyle = isAntarctica ? 'rgba(18, 48, 82, 0.65)' : 'rgba(13, 52, 88, 0.94)';
    ctx.fill();
    ctx.restore();

    // Subtle interior topographic dot-grid clipped to landmass
    ctx.save();
    ctx.clip();
    ctx.fillStyle = isAntarctica ? 'rgba(125, 211, 252, 0.08)' : 'rgba(56, 189, 248, 0.14)';
    for (let gx = 0; gx < width; gx += 16) {
      for (let gy = 0; gy < height; gy += 16) {
        ctx.fillRect(gx, gy, 1.5, 1.5);
      }
    }
    ctx.restore();

    // Crisp luminous coastline stroke
    ctx.strokeStyle = isAntarctica ? 'rgba(125, 211, 252, 0.42)' : 'rgba(56, 224, 248, 0.88)';
    ctx.lineWidth = isAntarctica ? 1.3 : 2.1;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Matte land on specular map
    sCtx.fillStyle = '#070b12';
    sCtx.fill();
  }

  // Paint subtle glowing night-city / data-center hub clusters
  for (const [lat, lon, intensity] of MAJOR_CITY_CLUSTERS) {
    const { u, v } = latLonToEquirectangularUV(lat, lon);
    const cx = u * width;
    const cy = v * height;
    const rad = 18 * intensity;
    const grad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, rad);
    grad.addColorStop(0, `rgba(253, 224, 71, ${(0.55 * intensity).toFixed(2)})`);
    grad.addColorStop(0.35, `rgba(34, 211, 238, ${(0.35 * intensity).toFixed(2)})`);
    grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const albedo = new THREE.CanvasTexture(canvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.needsUpdate = true;

  const specular = new THREE.CanvasTexture(specCanvas);
  specular.needsUpdate = true;

  return { albedo, specular };
}

function createGlowSpriteTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 1, half, half, half);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.58, 'rgba(255, 255, 255, 0.35)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createFresnelAtmosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color('#22d3ee') },
      intensity: { value: 0.72 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewDir);
        float rim = clamp(1.0 - max(0.0, dot(n, v)), 0.0001, 1.0);
        float fresnel = pow(rim, 3.0);
        gl_FragColor = vec4(glowColor, fresnel * intensity);
      }
    `,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
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

  const [showArcs, setShowArcs] = useState(true);
  const showArcsRef = useRef(true);
  showArcsRef.current = showArcs;

  const [nodeFilter, setNodeFilter] = useState<GlobeNodeFilter>('all');
  const [focusedLabel, setFocusedLabel] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GlobeNodeItem | null>(null);
  const selectedNodeRef = useRef<GlobeNodeItem | null>(null);
  selectedNodeRef.current = selectedNode;

  const [hoverInfo, setHoverInfo] = useState<{
    node: GlobeNodeItem;
    x: number;
    y: number;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState(false);

  const targetRotationRef = useRef<{ x: number; y: number } | null>(null);
  const targetCameraZRef = useRef<number>(4.35);

  const ptsGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const pillarsGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const pointsRef = useRef<THREE.Vector3[]>([]);
  const globeNodesRef = useRef<GlobeNodeItem[]>([]);

  const topologyNodes = useCommandStore((s) => s.topologyNodes);
  const validators = useCommandStore((s) => s.validators);
  const latestLedger = useCommandStore((s) => s.ledgers[0]);
  const tpsEstimate = useCommandStore((s) => s.tpsEstimate);
  const recentValidations = useCommandStore((s) => s.recentValidations);
  const reducedMotion = useCommandStore((s) => s.reducedMotion);

  const allGlobeNodes = useMemo(
    () => buildGlobeNodeItems(topologyNodes, validators, FALLBACK_HUBS),
    [topologyNodes, validators]
  );

  const globeNodes = useMemo(() => {
    if (nodeFilter === 'unl') return allGlobeNodes.filter((n) => n.isUnl || n.isFallbackHub);
    if (nodeFilter === 'validators') return allGlobeNodes.filter((n) => n.isValidator || n.isUnl);
    if (nodeFilter === 'peers') return allGlobeNodes.filter((n) => !n.isValidator && !n.isUnl);
    return allGlobeNodes;
  }, [allGlobeNodes, nodeFilter]);

  globeNodesRef.current = globeNodes;

  const focusChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: GlobeNodeItem[] = [];
    for (const node of allGlobeNodes) {
      const key = node.country && !node.isFallbackHub ? node.country : node.label;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push(node);
      if (chips.length >= 8) break;
    }
    return chips;
  }, [allGlobeNodes]);

  const focusOnNode = (node: GlobeNodeItem) => {
    const v = latLonToVector3(node.lat, node.lon, 1);
    const targetY = Math.atan2(-v.x, v.z);
    const targetX = Math.max(-1.0, Math.min(1.0, ((node.lat * Math.PI) / 180) * 0.7));
    targetRotationRef.current = { x: targetX, y: targetY };
    targetCameraZRef.current = Math.min(targetCameraZRef.current, 3.6);
    setAutoRotate(false);
    setFocusedLabel(node.label);
    setSelectedNode(node);
  };

  const resetCamera = () => {
    targetRotationRef.current = { x: 0.18, y: 0.35 };
    targetCameraZRef.current = 4.35;
    setFocusedLabel(null);
    setAutoRotate(true);
  };

  const handleCopyKey = (key: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(key).catch(() => {});
    }
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1800);
  };

  // Decoupled live node + 3D UNL beacon geometry updater (zero WebGL teardown or camera reset)
  useEffect(() => {
    const RADIUS = 1.48;
    const pts: THREE.Vector3[] = [];
    const nodePositions: number[] = [];
    const nodeColors: number[] = [];
    const pillarPositions: number[] = [];
    const pillarColors: number[] = [];

    const colorCyan = new THREE.Color('#22d3ee');
    const colorMint = new THREE.Color('#34d399');
    const colorViolet = new THREE.Color('#c084fc');

    for (let i = 0; i < globeNodes.length; i++) {
      const node = globeNodes[i];
      const base = latLonToVector3(node.lat, node.lon, RADIUS * 1.012);
      const tipRadius = node.isUnl ? RADIUS * 1.085 : node.isValidator ? RADIUS * 1.055 : RADIUS * 1.018;
      const tip = latLonToVector3(node.lat, node.lon, tipRadius);
      pts.push(tip);
      nodePositions.push(tip.x, tip.y, tip.z);

      const c = node.isUnl ? colorMint : node.isValidator ? colorViolet : colorCyan;
      nodeColors.push(c.r, c.g, c.b);

      if (node.isUnl || node.isValidator) {
        pillarPositions.push(base.x, base.y, base.z, tip.x, tip.y, tip.z);
        pillarColors.push(c.r * 0.45, c.g * 0.45, c.b * 0.45, c.r, c.g, c.b);
      }
    }

    pointsRef.current = pts;
    const geo = ptsGeoRef.current;
    if (geo) {
      geo.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
      geo.computeBoundingSphere();
    }
    const pGeo = pillarsGeoRef.current;
    if (pGeo) {
      pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pillarPositions, 3));
      pGeo.setAttribute('color', new THREE.Float32BufferAttribute(pillarColors, 3));
      pGeo.computeBoundingSphere();
    }
  }, [globeNodes]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
    camera.position.set(0, 0.32, targetCameraZRef.current);

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

    // Subtle 3-point orbital lighting (sunlight + cool cyan rim + soft ambient)
    const ambientLight = new THREE.AmbientLight(0x88b4d8, 1.35);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xe0f2fe, 1.45);
    sunLight.position.set(5, 2.5, 5.5);
    scene.add(sunLight);
    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.7);
    rimLight.position.set(-5, -2, -3.5);
    scene.add(rimLight);

    // Deep-space starfield background
    const starCount = 720;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 18 + Math.random() * 22;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 0.085,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const globeGroup = new THREE.Group();
    globeGroup.rotation.x = 0.18;
    scene.add(globeGroup);

    const RADIUS = 1.48;

    // Lit Earth sphere with procedural bathymetric oceans, luminous continents & city clusters
    const earthTex = createEarthTextures();
    if (earthTex) {
      const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      earthTex.albedo.anisotropy = aniso;
      earthTex.specular.anisotropy = aniso;
    }

    const coreGeo = new THREE.SphereGeometry(RADIUS, 72, 54);
    const coreMat = new THREE.MeshPhongMaterial({
      map: earthTex?.albedo ?? undefined,
      specularMap: earthTex?.specular ?? undefined,
      specular: new THREE.Color(0x38bdf8),
      shininess: 22,
      emissive: new THREE.Color(0x061529),
      emissiveIntensity: 0.65,
    });
    globeGroup.add(new THREE.Mesh(coreGeo, coreMat));

    // True Fresnel atmospheric glow limb shader
    const atmoGeo = new THREE.SphereGeometry(RADIUS * 1.055, 64, 48);
    const atmoMat = createFresnelAtmosphereMaterial();
    globeGroup.add(new THREE.Mesh(atmoGeo, atmoMat));

    // Soft outer back-side atmospheric aura
    const haloGeo = new THREE.SphereGeometry(RADIUS * 1.11, 48, 48);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.055,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    globeGroup.add(new THREE.Mesh(haloGeo, haloMat));

    // Subtle orbital telemetry rings around the Earth
    const orbitGeo1 = new THREE.RingGeometry(RADIUS * 1.28, RADIUS * 1.286, 128);
    const orbitMat1 = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const orbitRing1 = new THREE.Mesh(orbitGeo1, orbitMat1);
    orbitRing1.rotation.x = Math.PI * 0.44;
    orbitRing1.rotation.y = 0.22;
    scene.add(orbitRing1);

    const orbitGeo2 = new THREE.RingGeometry(RADIUS * 1.38, RADIUS * 1.384, 128);
    const orbitMat2 = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    const orbitRing2 = new THREE.Mesh(orbitGeo2, orbitMat2);
    orbitRing2.rotation.x = Math.PI * 0.58;
    orbitRing2.rotation.y = -0.35;
    scene.add(orbitRing2);

    // Expanding 3D Ledger Close Consensus Shockwave Ring
    const shockGeo = new THREE.RingGeometry(RADIUS * 1.02, RADIUS * 1.06, 96);
    const shockMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shockRing = new THREE.Mesh(shockGeo, shockMat);
    shockRing.rotation.x = Math.PI * 0.5;
    globeGroup.add(shockRing);
    let shockProgress = 1.0;

    // 3D Vertical UNL/Validator Pillars
    const pillarsGeo = new THREE.BufferGeometry();
    pillarsGeoRef.current = pillarsGeo;
    const pillarsMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
    });
    globeGroup.add(new THREE.LineSegments(pillarsGeo, pillarsMat));

    // Soft Glowing Node Sprites
    const glowSpriteTex = createGlowSpriteTexture();
    const ptsGeo = new THREE.BufferGeometry();
    ptsGeoRef.current = ptsGeo;
    const ptsMat = new THREE.PointsMaterial({
      size: 0.125,
      map: glowSpriteTex ?? undefined,
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      alphaTest: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    globeGroup.add(new THREE.Points(ptsGeo, ptsMat));

    // Populate initial nodes + pillars immediately
    {
      const initialNodes = globeNodesRef.current;
      const initialPts: THREE.Vector3[] = [];
      const nPos: number[] = [];
      const nCol: number[] = [];
      const pPos: number[] = [];
      const pCol: number[] = [];
      const cCyan = new THREE.Color('#22d3ee');
      const cMint = new THREE.Color('#34d399');
      const cViolet = new THREE.Color('#c084fc');

      for (const node of initialNodes) {
        const base = latLonToVector3(node.lat, node.lon, RADIUS * 1.012);
        const tipR = node.isUnl ? RADIUS * 1.085 : node.isValidator ? RADIUS * 1.055 : RADIUS * 1.018;
        const tip = latLonToVector3(node.lat, node.lon, tipR);
        initialPts.push(tip);
        nPos.push(tip.x, tip.y, tip.z);
        const c = node.isUnl ? cMint : node.isValidator ? cViolet : cCyan;
        nCol.push(c.r, c.g, c.b);
        if (node.isUnl || node.isValidator) {
          pPos.push(base.x, base.y, base.z, tip.x, tip.y, tip.z);
          pCol.push(c.r * 0.45, c.g * 0.45, c.b * 0.45, c.r, c.g, c.b);
        }
      }
      pointsRef.current = initialPts;
      ptsGeo.setAttribute('position', new THREE.Float32BufferAttribute(nPos, 3));
      ptsGeo.setAttribute('color', new THREE.Float32BufferAttribute(nCol, 3));
      pillarsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
      pillarsGeo.setAttribute('color', new THREE.Float32BufferAttribute(pCol, 3));
    }

    // Glowing selection marker + pulsing target reticle
    const markerGeo = new THREE.SphereGeometry(0.038, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.96,
    });
    const selectionMarker = new THREE.Mesh(markerGeo, markerMat);
    selectionMarker.visible = false;
    globeGroup.add(selectionMarker);

    const ringGeo = new THREE.RingGeometry(0.056, 0.082, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const selectionRing = new THREE.Mesh(ringGeo, ringMat);
    selectionRing.visible = false;
    globeGroup.add(selectionRing);

    // Animated geodesic consensus arcs WITH traveling photon packets
    const arcGroup = new THREE.Group();
    globeGroup.add(arcGroup);

    const packetGeo = new THREE.SphereGeometry(0.022, 10, 10);
    const activeArcs: Array<{
      line: THREE.Line;
      lineMat: THREE.LineBasicMaterial;
      packet: THREE.Mesh;
      packetMat: THREE.MeshBasicMaterial;
      curve: THREE.QuadraticBezierCurve3;
      t: number;
      speed: number;
      life: number;
    }> = [];

    const spawnArc = (colorHex: number) => {
      if (!showArcsRef.current) return;
      const pts = pointsRef.current;
      if (pts.length < 2 || activeArcs.length >= 24) return;
      const a = pts[Math.floor(Math.random() * pts.length)];
      const b = pts[Math.floor(Math.random() * pts.length)];
      const dist = a.distanceTo(b);
      if (dist < 0.35) return;

      const mid = a.clone().add(b).multiplyScalar(0.5);
      const elev = RADIUS * (1.2 + Math.min(0.48, dist * 0.16));
      mid.normalize().multiplyScalar(elev);

      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(36));
      const lineMat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.72,
      });
      const line = new THREE.Line(geo, lineMat);
      arcGroup.add(line);

      const packetMat = new THREE.MeshBasicMaterial({
        color: colorHex === 0x34d399 ? 0xa7f3d0 : 0xa5f3fc,
        transparent: true,
        opacity: 0.98,
      });
      const packet = new THREE.Mesh(packetGeo, packetMat);
      packet.position.copy(a);
      arcGroup.add(packet);

      activeArcs.push({
        line,
        lineMat,
        packet,
        packetMat,
        curve,
        t: 0,
        speed: 0.016 + Math.random() * 0.012,
        life: 1.0,
      });
    };

    for (let i = 0; i < 8; i++) {
      spawnArc(i % 2 === 0 ? 0x22d3ee : 0x34d399);
    }

    // Visual bus subscription: ledger close triggers 3D shockwave + burst of emerald consensus arcs!
    const unsubLedger = subscribeVisualLedgerPulse(() => {
      if (useCommandStore.getState().reducedMotion || useCommandStore.getState().paused || document.hidden) return;
      shockProgress = 0;
      spawnArc(0x34d399);
      spawnArc(0x34d399);
    });
    const unsubTx = subscribeVisualTx((tx) => {
      if (useCommandStore.getState().reducedMotion || useCommandStore.getState().paused || document.hidden) return;
      if (tx.isWhale || Math.random() < 0.25) {
        spawnArc(tx.isWhale ? 0xfbbf24 : tx.category === 'amm' || tx.category === 'dex' ? 0xa78bfa : 0x22d3ee);
      }
    });
    const unsubBus = () => {
      unsubLedger();
      unsubTx();
    };

    // Helper: pick closest front-facing node within pixel threshold
    const tempWorld = new THREE.Vector3();
    const tempProj = new THREE.Vector3();
    const tempToCam = new THREE.Vector3();
    const ringNormalZ = new THREE.Vector3(0, 0, 1);
    const tempUnitPos = new THREE.Vector3();
    const pickNodeAtClientPos = (clientX: number, clientY: number, maxDistPx = 22): GlobeNodeItem | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      globeGroup.updateMatrixWorld(true);

      let bestNode: GlobeNodeItem | null = null;
      let bestDistSq = maxDistPx * maxDistPx;
      const pts = pointsRef.current;
      const nodes = globeNodesRef.current;
      const count = Math.min(pts.length, nodes.length);

      for (let i = 0; i < count; i++) {
        tempWorld.copy(pts[i]).applyMatrix4(globeGroup.matrixWorld);
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
          bestNode = nodes[i];
        }
      }
      return bestNode;
    };

    // Pointer drag, click-to-inspect, hover tooltip & smooth wheel zoom
    let dragging = false;
    let downX = 0;
    let downY = 0;
    let prevX = 0;
    let prevY = 0;
    let lastHoverId: string | null = null;
    let lastHoverX = -999;
    let lastHoverY = -999;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      targetRotationRef.current = null;
      downX = e.clientX;
      downY = e.clientY;
      prevX = e.clientX;
      prevY = e.clientY;
      if (lastHoverId !== null) {
        lastHoverId = null;
        setHoverInfo(null);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;
        globeGroup.rotation.y += dx * 0.0058;
        globeGroup.rotation.x = Math.max(-1.12, Math.min(1.12, globeGroup.rotation.x + dy * 0.0058));
        return;
      }
      if (e.target !== renderer.domElement) {
        if (lastHoverId !== null) {
          lastHoverId = null;
          setHoverInfo(null);
        }
        return;
      }
      const hovered = pickNodeAtClientPos(e.clientX, e.clientY, 18);
      renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
      if (hovered) {
        const rect = renderer.domElement.getBoundingClientRect();
        const hx = e.clientX - rect.left;
        const hy = e.clientY - rect.top;
        if (hovered.id !== lastHoverId || Math.abs(hx - lastHoverX) > 3 || Math.abs(hy - lastHoverY) > 3) {
          lastHoverId = hovered.id;
          lastHoverX = hx;
          lastHoverY = hy;
          setHoverInfo({
            node: hovered,
            x: hx,
            y: hy,
          });
        }
      } else if (lastHoverId !== null) {
        lastHoverId = null;
        setHoverInfo(null);
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved < 6) {
        const picked = pickNodeAtClientPos(e.clientX, e.clientY, 24);
        if (picked) {
          focusOnNode(picked);
        }
      }
    };
    const onPointerLeave = () => {
      if (lastHoverId !== null) {
        lastHoverId = null;
        setHoverInfo(null);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetCameraZRef.current = Math.max(2.35, Math.min(7.2, targetCameraZRef.current + e.deltaY * 0.0022));
    };

    const el = renderer.domElement;
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerleave', onPointerLeave);
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
      if (document.hidden) return;
      const isReduced = useCommandStore.getState().reducedMotion;
      pulseTick += 0.06;

      // Smooth zoom interpolation
      camera.position.z += (targetCameraZRef.current - camera.position.z) * 0.12;

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
      } else if (!dragging && autoRotateRef.current && !isReduced) {
        globeGroup.rotation.y += 0.002;
      }

      if (!isReduced) {
        stars.rotation.y += 0.00018;
        orbitRing1.rotation.z += 0.0014;
        orbitRing2.rotation.z -= 0.001;
      }

      // Update ledger-close consensus shockwave ring
      if (shockProgress < 1.0) {
        shockProgress = Math.min(1.0, shockProgress + 0.022);
        const s = 1 + shockProgress * 0.42;
        shockRing.scale.set(s, s, 1);
        shockMat.opacity = (1 - shockProgress) * 0.42;
      } else {
        shockMat.opacity = 0;
      }

      // Selected node 3D highlight marker + pulsing reticle
      const sel = selectedNodeRef.current;
      if (sel) {
        const tipR = sel.isUnl ? RADIUS * 1.092 : sel.isValidator ? RADIUS * 1.062 : RADIUS * 1.024;
        const pos = latLonToVector3(sel.lat, sel.lon, tipR);
        selectionMarker.position.copy(pos);
        selectionMarker.visible = true;

        selectionRing.position.copy(pos);
        selectionRing.quaternion.setFromUnitVectors(ringNormalZ, tempUnitPos.copy(pos).normalize());
        const s = 1 + Math.sin(pulseTick) * 0.22;
        selectionRing.scale.set(s, s, 1);
        selectionRing.visible = true;
      } else {
        selectionMarker.visible = false;
        selectionRing.visible = false;
      }

      // Animate geodesic arcs & traveling photon packets
      arcGroup.visible = showArcsRef.current;
      for (let i = activeArcs.length - 1; i >= 0; i--) {
        const item = activeArcs[i];
        item.t = Math.min(1, item.t + item.speed);
        item.curve.getPoint(item.t, item.packet.position);
        item.life -= 0.009;
        item.lineMat.opacity = Math.max(0, Math.min(0.75, item.life * 0.78));
        item.packetMat.opacity = Math.max(0, Math.min(1, (1 - Math.abs(item.t - 0.5) * 1.6) * item.life * 1.4));
        if (item.life <= 0) {
          arcGroup.remove(item.line);
          arcGroup.remove(item.packet);
          item.line.geometry.dispose();
          item.lineMat.dispose();
          item.packetMat.dispose();
          activeArcs.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      unsubBus();
      resizeObs.disconnect();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      for (const a of activeArcs) {
        a.line.geometry.dispose();
        a.lineMat.dispose();
        a.packetMat.dispose();
      }
      ptsGeoRef.current = null;
      pillarsGeoRef.current = null;
      earthTex?.albedo.dispose();
      earthTex?.specular.dispose();
      glowSpriteTex?.dispose();
      starGeo.dispose();
      starMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      orbitGeo1.dispose();
      orbitMat1.dispose();
      orbitGeo2.dispose();
      orbitMat2.dispose();
      shockGeo.dispose();
      shockMat.dispose();
      pillarsGeo.dispose();
      pillarsMat.dispose();
      ptsGeo.dispose();
      ptsMat.dispose();
      packetGeo.dispose();
      markerGeo.dispose();
      markerMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="hud-panel rounded-xl relative overflow-hidden h-[calc(100vh-146px)] min-h-[500px] flex flex-col">
      {/* Top Globe Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800/80 z-10 bg-panel/80 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <Globe2 className="w-4 h-4 text-cyan-400" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
              3D Holographic XRPL Validator &amp; Consensus Globe
            </h2>
            <p className="text-[11px] text-slate-400">
              Drag to orbit • Scroll to zoom • Hover for quick ID • Click any beacon to inspect telemetry
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          {/* Node Layer Filter Pills */}
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'unl', label: 'UNL' },
              { id: 'validators', label: 'Validators' },
              { id: 'peers', label: 'Peers' },
            ] as Array<{ id: GlobeNodeFilter; label: string }>
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setNodeFilter(f.id)}
              className={`px-2 py-1 rounded-lg border transition-colors ${
                nodeFilter === f.id
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          <button
            type="button"
            onClick={() => setShowArcs((v) => !v)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors ${
              showArcs
                ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200'
                : 'bg-slate-900/80 border-slate-800 text-slate-400'
            }`}
            title="Toggle live consensus & whale payment arcs"
          >
            <Activity className="w-3 h-3" />
            Arcs {showArcs ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={() => {
              targetCameraZRef.current = Math.max(2.35, targetCameraZRef.current - 0.55);
            }}
            className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:border-cyan-400/50"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              targetCameraZRef.current = Math.min(7.2, targetCameraZRef.current + 0.55);
            }}
            className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:border-cyan-400/50"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={resetCamera}
            className="px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:border-cyan-400/50"
            title="Reset orbital camera"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={() => {
              targetRotationRef.current = null;
              setFocusedLabel(null);
              setAutoRotate((v) => !v);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:border-cyan-400/50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            {autoRotate ? 'Orbit ON' : 'Orbit OFF'}
          </button>
        </div>
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

        {/* Legend */}
        <div className="ml-auto flex items-center gap-3 pl-3 shrink-0 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> UNL
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-400" /> Validator
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400" /> Peer
          </span>
        </div>
      </div>

      {/* Main Split Area: 3D Globe + Right-Side Node Details Panel */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <div className="flex-1 relative min-w-0">
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          {/* Floating Live Hover Tooltip */}
          {hoverInfo && (
            <div
              className="pointer-events-none absolute z-20 px-2.5 py-1.5 rounded-lg bg-slate-950/95 border border-cyan-400/50 shadow-xl font-mono text-[11px] max-w-[230px]"
              style={{
                left: Math.max(12, Math.min(hoverInfo.x + 14, (mountRef.current?.clientWidth ?? 600) - 240)),
                top: Math.max(12, hoverInfo.y - 46),
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    hoverInfo.node.isUnl
                      ? 'bg-emerald-400'
                      : hoverInfo.node.isValidator
                        ? 'bg-purple-400'
                        : 'bg-cyan-400'
                  }`}
                />
                <span className="text-white font-semibold truncate">{hoverInfo.node.label}</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                {hoverInfo.node.country || 'Global'}
                {hoverInfo.node.version ? ` • ${hoverInfo.node.version}` : ''}
              </div>
            </div>
          )}

          {/* Floating Telemetry Overlay */}
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-3">
            <div className="bg-slate-950/85 backdrop-blur border border-cyan-500/25 rounded-lg px-3.5 py-2.5 font-mono text-xs flex items-center gap-5">
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Visible Beacons</div>
                <div className="text-cyan-300 font-semibold tabular-nums">
                  {globeNodes.length}
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
              {!selectedNode && <span className="text-cyan-300/80">• Click any beacon to inspect</span>}
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
                  Showing regional XRPL validator hub coordinates. Live VHS peer topology metrics populate automatically once topology sync completes.
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
