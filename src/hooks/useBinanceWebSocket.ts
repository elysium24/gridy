"use client";

import { fetchHistoricalKlines } from "@/services/binance";
import { useCallback, useEffect, useRef, useState } from "react";

const BINANCE_AGGTRADE_URL = "wss://stream.binance.com:9443/ws/btcusdt@aggTrade";

/** Binance aggTrade stream message (spot). @see https://binance-docs.github.io/apidocs/spot/en/#aggregate-trade-streams */
export interface BinanceAggTrade {
  e: string;   // Event type "aggTrade"
  E: number;   // Event time (ms)
  s: string;   // Symbol, e.g. "BTCUSDT"
  a: number;   // Aggregate trade ID
  p: string;   // Price (string)
  q: string;   // Quantity (string)
  f: number;   // First trade ID
  l: number;   // Last trade ID
  T: number;   // Trade time (ms)
  m: boolean;  // Buyer is market maker
}

export interface PriceTimePoint {
  time: number;
  price: number;
}

export interface UseBinanceWebSocketResult {
  /** Current BTC price (USDT) or null before first message. */
  price: number | null;
  /** Timestamp (ms) of the last received trade. */
  lastUpdateTime: number | null;
  /** Whether the WebSocket is open and receiving. */
  isConnected: boolean;
  /** Connection or parse error message, if any. */
  error: string | null;
  /** Last N prices for chart trail (optional). */
  priceHistory: number[];
  /** (time, price) points for scrolling chart; time in ms. */
  priceTimeHistory: PriceTimePoint[];
}

const DEFAULT_RECONNECT_MS = 3000;
const MAX_HISTORY_LENGTH = 500;

/**
 * React hook for real-time BTC/USDT price via Binance aggTrade WebSocket.
 * Handles reconnection, cleanup on unmount, and optional price history for chart trail.
 */
export function useBinanceWebSocket(options?: {
  /** Max number of recent prices to keep for history. Default 500. */
  maxHistoryLength?: number;
  /** Reconnect delay in ms. Default 3000. */
  reconnectDelayMs?: number;
  /** If true, do not connect (e.g. when tab hidden). Default false. */
  paused?: boolean;
}): UseBinanceWebSocketResult {
  const {
    maxHistoryLength = MAX_HISTORY_LENGTH,
    reconnectDelayMs = DEFAULT_RECONNECT_MS,
    paused = false,
  } = options ?? {};

  const [price, setPrice] = useState<number | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [priceTimeHistory, setPriceTimeHistory] = useState<PriceTimePoint[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (paused || wsRef.current?.readyState === WebSocket.OPEN) return;

    setError(null);
    const ws = new WebSocket(BINANCE_AGGTRADE_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data as string) as BinanceAggTrade;
        if (data.e !== "aggTrade" || !data.p) return;
        const priceNum = parseFloat(data.p);
        if (Number.isNaN(priceNum)) return;
        const time = typeof data.E === "number" ? data.E : Date.now();
        setPrice(priceNum);
        setLastUpdateTime(time);
        setPriceHistory((prev) => {
          const next = [...prev, priceNum];
          return next.length > maxHistoryLength ? next.slice(-maxHistoryLength) : next;
        });
        setPriceTimeHistory((prev) => {
          const next = [...prev, { time, price: priceNum }];
          return next.length > maxHistoryLength ? next.slice(-maxHistoryLength) : next;
        });
      } catch {
        // ignore parse errors for non-aggTrade messages
      }
    };

    ws.onerror = () => {
      if (mountedRef.current) setError("WebSocket error");
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      wsRef.current = null;
      setIsConnected(false);
      if (mountedRef.current && !paused) {
        reconnectTimeoutRef.current = setTimeout(connect, reconnectDelayMs);
      }
    };
  }, [paused, reconnectDelayMs, maxHistoryLength]);

  useEffect(() => {
    mountedRef.current = true;
    if (paused) return;

    let cancelled = false;
    (async () => {
      try {
        const initial = await fetchHistoricalKlines();
        if (cancelled || !mountedRef.current) return;
        setPriceTimeHistory(initial);
        if (initial.length > 0) {
          const last = initial[initial.length - 1];
          setPrice(last.price);
          setLastUpdateTime(last.time);
        }
        setPriceHistory(initial.map((pt) => pt.price));
      } catch (err) {
        if (mountedRef.current) setError(err instanceof Error ? err.message : "Failed to load history");
        // Still connect WebSocket so live data and multipliers stabilize as data arrives
      }
      if (cancelled || !mountedRef.current) return;
      connect();
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [paused, connect]);

  return {
    price,
    lastUpdateTime,
    isConnected,
    error,
    priceHistory,
    priceTimeHistory,
  };
}
