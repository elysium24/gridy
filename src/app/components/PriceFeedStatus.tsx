"use client";

import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";

/**
 * Phase 1: Displays live BTC price and connection status from Binance WebSocket.
 * Replace or extend this when building the scrolling chart in Phase 2.
 */
export function PriceFeedStatus() {
  const { price, lastUpdateTime, isConnected, error } = useBinanceWebSocket();

  return (
    <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 font-mono text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            isConnected ? "bg-[var(--neon-green)] shadow-[0_0_8px_var(--neon-green-glow)]" : "bg-[var(--neon-red)]"
          }`}
        />
        <span className="text-[var(--muted)]">
          {isConnected ? "Live" : "Connecting…"}
        </span>
        {error && <span className="text-[var(--neon-red)]">{error}</span>}
      </div>
      <div className="font-mono-tab text-xl text-[var(--neon-green)]">
        {price != null ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
      </div>
      {lastUpdateTime != null && (
        <span className="text-xs text-[var(--muted)]">
          {new Date(lastUpdateTime).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
