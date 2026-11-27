export type ChartTimeframe = '15m' | '1h' | '4h' | '1d';

export interface OhlcCandle {
  /** Unix timestamp in seconds */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketOhlcRequest {
  pairType: 'xrp-usd' | 'token-xrp';
  currency?: string;
  currencyRaw?: string;
  issuer?: string;
  timeframe: ChartTimeframe;
  bars?: number;
}

export interface MarketOhlcResponse {
  pairLabel: string;
  quoteSymbol: string;
  timeframe: ChartTimeframe;
  source: string;
  fetchedAt: number;
  candles: OhlcCandle[];
  error?: string;
}

export interface BollingerBandSeries {
  upper: Array<number | null>;
  middle: Array<number | null>;
  lower: Array<number | null>;
}

export interface MacdSeries {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
}

export interface TechnicalSummary {
  lastClose: number | null;
  changePct: number | null;
  highRange: number | null;
  lowRange: number | null;
  totalVolume: number;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  rsi14: number | null;
  rsiState: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' | 'N/A';
  macdHistogram: number | null;
  macdTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bollingerPercentB: number | null;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number; // -3..+3 composite indicator alignment
}

/**
 * Simple Moving Average over `period` bars. Returns null for indices < period - 1.
 */
export function computeSma(values: number[], period: number): Array<number | null> {
  if (period <= 0 || values.length === 0) return values.map(() => null);
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      out[i] = sum / period;
    }
  }
  return out;
}

/**
 * Exponential Moving Average seeded with the initial SMA(period).
 */
export function computeEma(values: number[], period: number): Array<number | null> {
  if (period <= 0 || values.length === 0) return values.map(() => null);
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i++) {
    seed += values[i];
  }
  let ema = seed / period;
  out[period - 1] = ema;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * k + ema;
    out[i] = ema;
  }
  return out;
}

/**
 * Bollinger Bands (SMA +/- stdDevMult * population standard deviation).
 */
export function computeBollingerBands(
  values: number[],
  period = 20,
  stdDevMult = 2
): BollingerBandSeries {
  const middle = computeSma(values, period);
  const upper: Array<number | null> = new Array(values.length).fill(null);
  const lower: Array<number | null> = new Array(values.length).fill(null);

  if (period <= 1) return { upper, middle, lower };

  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i];
    if (mean === null) continue;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j] - mean;
      sqSum += diff * diff;
    }
    const std = Math.sqrt(sqSum / period);
    upper[i] = mean + stdDevMult * std;
    lower[i] = mean - stdDevMult * std;
  }

  return { upper, middle, lower };
}

/**
 * Cumulative Volume-Weighted Average Price (VWAP) using Typical Price = (H + L + C) / 3.
 */
export function computeVwap(candles: OhlcCandle[]): Array<number | null> {
  const out: Array<number | null> = new Array(candles.length).fill(null);
  let cumPv = 0;
  let cumVol = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const tp = (c.high + c.low + c.close) / 3;
    const vol = Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0;
    cumPv += tp * vol;
    cumVol += vol;
    out[i] = cumVol > 0 ? cumPv / cumVol : tp;
  }
  return out;
}

/**
 * Wilder's Relative Strength Index (RSI), clamped to [0, 100].
 */
export function computeRsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum += -delta;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) {
      out[i] = avgGain === 0 ? 50 : 100;
    } else {
      const rs = avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

/**
 * MACD (default 12, 26, 9): MACD = EMA(fast) - EMA(slow), Signal = EMA(MACD, signalPeriod), Histogram = MACD - Signal.
 */
export function computeMacd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MacdSeries {
  const fast = computeEma(values, fastPeriod);
  const slow = computeEma(values, slowPeriod);
  const macd: Array<number | null> = new Array(values.length).fill(null);
  const signal: Array<number | null> = new Array(values.length).fill(null);
  const histogram: Array<number | null> = new Array(values.length).fill(null);

  const validMacd: number[] = [];
  const validIdx: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (fast[i] !== null && slow[i] !== null) {
      const m = (fast[i] as number) - (slow[i] as number);
      macd[i] = m;
      validMacd.push(m);
      validIdx.push(i);
    }
  }

  const sigValues = computeEma(validMacd, signalPeriod);
  for (let j = 0; j < validIdx.length; j++) {
    const idx = validIdx[j];
    const sig = sigValues[j];
    if (sig !== null && macd[idx] !== null) {
      signal[idx] = sig;
      histogram[idx] = (macd[idx] as number) - sig;
    }
  }

  return { macd, signal, histogram };
}

/**
 * Heikin-Ashi candle transformation for trend clarity.
 */
