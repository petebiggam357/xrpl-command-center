import { describe, expect, it } from 'vitest';
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
  type OhlcCandle,
} from '../src/shared/chartIndicators';

function makeTrendCandles(count: number, startPrice: number, step: number): OhlcCandle[] {
  const out: OhlcCandle[] = [];
  const baseTime = 1_700_000_000;
  for (let i = 0; i < count; i++) {
    const open = Math.max(0.01, startPrice + i * step);
    const close = Math.max(0.01, open + step * 0.8);
    const high = Math.max(open, close) * 1.01;
    const low = Math.min(open, close) * 0.99;
    out.push({
      time: baseTime + i * 3600,
      open,
      high,
      low,
      close,
      volume: 1000 + i * 25,
    });
  }
  return out;
}

describe('v0.2.10-beta Pro DEX Chart Technical Indicators', () => {
  it('computes SMA with exact rolling averages and leading nulls', () => {
    const sma = computeSma([10, 20, 30, 40, 50], 3);
    expect(sma).toEqual([null, null, 20, 30, 40]);
  });

  it('computes EMA seeded with initial SMA and reacts faster than SMA', () => {
    const values = [10, 10, 10, 10, 20, 30];
    const ema3 = computeEma(values, 3);
    const sma3 = computeSma(values, 3);
    expect(ema3[0]).toBeNull();
    expect(ema3[1]).toBeNull();
    expect(ema3[2]).toBeCloseTo(10, 6);
    // On an accelerating upward jump, EMA tracks closer to latest price than SMA
    expect(ema3[5]!).toBeGreaterThan(sma3[5]!);
  });

  it('computes Bollinger Bands with upper > middle > lower on non-flat data and zero width on flat data', () => {
    const flat = new Array(25).fill(2.5);
    const flatBb = computeBollingerBands(flat, 20, 2);
    expect(flatBb.middle[24]).toBeCloseTo(2.5, 6);
    expect(flatBb.upper[24]).toBeCloseTo(2.5, 6);
    expect(flatBb.lower[24]).toBeCloseTo(2.5, 6);

    const oscillating = Array.from({ length: 30 }, (_, i) => 2 + Math.sin(i * 0.6) * 0.3);
    const bb = computeBollingerBands(oscillating, 20, 2);
    expect(bb.upper[29]!).toBeGreaterThan(bb.middle[29]!);
    expect(bb.middle[29]!).toBeGreaterThan(bb.lower[29]!);
  });

  it('computes cumulative VWAP weighted by bar volume', () => {
    const candles: OhlcCandle[] = [
      { time: 1, open: 1, high: 1, low: 1, close: 1, volume: 100 },
      { time: 2, open: 2, high: 2, low: 2, close: 2, volume: 300 },
    ];
    const vwap = computeVwap(candles);
    expect(vwap[0]).toBeCloseTo(1, 6);
    // (1*100 + 2*300) / 400 = 700 / 400 = 1.75
    expect(vwap[1]).toBeCloseTo(1.75, 6);
  });

  it('computes Wilder RSI(14) accurately across uptrends, downtrends, and flat ranges', () => {
    const up = Array.from({ length: 30 }, (_, i) => 1 + i * 0.1);
    const down = Array.from({ length: 30 }, (_, i) => 10 - i * 0.1);
    const flat = new Array(30).fill(5);

    const rsiUp = computeRsi(up, 14);
    const rsiDown = computeRsi(down, 14);
    const rsiFlat = computeRsi(flat, 14);

    expect(rsiUp[13]).toBeNull();
    expect(rsiUp[29]).toBeCloseTo(100, 4);
    expect(rsiDown[29]).toBeCloseTo(0, 4);
    expect(rsiFlat[29]).toBeCloseTo(50, 4);
  });

  it('computes MACD(12, 26, 9) with consistent histogram = macd - signal', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 2 + i * 0.04 + Math.sin(i * 0.4) * 0.12);
    const { macd, signal, histogram } = computeMacd(closes, 12, 26, 9);

    expect(macd[24]).toBeNull();
    expect(macd[25]).not.toBeNull();
    expect(signal[59]).not.toBeNull();
    expect(histogram[59]).toBeCloseTo(macd[59]! - signal[59]!, 8);
  });

  it('transforms candlesticks to Heikin-Ashi preserving valid high/low envelopes', () => {
    const raw = makeTrendCandles(12, 2.0, 0.05);
    const ha = toHeikinAshi(raw);
    expect(ha).toHaveLength(raw.length);
    for (let i = 0; i < ha.length; i++) {
      expect(ha[i].high).toBeGreaterThanOrEqual(Math.max(ha[i].open, ha[i].close));
      expect(ha[i].low).toBeLessThanOrEqual(Math.min(ha[i].open, ha[i].close));
    }
  });

  it('synthesizes technical summary bias and formats USD & micro-priced XRPL tokens cleanly', () => {
    const bullCandles = makeTrendCandles(60, 1.5, 0.03).map((c, i) => ({
      ...c,
      close: c.close + (i > 40 ? (i - 40) * 0.02 : 0),
      high: c.high + (i > 40 ? (i - 40) * 0.02 : 0),
    }));
    const bullSummary = computeTechnicalSummary(bullCandles);
    expect(bullSummary.ema9!).toBeGreaterThan(bullSummary.ema21!);
    expect(bullSummary.macdTrend).toBe('BULLISH');
    expect(bullSummary.bias).toBe('BULLISH');

    const bearCandles = makeTrendCandles(60, 6.0, -0.03).map((c, i) => ({
      ...c,
      close: Math.max(0.1, c.close - (i > 40 ? (i - 40) * 0.03 : 0)),
      low: Math.max(0.09, c.low - (i > 40 ? (i - 40) * 0.03 : 0)),
    }));
    const bearSummary = computeTechnicalSummary(bearCandles);
    expect(bearSummary.ema9!).toBeLessThan(bearSummary.ema21!);
    expect(bearSummary.macdTrend).toBe('BEARISH');
    expect(bearSummary.bias).toBe('BEARISH');

    expect(formatChartPrice(2.45123)).toBe('2.4512');
    expect(formatChartPrice(0.0004821)).toBe('0.000482');
    expect(formatChartPrice(0.000012346)).toBe('0.00001235');
  });
});
