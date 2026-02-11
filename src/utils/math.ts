/**
 * Real-time odds and multiplier utilities for grid betting.
 * Volatility from recent price history, implied probability via z-score, house edge and caps.
 */

export interface PriceTimePoint {
  time: number;
  price: number;
}

const HOUSE_EDGE = 0.9;       // 10% overround: payouts = (1/prob) * 0.90
const MIN_MULTIPLIER = 1.1;
const MAX_MULTIPLIER = 50;
const VOLATILITY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Sample standard deviation of price over the given series.
 */
export function standardDeviation(prices: number[]): number {
  if (prices.length < 2) return 0;
  const n = prices.length;
  const mean = prices.reduce((a, b) => a + b, 0) / n;
  const variance =
    prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/**
 * Volatility (standard deviation of price) over the last `windowMs` of data.
 */
export function getVolatility(
  priceTimeHistory: PriceTimePoint[],
  now: number,
  windowMs: number = VOLATILITY_WINDOW_MS
): number {
  const cutoff = now - windowMs;
  const prices = priceTimeHistory
    .filter((pt) => pt.time >= cutoff)
    .map((pt) => pt.price);
  return standardDeviation(prices);
}

/**
 * Standard normal CDF approximation (Abramowitz and Stegun).
 */
function normCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Two-sided probability of price touching the level (simplified Gaussian).
 * Uses |z| so we get probability of moving that far in either direction.
 */
function touchProbability(z: number): number {
  if (!Number.isFinite(z)) return 0;
  const absZ = Math.abs(z);
  const pOneSide = 1 - normCDF(absZ);
  return Math.min(1, Math.max(0, 2 * pOneSide));
}

/**
 * Z-Score: (CellPrice - CurrentPrice) / (Volatility * sqrt(SecondsToCell))
 */
export function zScore(
  cellPrice: number,
  currentPrice: number,
  volatility: number,
  secondsToCell: number
): number {
  if (secondsToCell <= 0 || volatility <= 0) return 0;
  const denominator = volatility * Math.sqrt(secondsToCell);
  if (denominator <= 0) return 0;
  return (cellPrice - currentPrice) / denominator;
}

/**
 * Multiplier for a cell: (1 / Probability) * houseEdge, capped [MIN_MULTIPLIER, MAX_MULTIPLIER].
 */
export function getCellMultiplier(
  cellMidPrice: number,
  currentPrice: number,
  volatility: number,
  secondsToCell: number,
  houseEdge: number = HOUSE_EDGE
): number {
  if (secondsToCell <= 0) return MIN_MULTIPLIER;
  if (volatility <= 0) return MIN_MULTIPLIER;
  const z = zScore(cellMidPrice, currentPrice, volatility, secondsToCell);
  const prob = touchProbability(z);
  if (prob <= 0) return MAX_MULTIPLIER;
  const raw = 1 / prob;
  const withEdge = raw * houseEdge;
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, withEdge));
}
