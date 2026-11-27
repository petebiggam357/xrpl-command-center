import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  CandlestickChart,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getXrplBridge } from '../services/xrplBridge';
import {
  computeBollingerBands,
  computeEma,
  computeMacd,
  computeRsi,
  computeSma,
  computeTechnicalSummary,
  computeVwap,
  formatChartPrice,
  toHeikinAshi,
  type ChartTimeframe,
  type MarketOhlcResponse,
  type OhlcCandle,
} from '../shared/chartIndicators';
import type { PriceAlertRule, TokenOnLedgerReport, TokenRecord } from '../shared/types';
import { formatCompactNumber } from '../shared/xrplCodec';

interface DexChartPanelProps {
  selectedToken: TokenRecord | null;
  tokenOnLedgerReport: TokenOnLedgerReport | null;
  priceAlerts: PriceAlertRule[];
  xrpUsdSpot: number | null;
}

type ChartStyle = 'candles' | 'heikin-ashi' | 'area';

function formatCandleTime(unixSec: number, tf: ChartTimeframe): string {
  const d = new Date(unixSec * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  if (tf === '1d') return `${mm}/${dd}`;
  return `${mm}/${dd} ${hh}:${mi}`;
}

export const DexChartPanel: React.FC<DexChartPanelProps> = ({
  selectedToken,
  tokenOnLedgerReport,
  priceAlerts,
  xrpUsdSpot,
}) => {
  const [pairMode, setPairMode] = useState<'xrp-usd' | 'token-xrp'>('xrp-usd');
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('1h');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('candles');

  // Toggleable indicator overlays & oscillator sub-panes
  const [showEma921, setShowEma921] = useState(true);
  const [showEma50, setShowEma50] = useState(false);
  const [showSma20, setShowSma20] = useState(false);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showVwap, setShowVwap] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showRsi, setShowRsi] = useState(true);
  const [showMacd, setShowMacd] = useState(true);

  const [ohlcData, setOhlcData] = useState<MarketOhlcResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Viewport zoom/pan state (number of visible bars + offset from latest bar)
  const [visibleBars, setVisibleBars] = useState(90);
  const [panOffset, setPanOffset] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverYRatio, setHoverYRatio] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rsiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const macdCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<{ active: boolean; startX: number; startPan: number }>({
    active: false,
    startX: 0,
    startPan: 0,
  });

  // Automatically switch to token/XRP whenever user selects a new token
  useEffect(() => {
    if (selectedToken) {
      setPairMode('token-xrp');
    } else {
      setPairMode('xrp-usd');
    }
  }, [selectedToken?.id]);

  // Observe responsive container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const next = Math.max(320, Math.floor(el.clientWidth));
      setContainerWidth(next);
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => update());
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, []);

  const fetchCandles = useCallback(async () => {
    const api = getXrplBridge();
    setLoading(true);
    try {
      const useToken = pairMode === 'token-xrp' && selectedToken !== null;
      const resp = await api.fetchMarketOhlc({
        pairType: useToken ? 'token-xrp' : 'xrp-usd',
        currency: useToken ? selectedToken.currency : undefined,
        currencyRaw: useToken ? selectedToken.currencyRaw : undefined,
        issuer: useToken ? selectedToken.issuer : undefined,
        timeframe,
        bars: 180,
      });
      setOhlcData(resp);
      setPanOffset(0);
      setHoverIdx(null);
    } catch (err) {
      setOhlcData({
        pairLabel:
          pairMode === 'token-xrp' && selectedToken
            ? `${selectedToken.currency} / XRP`
            : 'XRP / USD',
        quoteSymbol: pairMode === 'token-xrp' && selectedToken ? 'XRP' : 'USD',
        timeframe,
        source: 'error',
        fetchedAt: Date.now(),
        candles: [],
        error: err instanceof Error ? err.message : 'Failed to load OHLCV data',
      });
    } finally {
      setLoading(false);
    }
  }, [pairMode, selectedToken, timeframe]);

  useEffect(() => {
    void fetchCandles();
  }, [fetchCandles]);

  // Precompute transformed candles & all indicator series
  const computed = useMemo(() => {
    const rawCandles: OhlcCandle[] = ohlcData?.candles ?? [];
    const displayCandles = chartStyle === 'heikin-ashi' ? toHeikinAshi(rawCandles) : rawCandles;
    const closes = rawCandles.map((c) => c.close);

    const sma20 = computeSma(closes, 20);
    const ema9 = computeEma(closes, 9);
    const ema21 = computeEma(closes, 21);
    const ema50 = computeEma(closes, 50);
    const bb = computeBollingerBands(closes, 20, 2);
    const vwap = computeVwap(rawCandles);
    const rsi = computeRsi(closes, 14);
    const macd = computeMacd(closes, 12, 26, 9);
    const summary = computeTechnicalSummary(rawCandles);

    return {
      rawCandles,
      displayCandles,
      sma20,
      ema9,
      ema21,
      ema50,
      bb,
      vwap,
      rsi,
      macd,
      summary,
    };
  }, [ohlcData, chartStyle]);

  // Compute visible slice indices
  const sliceBounds = useMemo(() => {
    const total = computed.rawCandles.length;
    if (total === 0) return { start: 0, end: 0, count: 0 };
    const count = Math.min(total, Math.max(20, visibleBars));
    const maxPan = Math.max(0, total - count);
    const clampedPan = Math.max(0, Math.min(maxPan, panOffset));
    const end = total - clampedPan;
    const start = Math.max(0, end - count);
    return { start, end, count: end - start };
  }, [computed.rawCandles.length, visibleBars, panOffset]);

  // Active candle (hovered or latest) for HUD readout
  const activeIdx = useMemo(() => {
    const total = computed.rawCandles.length;
    if (total === 0) return null;
    if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < total) return hoverIdx;
    return total - 1;
  }, [computed.rawCandles.length, hoverIdx]);

  const activeCandle = activeIdx !== null ? computed.rawCandles[activeIdx] : null;
  const quoteSymbol = ohlcData?.quoteSymbol ?? (pairMode === 'token-xrp' && selectedToken ? 'XRP' : 'USD');
  const pricePrefix = quoteSymbol === 'USD' ? '$' : '';
  const priceSuffix = quoteSymbol === 'USD' ? '' : ` ${quoteSymbol}`;

  const PAD_LEFT = 14;
  const PAD_RIGHT = 74;

  // Render Main Price + Overlay + Volume Canvas
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = containerWidth;
    const h = 300;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { start, end, count } = sliceBounds;
    if (count === 0) return;

    const padTop = 16;
    const padBottom = 24;
    const pw = Math.max(80, w - PAD_LEFT - PAD_RIGHT);
    const volHeight = showVolume ? 52 : 0;
    const priceHeight = Math.max(90, h - padTop - padBottom - volHeight - (showVolume ? 6 : 0));

    // Determine visible min/max price across candles & active overlays
    let minP = Infinity;
    let maxP = -Infinity;
    let maxVol = 0;

    for (let i = start; i < end; i++) {
      const c = computed.displayCandles[i];
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
      if (c.volume > maxVol) maxVol = c.volume;

      if (showBollinger) {
        const bu = computed.bb.upper[i];
        const bl = computed.bb.lower[i];
        if (bu !== null && bu > maxP) maxP = bu;
        if (bl !== null && bl < minP) minP = bl;
      }
      if (showEma921) {
        const e9 = computed.ema9[i];
        const e21 = computed.ema21[i];
        if (e9 !== null) {
          if (e9 > maxP) maxP = e9;
          if (e9 < minP) minP = e9;
        }
        if (e21 !== null) {
          if (e21 > maxP) maxP = e21;
          if (e21 < minP) minP = e21;
        }
      }
      if (showEma50) {
        const e50 = computed.ema50[i];
        if (e50 !== null) {
          if (e50 > maxP) maxP = e50;
          if (e50 < minP) minP = e50;
        }
      }
      if (showSma20) {
        const s20 = computed.sma20[i];
        if (s20 !== null) {
          if (s20 > maxP) maxP = s20;
          if (s20 < minP) minP = s20;
        }
      }
      if (showVwap) {
        const vw = computed.vwap[i];
        if (vw !== null) {
          if (vw > maxP) maxP = vw;
          if (vw < minP) minP = vw;
        }
      }
    }

    if (!Number.isFinite(minP) || !Number.isFinite(maxP)) return;
    if (maxP === minP) {
      maxP *= 1.01;
      minP *= 0.99;
    }
    const padRange = (maxP - minP) * 0.07;
    minP = Math.max(0, minP - padRange);
    maxP += padRange;

    const stepX = pw / count;
    const xOf = (globalIdx: number) => PAD_LEFT + (globalIdx - start + 0.5) * stepX;
    const yOf = (price: number) => padTop + (1 - (price - minP) / Math.max(1e-12, maxP - minP)) * priceHeight;

    // Horizontal gridlines & right-side price axis labels
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';

    const gridRows = 5;
    for (let r = 0; r <= gridRows; r++) {
      const gy = padTop + (priceHeight / gridRows) * r;
      const gp = maxP - ((maxP - minP) / gridRows) * r;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, gy);
      ctx.lineTo(w - PAD_RIGHT, gy);
      ctx.stroke();
      ctx.fillText(`${pricePrefix}${formatChartPrice(gp)}`, w - PAD_RIGHT + 6, gy + 3);
    }

    // Vertical time gridlines
    const labelStride = Math.max(1, Math.floor(count / 6));
    ctx.textAlign = 'center';
    for (let i = start; i < end; i += labelStride) {
      const gx = xOf(i);
      ctx.beginPath();
      ctx.moveTo(gx, padTop);
      ctx.lineTo(gx, h - padBottom);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.fillText(formatCandleTime(computed.rawCandles[i].time, timeframe), gx, h - 7);
    }

    // Volume histogram at bottom of main pane
    if (showVolume && maxVol > 0) {
      const volBaseY = h - padBottom;
      const barW = Math.max(1.5, Math.min(12, stepX * 0.65));
      for (let i = start; i < end; i++) {
        const c = computed.rawCandles[i];
        const vh = (c.volume / maxVol) * volHeight;
        const up = c.close >= c.open;
        ctx.fillStyle = up ? 'rgba(16, 185, 129, 0.28)' : 'rgba(244, 63, 94, 0.28)';
        ctx.fillRect(xOf(i) - barW / 2, volBaseY - vh, barW, vh);
      }
    }

    // Bollinger Bands Cloud + Lines
    if (showBollinger) {
      ctx.beginPath();
      let started = false;
      const lowerPts: Array<{ x: number; y: number }> = [];
      for (let i = start; i < end; i++) {
        const bu = computed.bb.upper[i];
        const bl = computed.bb.lower[i];
        if (bu !== null && bl !== null) {
          const x = xOf(i);
          if (!started) {
            ctx.moveTo(x, yOf(bu));
            started = true;
          } else {
            ctx.lineTo(x, yOf(bu));
          }
          lowerPts.push({ x, y: yOf(bl) });
        }
      }
      if (started && lowerPts.length > 1) {
        for (let k = lowerPts.length - 1; k >= 0; k--) {
          ctx.lineTo(lowerPts[k].x, lowerPts[k].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(34, 211, 238, 0.07)';
        ctx.fill();
      }

      const drawBandLine = (series: Array<number | null>, color: string, dashed = false) => {
        ctx.beginPath();
        let s = false;
        for (let i = start; i < end; i++) {
          const v = series[i];
          if (v === null) continue;
          if (!s) {
            ctx.moveTo(xOf(i), yOf(v));
            s = true;
          } else {
            ctx.lineTo(xOf(i), yOf(v));
          }
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        if (dashed) ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      drawBandLine(computed.bb.upper, 'rgba(34, 211, 238, 0.45)');
      drawBandLine(computed.bb.middle, 'rgba(34, 211, 238, 0.25)', true);
      drawBandLine(computed.bb.lower, 'rgba(34, 211, 238, 0.45)');
    }

    // Price Series: Candles / Heikin-Ashi / Area
    if (chartStyle === 'area') {
      ctx.beginPath();
      for (let i = start; i < end; i++) {
        const x = xOf(i);
        const y = yOf(computed.rawCandles[i].close);
        if (i === start) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.lineTo(xOf(end - 1), padTop + priceHeight);
      ctx.lineTo(xOf(start), padTop + priceHeight);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + priceHeight);
      grad.addColorStop(0, 'rgba(34, 211, 238, 0.30)');
      grad.addColorStop(1, 'rgba(34, 211, 238, 0.01)');
      ctx.fillStyle = grad;
      ctx.fill();
    } else {
      const bodyW = Math.max(2, Math.min(13, stepX * 0.68));
      for (let i = start; i < end; i++) {
        const c = computed.displayCandles[i];
        const x = xOf(i);
        const yH = yOf(c.high);
        const yL = yOf(c.low);
        const yO = yOf(c.open);
        const yC = yOf(c.close);
        const up = c.close >= c.open;
        const color = up ? '#10b981' : '#f43f5e';

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, yH);
        ctx.lineTo(x, yL);
        ctx.stroke();

        // Body
        const top = Math.min(yO, yC);
        const bodyH = Math.max(1.5, Math.abs(yC - yO));
        ctx.fillStyle = color;
        ctx.fillRect(x - bodyW / 2, top, bodyW, bodyH);
      }
    }

    // Helper for moving average / VWAP overlays
    const drawOverlay = (series: Array<number | null>, color: string, width = 1.4, dashed = false) => {
      ctx.beginPath();
      let started = false;
      for (let i = start; i < end; i++) {
        const v = series[i];
        if (v === null) continue;
        const x = xOf(i);
        const y = yOf(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dashed) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (showSma20) drawOverlay(computed.sma20, '#38bdf8', 1.3, true);
    if (showEma921) {
      drawOverlay(computed.ema9, '#fbbf24', 1.5);
      drawOverlay(computed.ema21, '#a78bfa', 1.5);
    }
    if (showEma50) drawOverlay(computed.ema50, '#60a5fa', 1.5);
    if (showVwap) drawOverlay(computed.vwap, '#e879f9', 1.4, true);

    // Plot XRP Price Alerts directly on XRP/USD chart when in range
    if (quoteSymbol === 'USD' && priceAlerts.length > 0) {
      for (const alert of priceAlerts) {
        if (alert.symbol !== 'XRP') continue;
        if (alert.targetUsd < minP || alert.targetUsd > maxP) continue;
        const ay = yOf(alert.targetUsd);
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = alert.triggeredAt ? '#34d399' : '#f59e0b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD_LEFT, ay);
        ctx.lineTo(w - PAD_RIGHT, ay);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = alert.triggeredAt ? '#059669' : '#d97706';
        ctx.fillRect(PAD_LEFT + 4, ay - 14, 98, 13);
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`ALERT $${alert.targetUsd.toFixed(2)}`, PAD_LEFT + 8, ay - 4);
      }
    }

    // Current Last Price horizontal reference line + right-axis pill
    const lastCandle = computed.rawCandles[computed.rawCandles.length - 1];
    if (lastCandle) {
      const ly = Math.max(padTop, Math.min(padTop + priceHeight, yOf(lastCandle.close)));
      const isUp = lastCandle.close >= lastCandle.open;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = isUp ? 'rgba(16, 185, 129, 0.65)' : 'rgba(244, 63, 94, 0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, ly);
      ctx.lineTo(w - PAD_RIGHT, ly);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = isUp ? '#059669' : '#e11d48';
      ctx.fillRect(w - PAD_RIGHT + 2, ly - 9, PAD_RIGHT - 4, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${pricePrefix}${formatChartPrice(lastCandle.close)}`, w - PAD_RIGHT + 6, ly + 3);
    }

    // Interactive Crosshair
    if (hoverIdx !== null && hoverIdx >= start && hoverIdx < end) {
      const cx = xOf(hoverIdx);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, padTop);
      ctx.lineTo(cx, h - padBottom);
      ctx.stroke();

      if (hoverYRatio !== null && hoverYRatio >= 0 && hoverYRatio <= 1) {
        const cy = padTop + hoverYRatio * priceHeight;
        const hoverPrice = maxP - hoverYRatio * (maxP - minP);
        ctx.beginPath();
        ctx.moveTo(PAD_LEFT, cy);
        ctx.lineTo(w - PAD_RIGHT, cy);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#334155';
        ctx.fillRect(w - PAD_RIGHT + 2, cy - 9, PAD_RIGHT - 4, 18);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${pricePrefix}${formatChartPrice(hoverPrice)}`, w - PAD_RIGHT + 6, cy + 3);
      } else {
        ctx.restore();
      }
    }
  }, [
    containerWidth,
    computed,
    sliceBounds,
    chartStyle,
    timeframe,
    showEma921,
    showEma50,
    showSma20,
    showBollinger,
    showVwap,
    showVolume,
    hoverIdx,
    hoverYRatio,
    priceAlerts,
    quoteSymbol,
    pricePrefix,
  ]);

  // Render RSI(14) Sub-Pane
  useEffect(() => {
    if (!showRsi) return;
    const canvas = rsiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = containerWidth;
    const h = 84;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { start, end, count } = sliceBounds;
    if (count === 0) return;

    const padTop = 10;
    const padBottom = 10;
    const pw = Math.max(80, w - PAD_LEFT - PAD_RIGHT);
    const ph = h - padTop - padBottom;
    const stepX = pw / count;
    const xOf = (idx: number) => PAD_LEFT + (idx - start + 0.5) * stepX;
    const yOf = (v: number) => padTop + (1 - Math.max(0, Math.min(100, v)) / 100) * ph;

    // 70-30 shaded neutral band
    ctx.fillStyle = 'rgba(167, 139, 250, 0.08)';
    ctx.fillRect(PAD_LEFT, yOf(70), pw, yOf(30) - yOf(70));

    // 70, 50, 30 lines
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    for (const lvl of [70, 50, 30]) {
      const y = yOf(lvl);
      ctx.save();
      ctx.setLineDash(lvl === 50 ? [2, 3] : [4, 3]);
      ctx.strokeStyle =
        lvl === 70
          ? 'rgba(244, 63, 94, 0.4)'
          : lvl === 30
            ? 'rgba(16, 185, 129, 0.4)'
            : 'rgba(148, 163, 184, 0.2)';
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, y);
      ctx.lineTo(w - PAD_RIGHT, y);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(String(lvl), w - PAD_RIGHT + 6, y + 3);
    }

    // RSI Curve
    ctx.beginPath();
    let started = false;
    for (let i = start; i < end; i++) {
      const val = computed.rsi[i];
      if (val === null) continue;
      if (!started) {
        ctx.moveTo(xOf(i), yOf(val));
        started = true;
      } else {
        ctx.lineTo(xOf(i), yOf(val));
      }
    }
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Synced vertical crosshair
    if (hoverIdx !== null && hoverIdx >= start && hoverIdx < end) {
      const cx = xOf(hoverIdx);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.beginPath();
      ctx.moveTo(cx, padTop);
      ctx.lineTo(cx, h - padBottom);
      ctx.stroke();
      ctx.restore();
    }
  }, [showRsi, containerWidth, computed.rsi, sliceBounds, hoverIdx]);

  // Render MACD(12, 26, 9) Sub-Pane
  useEffect(() => {
    if (!showMacd) return;
    const canvas = macdCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = containerWidth;
    const h = 88;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { start, end, count } = sliceBounds;
    if (count === 0) return;

    const padTop = 10;
    const padBottom = 10;
    const pw = Math.max(80, w - PAD_LEFT - PAD_RIGHT);
    const ph = h - padTop - padBottom;
    const stepX = pw / count;
    const xOf = (idx: number) => PAD_LEFT + (idx - start + 0.5) * stepX;

    let maxAbs = 0;
    for (let i = start; i < end; i++) {
      const m = computed.macd.macd[i];
      const s = computed.macd.signal[i];
      const hst = computed.macd.histogram[i];
      if (m !== null) maxAbs = Math.max(maxAbs, Math.abs(m));
      if (s !== null) maxAbs = Math.max(maxAbs, Math.abs(s));
      if (hst !== null) maxAbs = Math.max(maxAbs, Math.abs(hst));
    }
    if (maxAbs === 0) maxAbs = 1;
    maxAbs *= 1.15;

    const yOf = (v: number) => padTop + ((maxAbs - v) / (2 * maxAbs)) * ph;
    const zeroY = yOf(0);

    // Zero baseline
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, zeroY);
    ctx.lineTo(w - PAD_RIGHT, zeroY);
    ctx.stroke();

    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('0', w - PAD_RIGHT + 6, zeroY + 3);

    // Histogram bars
    const barW = Math.max(1.5, Math.min(10, stepX * 0.62));
    for (let i = start; i < end; i++) {
      const hst = computed.macd.histogram[i];
      if (hst === null) continue;
      const x = xOf(i);
      const y = yOf(hst);
      ctx.fillStyle = hst >= 0 ? 'rgba(16, 185, 129, 0.55)' : 'rgba(244, 63, 94, 0.55)';
      ctx.fillRect(x - barW / 2, Math.min(zeroY, y), barW, Math.max(1, Math.abs(y - zeroY)));
    }

    // MACD + Signal lines
    const drawSeries = (arr: Array<number | null>, color: string) => {
      ctx.beginPath();
      let started = false;
      for (let i = start; i < end; i++) {
        const v = arr[i];
        if (v === null) continue;
        if (!started) {
          ctx.moveTo(xOf(i), yOf(v));
          started = true;
        } else {
          ctx.lineTo(xOf(i), yOf(v));
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    };

    drawSeries(computed.macd.macd, '#22d3ee');
    drawSeries(computed.macd.signal, '#fbbf24');

    // Synced vertical crosshair
    if (hoverIdx !== null && hoverIdx >= start && hoverIdx < end) {
      const cx = xOf(hoverIdx);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.beginPath();
      ctx.moveTo(cx, padTop);
      ctx.lineTo(cx, h - padBottom);
      ctx.stroke();
      ctx.restore();
    }
  }, [showMacd, containerWidth, computed.macd, sliceBounds, hoverIdx]);

  // Pointer handlers for crosshair, drag-to-pan, and wheel zoom
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const pw = Math.max(80, rect.width - PAD_LEFT - PAD_RIGHT);

    if (dragStateRef.current.active && sliceBounds.count > 0) {
      const dx = e.clientX - dragStateRef.current.startX;
      const barsMoved = Math.round((dx / pw) * sliceBounds.count);
      const maxPan = Math.max(0, computed.rawCandles.length - sliceBounds.count);
      setPanOffset(Math.max(0, Math.min(maxPan, dragStateRef.current.startPan + barsMoved)));
      return;
    }

    if (sliceBounds.count === 0) return;
    const ratioX = (relX - PAD_LEFT) / pw;
    if (ratioX >= 0 && ratioX <= 1) {
      const localIdx = Math.min(sliceBounds.count - 1, Math.max(0, Math.floor(ratioX * sliceBounds.count)));
      setHoverIdx(sliceBounds.start + localIdx);
    } else {
      setHoverIdx(null);
    }

    const priceH = Math.max(90, 300 - 16 - 24 - (showVolume ? 58 : 0));
    const ratioY = (relY - 16) / priceH;
    setHoverYRatio(ratioY >= 0 && ratioY <= 1 ? ratioY : null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    dragStateRef.current = { active: true, startX: e.clientX, startPan: panOffset };
  };

  const handleMouseUpOrLeave = (clearHover: boolean) => {
    dragStateRef.current.active = false;
    if (clearHover) {
      setHoverIdx(null);
      setHoverYRatio(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (computed.rawCandles.length === 0) return;
    const delta = e.deltaY > 0 ? 12 : -12;
    setVisibleBars((prev) => Math.max(24, Math.min(180, prev + delta)));
  };

  const activeRsi = activeIdx !== null ? computed.rsi[activeIdx] : null;
  const activeMacd = activeIdx !== null ? computed.macd.macd[activeIdx] : null;
  const activeMacdSig = activeIdx !== null ? computed.macd.signal[activeIdx] : null;
  const activeMacdHist = activeIdx !== null ? computed.macd.histogram[activeIdx] : null;
  const activeEma9 = activeIdx !== null ? computed.ema9[activeIdx] : null;
  const activeEma21 = activeIdx !== null ? computed.ema21[activeIdx] : null;
  const activeVwap = activeIdx !== null ? computed.vwap[activeIdx] : null;

  const { summary } = computed;

  return (
    <div className="hud-panel rounded-xl p-4 space-y-3">
      {/* Header Row: Pair Switcher, Chart Style, Timeframe & Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <CandlestickChart className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Pro DEX Charts &amp; Technical Indicators
            </h3>
          </div>

          {/* Pair Switcher */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setPairMode('xrp-usd')}
              className={`px-2.5 py-1 transition-colors ${
                pairMode === 'xrp-usd' || !selectedToken
                  ? 'bg-cyan-500/25 text-cyan-200 font-semibold'
                  : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              XRP / USD
            </button>
            {selectedToken && (
              <button
                type="button"
                onClick={() => setPairMode('token-xrp')}
                className={`px-2.5 py-1 transition-colors border-l border-slate-700 ${
                  pairMode === 'token-xrp'
                    ? 'bg-emerald-500/25 text-emerald-200 font-semibold'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                {selectedToken.currency} / XRP
              </button>
            )}
          </div>

          {/* Source Badge */}
          {ohlcData && (
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-400">
              {ohlcData.source}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Chart Style */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700 text-[10px] font-mono">
            {(
              [
                ['candles', 'Candles'],
                ['heikin-ashi', 'Heikin-Ashi'],
                ['area', 'Area'],
              ] as Array<[ChartStyle, string]>
            ).map(([style, label]) => (
              <button
                key={style}
                type="button"
                onClick={() => setChartStyle(style)}
                className={`px-2 py-1 ${
                  chartStyle === style
                    ? 'bg-cyan-500/25 text-cyan-200'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Timeframe Selector */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700 text-[10px] font-mono">
            {(['15m', '1h', '4h', '1d'] as ChartTimeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 uppercase ${
                  timeframe === tf
                    ? 'bg-violet-500/25 text-violet-200 font-semibold'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Zoom & Refresh */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setVisibleBars((v) => Math.max(24, v - 16))}
              title="Zoom In"
              className="p-1 rounded bg-slate-950 border border-slate-700 text-slate-300 hover:border-cyan-400/60"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setVisibleBars((v) => Math.min(180, v + 16))}
              title="Zoom Out"
              className="p-1 rounded bg-slate-950 border border-slate-700 text-slate-300 hover:border-cyan-400/60"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setVisibleBars(90);
                setPanOffset(0);
              }}
              title="Reset Zoom & Pan"
              className="p-1 rounded bg-slate-950 border border-slate-700 text-slate-300 hover:border-cyan-400/60"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void fetchCandles()}
              disabled={loading}
              title="Refresh Candles"
              className="p-1 rounded bg-slate-950 border border-slate-700 text-slate-300 hover:border-cyan-400/60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Indicator Toggle Ribbon + Technical Bias Pill */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-slate-800/80">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <span className="text-slate-500 uppercase mr-1">Indicators:</span>
          {[
            { label: 'EMA 9/21', active: showEma921, toggle: () => setShowEma921((v) => !v), tone: 'amber' },
            { label: 'EMA 50', active: showEma50, toggle: () => setShowEma50((v) => !v), tone: 'blue' },
            { label: 'SMA 20', active: showSma20, toggle: () => setShowSma20((v) => !v), tone: 'sky' },
            { label: 'Bollinger (20,2)', active: showBollinger, toggle: () => setShowBollinger((v) => !v), tone: 'cyan' },
            { label: 'VWAP', active: showVwap, toggle: () => setShowVwap((v) => !v), tone: 'fuchsia' },
            { label: 'Volume', active: showVolume, toggle: () => setShowVolume((v) => !v), tone: 'emerald' },
            { label: 'RSI (14)', active: showRsi, toggle: () => setShowRsi((v) => !v), tone: 'violet' },
            { label: 'MACD (12,26,9)', active: showMacd, toggle: () => setShowMacd((v) => !v), tone: 'teal' },
          ].map((ind) => (
            <button
              key={ind.label}
              type="button"
              onClick={ind.toggle}
              className={`px-2 py-0.5 rounded border transition-colors ${
                ind.active
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-100'
                  : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
            >
              {ind.label}
            </button>
          ))}
        </div>

        {/* Technical Signal Summary Pill */}
        {computed.rawCandles.length > 0 && (
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-semibold ${
                summary.bias === 'BULLISH'
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                  : summary.bias === 'BEARISH'
                    ? 'bg-rose-500/15 border-rose-400/40 text-rose-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              TA: {summary.bias}
            </span>
            {summary.rsi14 !== null && (
              <span
                className={`px-2 py-0.5 rounded border ${
                  summary.rsiState === 'OVERBOUGHT'
                    ? 'bg-rose-500/15 border-rose-400/40 text-rose-300'
                    : summary.rsiState === 'OVERSOLD'
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-violet-300'
                }`}
              >
                RSI {summary.rsi14.toFixed(1)} ({summary.rsiState})
              </span>
            )}
            <span className="text-slate-500 hidden sm:inline">Indicators only · NFA</span>
          </div>
        )}
      </div>

      {/* Live OHLCV + Hovered Candle Readout Bar */}
      {activeCandle && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono px-2 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800/90 tabular-nums">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-400">{formatCandleTime(activeCandle.time, timeframe)}</span>
            <span>
              O <strong className="text-slate-200">{pricePrefix}{formatChartPrice(activeCandle.open)}</strong>
            </span>
            <span>
              H <strong className="text-emerald-300">{pricePrefix}{formatChartPrice(activeCandle.high)}</strong>
            </span>
            <span>
              L <strong className="text-rose-300">{pricePrefix}{formatChartPrice(activeCandle.low)}</strong>
            </span>
            <span>
              C{' '}
              <strong className={activeCandle.close >= activeCandle.open ? 'text-emerald-300' : 'text-rose-300'}>
                {pricePrefix}{formatChartPrice(activeCandle.close)}{priceSuffix}
              </strong>
            </span>
            <span className="text-slate-400">
              Vol <strong className="text-cyan-300">{formatCompactNumber(activeCandle.volume)}</strong>
            </span>
            {summary.changePct !== null && (
              <span className={summary.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                Range {summary.changePct >= 0 ? '+' : ''}
                {summary.changePct.toFixed(2)}%
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[10px]">
            {showEma921 && activeEma9 !== null && (
              <span className="text-amber-300">EMA9 {pricePrefix}{formatChartPrice(activeEma9)}</span>
            )}
            {showEma921 && activeEma21 !== null && (
              <span className="text-violet-300">EMA21 {pricePrefix}{formatChartPrice(activeEma21)}</span>
            )}
            {showVwap && activeVwap !== null && (
              <span className="text-fuchsia-300">VWAP {pricePrefix}{formatChartPrice(activeVwap)}</span>
            )}
            {summary.bollingerPercentB !== null && showBollinger && (
              <span className="text-cyan-300">BB %B {(summary.bollingerPercentB * 100).toFixed(0)}%</span>
            )}
          </div>
        </div>
      )}

      {/* Main Chart Viewport */}
      <div ref={containerRef} className="w-full space-y-2 select-none">
        {loading && computed.rawCandles.length === 0 ? (
          <div className="h-[300px] rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-center text-xs font-mono text-cyan-300">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            Fetching live OHLCV candles ({timeframe.toUpperCase()})...
          </div>
        ) : computed.rawCandles.length === 0 ? (
          <div className="h-[240px] rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center text-center px-6 space-y-2">
            <BarChart3 className="w-7 h-7 text-slate-600" />
            <div className="text-xs font-mono text-slate-300">
              {ohlcData?.error || 'No OHLCV candlesticks available for this pair/timeframe yet.'}
            </div>
            <div className="text-[11px] text-slate-500 max-w-lg">
              {pairMode === 'token-xrp' && tokenOnLedgerReport ? (
                <>
                  On-ledger snapshot:{' '}
                  {tokenOnLedgerReport.bids[0]
                    ? `Best Bid ${tokenOnLedgerReport.bids[0].price.toPrecision(4)} XRP`
                    : 'No open CLOB bids'}
                  {tokenOnLedgerReport.amm
                    ? ` • AMM Pool active (${tokenOnLedgerReport.amm.asset1Amount} / ${tokenOnLedgerReport.amm.asset2Amount})`
                    : ''}
                  . Try switching timeframe (`4H` / `1D`) or view live `XRP / USD`.
                </>
              ) : xrpUsdSpot !== null ? (
                <>Live XRP Spot: ${xrpUsdSpot.toFixed(4)} USD. Click Refresh to retry OHLC feed.</>
              ) : (
                <>Verify internet connectivity or switch timeframe (`1H` / `4H` / `1D`).</>
              )}
            </div>
            {pairMode === 'token-xrp' && (
              <button
                type="button"
                onClick={() => setPairMode('xrp-usd')}
                className="px-3 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-xs font-mono text-cyan-200 hover:bg-cyan-500/30"
              >
                Switch to Live XRP / USD Chart
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Price + Overlays + Volume Canvas */}
            <div
              className="relative rounded-xl bg-slate-950/90 border border-slate-800 overflow-hidden cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={() => handleMouseUpOrLeave(false)}
              onMouseLeave={() => handleMouseUpOrLeave(true)}
              onWheel={handleWheel}
            >
              <canvas ref={mainCanvasRef} className="block w-full h-[300px]" />
              <div className="absolute top-2 left-3 pointer-events-none flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <span>Scroll to zoom • Drag to pan</span>
              </div>
            </div>

            {/* RSI(14) Synchronized Sub-Pane */}
            {showRsi && (
              <div className="relative rounded-xl bg-slate-950/90 border border-slate-800 overflow-hidden">
                <div className="absolute top-1.5 left-3 pointer-events-none flex items-center gap-2 text-[10px] font-mono">
                  <Activity className="w-3 h-3 text-violet-400" />
                  <span className="text-violet-300 font-semibold">RSI (14)</span>
                  <span className="text-slate-300 tabular-nums">
                    {activeRsi !== null ? activeRsi.toFixed(2) : '—'}
                  </span>
                  <span className="text-slate-500">OB 70 / OS 30</span>
                </div>
                <canvas ref={rsiCanvasRef} className="block w-full h-[84px]" />
              </div>
            )}

            {/* MACD(12, 26, 9) Synchronized Sub-Pane */}
            {showMacd && (
              <div className="relative rounded-xl bg-slate-950/90 border border-slate-800 overflow-hidden">
                <div className="absolute top-1.5 left-3 pointer-events-none flex flex-wrap items-center gap-3 text-[10px] font-mono tabular-nums">
                  <span className="text-cyan-300 font-semibold">MACD (12, 26, 9)</span>
                  <span className="text-cyan-200">
                    MACD {activeMacd !== null ? formatChartPrice(activeMacd) : '—'}
                  </span>
                  <span className="text-amber-300">
                    Sig {activeMacdSig !== null ? formatChartPrice(activeMacdSig) : '—'}
                  </span>
                  <span
                    className={
                      activeMacdHist !== null && activeMacdHist >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }
                  >
                    Hist {activeMacdHist !== null ? formatChartPrice(activeMacdHist) : '—'}
                  </span>
                </div>
                <canvas ref={macdCanvasRef} className="block w-full h-[88px]" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