export function toHeikinAshi(candles: OhlcCandle[]): OhlcCandle[] {
  if (candles.length === 0) return [];
  const result: OhlcCandle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen =
      i === 0 ? (c.open + c.close) / 2 : (result[i - 1].open + result[i - 1].close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    result.push({
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
    });
  }
  return result;
}

/**
 * Synthesizes an objective multi-indicator snapshot from OHLCV candles.
 */
export function computeTechnicalSummary(candles: OhlcCandle[]): TechnicalSummary {
  if (candles.length === 0) {
    return {
      lastClose: null,
      changePct: null,
      highRange: null,
      lowRange: null,
      totalVolume: 0,
      ema9: null,
      ema21: null,
      ema50: null,
      rsi14: null,
      rsiState: 'N/A',
      macdHistogram: null,
      macdTrend: 'NEUTRAL',
      bollingerPercentB: null,
      bias: 'NEUTRAL',
      score: 0,
    };
  }

  const closes = candles.map((c) => c.close);
  const lastIdx = candles.length - 1;
  const firstOpen = candles[0].open || candles[0].close;
  const lastClose = candles[lastIdx].close;
  const changePct = firstOpen > 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : null;

  let highRange = -Infinity;
  let lowRange = Infinity;
  let totalVolume = 0;
  for (const c of candles) {
    if (c.high > highRange) highRange = c.high;
    if (c.low < lowRange) lowRange = c.low;
    totalVolume += Number.isFinite(c.volume) ? c.volume : 0;
  }

  const ema9Arr = computeEma(closes, 9);
  const ema21Arr = computeEma(closes, 21);
  const ema50Arr = computeEma(closes, 50);
  const rsiArr = computeRsi(closes, 14);
  const macdObj = computeMacd(closes, 12, 26, 9);
  const bb = computeBollingerBands(closes, 20, 2);

  const ema9 = ema9Arr[lastIdx];
  const ema21 = ema21Arr[lastIdx];
  const ema50 = ema50Arr[lastIdx];
  const rsi14 = rsiArr[lastIdx];
  const macdLine = macdObj.macd[lastIdx];
  const macdHistogram = macdObj.histogram[lastIdx];

  const bbU = bb.upper[lastIdx];
  const bbL = bb.lower[lastIdx];
  const bollingerPercentB =
    bbU !== null && bbL !== null && bbU > bbL ? (lastClose - bbL) / (bbU - bbL) : null;

  const rsiState: TechnicalSummary['rsiState'] =
    rsi14 === null ? 'N/A' : rsi14 >= 70 ? 'OVERBOUGHT' : rsi14 <= 30 ? 'OVERSOLD' : 'NEUTRAL';

  const histEps = lastClose > 0 ? lastClose * 1e-6 : 1e-9;
  const macdTrend: TechnicalSummary['macdTrend'] =
    macdHistogram === null
      ? 'NEUTRAL'
      : macdHistogram > histEps
        ? 'BULLISH'
        : macdHistogram < -histEps
          ? 'BEARISH'
          : macdLine !== null && macdLine > 0
            ? 'BULLISH'
            : macdLine !== null && macdLine < 0
              ? 'BEARISH'
              : 'NEUTRAL';

  let score = 0;
  if (ema9 !== null && ema21 !== null) {
    score += ema9 > ema21 ? 1 : ema9 < ema21 ? -1 : 0;
  }
  if (macdTrend === 'BULLISH') score += 1;
  else if (macdTrend === 'BEARISH') score -= 1;
  if (rsi14 !== null) {
    if (rsi14 >= 55 && rsi14 < 75) score += 1;
    else if (rsi14 <= 45 && rsi14 > 25) score -= 1;
  }

  const bias: TechnicalSummary['bias'] =
    score >= 2 ? 'BULLISH' : score <= -2 ? 'BEARISH' : 'NEUTRAL';

  return {
    lastClose,
    changePct,
    highRange: Number.isFinite(highRange) ? highRange : null,
    lowRange: Number.isFinite(lowRange) ? lowRange : null,
    totalVolume,
    ema9,
    ema21,
    ema50,
    rsi14,
    rsiState,
    macdHistogram,
    macdTrend,
    bollingerPercentB,
    bias,
    score,
  };
}

/**
 * Formats a price cleanly across USD ($2.4512) and micro-priced XRPL DEX tokens (0.00004821).
 */
export function formatChartPrice(price: number): string {
  if (!Number.isFinite(price)) return '—';
  const abs = Math.abs(price);
  if (abs === 0) return '0';
  if (abs >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (abs >= 1) return price.toFixed(4);
  if (abs >= 0.01) return price.toFixed(5);
  if (abs >= 0.0001) return price.toFixed(6);
  return price.toPrecision(4);
}
