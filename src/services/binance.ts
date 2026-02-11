/**
 * Binance REST API for historical data (e.g. warming up volatility).
 */

export interface PriceTimePoint {
  time: number;
  price: number;
}

const BINANCE_KLINES_URL =
  "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100";

/** Binance kline candle: [ openTime, open, high, low, close, volume, closeTime, ... ] */
type BinanceKline = [number, string, string, string, string, string, number, ...unknown[]];

/**
 * Fetches the last 100 1-minute klines and returns (time, close price) points
 * for seeding price history and volatility.
 */
export async function fetchHistoricalKlines(): Promise<PriceTimePoint[]> {
  const res = await fetch(BINANCE_KLINES_URL);
  if (!res.ok) throw new Error(`Binance klines: ${res.status}`);
  const data = (await res.json()) as BinanceKline[];
  return data.map((candle) => {
    const openTime = candle[0];
    const close = candle[4];
    const price = typeof close === "string" ? parseFloat(close) : Number(close);
    return { time: openTime, price: Number.isFinite(price) ? price : 0 };
  });
}
