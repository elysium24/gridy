"use client";

import { useBalance } from "@/contexts/BalanceContext";
import { useBinanceWebSocket, type PriceTimePoint } from "@/hooks/useBinanceWebSocket";
import { getCellMultiplier, getVolatility } from "@/utils/math";
import { getLockIconDataUrl } from "@/utils/lockIcon";
import { useCallback, useEffect, useRef, useState } from "react";

type WagerAmount = 5 | 10 | 20 | 50 | 100;
type BetStatus = "pending" | "won" | "lost";

interface BetCell {
  id: string;
  timeStart: number;
  timeEnd: number;
  priceMin: number;
  priceMax: number;
  wager: number;
  /** Multiplier at time of placement; potential win = wager * multiplierAtPlace */
  multiplierAtPlace?: number;
  status: BetStatus;
  placedAt: number;
  resolvedAt?: number;
}

/** Ease-out cubic for place/resolve animations */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/** Ease-out back: overshoots slightly for a bouncy feel */
function easeOutBack(t: number): number {
  const c = 2.2;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

/** Format price as full dollars, no fractions (e.g. $97,123). */
function formatPriceFull(p: number): string {
  return "$" + Math.round(p).toLocaleString("en-US");
}

/** Color for multiplier text: 1.1x–2x Gray, 2x–10x Yellow/Gold, 10x+ Neon Purple. */
function multiplierFillStyle(mult: number): string {
  if (mult >= 10) return "#c084fc"; // neon purple (no glow in canvas, use bright purple)
  if (mult >= 2) return "#eab308";   // yellow/gold
  return "rgba(161, 161, 170, 0.95)"; // gray
}

const LOCK_ICON_SIZE = 18;

const PRICE_STEP = 10;           // $10 per grid row
const TIME_STEP_MS = 5000;       // 5 seconds per grid column
const BLOCK_SIZE_PX = 50;        // one cell = BLOCK_SIZE_PX × BLOCK_SIZE_PX (square)
const PX_PER_SECOND = BLOCK_SIZE_PX / 5;  // 5s column width = BLOCK_SIZE_PX
const AXIS_WIDTH = 72;           // right margin for price axis
const LOCKED_CELL_SECONDS = 10;  // cells < 10s in the future are locked (no bet)
const DEFAULT_PRICE = 97_000;   // fallback when no data yet
const NOW_LINE_WIDTH = 2;
const GRID_LINE_WIDTH = 1;
const PRICE_LINE_WIDTH = 2.5;

/** Binary search: first index where arr[i].time >= t */
function findStartIndex(history: PriceTimePoint[], t: number): number {
  let lo = 0,
    hi = history.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (history[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
/** Binary search: last index where arr[i].time <= t */
function findEndIndex(history: PriceTimePoint[], t: number): number {
  let lo = -1,
    hi = history.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (history[mid].time > t) hi = mid - 1;
    else lo = mid;
  }
  return lo;
}

interface GridChartProps {
  /** Multiplier applied to historical sigma: Final_Sigma = sigma * volatilityMultiplier. Default 0.5. */
  volatilityMultiplier?: number;
}

export function GridChart({ volatilityMultiplier = 0.5 }: GridChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const lockImageRef = useRef<HTMLImageElement | null>(null);
  const volatilityMultiplierRef = useRef(volatilityMultiplier);
  volatilityMultiplierRef.current = volatilityMultiplier;
  const { balance, add, deduct } = useBalance();
  const { price, priceTimeHistory } = useBinanceWebSocket({ maxHistoryLength: 8000 });
  const historyRef = useRef<PriceTimePoint[]>([]);
  const priceRef = useRef<number | null>(null);
  const frameRef = useRef<number>(0);
  const [selectedWager, setSelectedWager] = useState<WagerAmount>(20);
  const [bets, setBets] = useState<BetCell[]>([]);
  const betsRef = useRef<BetCell[]>([]);
  const [hoveredCell, setHoveredCell] = useState<{
    timeStart: number;
    priceMin: number;
  } | null>(null);
  const hoveredCellRef = useRef(hoveredCell);
  hoveredCellRef.current = hoveredCell;
  const selectedWagerRef = useRef(selectedWager);
  selectedWagerRef.current = selectedWager;

  historyRef.current = priceTimeHistory;
  priceRef.current = price;
  betsRef.current = bets;

  // Phase 4: resolve "won" as soon as the chart touches the cell; "lost" when the window has passed with no touch
  useEffect(() => {
    const now = Date.now();
    let totalWon = 0;
    const resolved = bets.map((bet) => {
      if (bet.status !== "pending") return bet;
      const hit = priceTimeHistory.some(
        (pt) =>
          pt.time >= bet.timeStart &&
          pt.time <= bet.timeEnd &&
          pt.price >= bet.priceMin &&
          pt.price <= bet.priceMax
      );
      if (hit) {
        const mult = bet.multiplierAtPlace ?? 2;
        totalWon += bet.wager * mult;
        return { ...bet, status: "won" as BetStatus, resolvedAt: Date.now() };
      }
      if (bet.timeEnd <= now) {
        return { ...bet, status: "lost" as BetStatus, resolvedAt: Date.now() };
      }
      return bet;
    });
    if (resolved.some((b, i) => b.status !== bets[i].status)) {
      setBets(resolved);
      if (totalWon > 0) add(totalWon);
    }
  }, [bets, priceTimeHistory, add]);

  // Preload Lucide-style lock icon for canvas (locked cells)
  useEffect(() => {
    const img = new Image();
    img.src = getLockIconDataUrl("#a1a1aa");
    lockImageRef.current = img;
    return () => {
      lockImageRef.current = null;
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = dimensionsRef.current;
    if (width <= 0 || height <= 0) {
      frameRef.current = requestAnimationFrame(draw);
      return;
    }
    const chartWidth = Math.max(0, width - AXIS_WIDTH);
    const history = historyRef.current;
    // Use real time so the chart scrolls smoothly every frame instead of waiting for the next socket tick
    const now = Date.now();
    const centerPrice = priceRef.current ?? DEFAULT_PRICE;
    // Square blocks: each $10 row = BLOCK_SIZE_PX tall, so price range from height
    const priceRange = (height / BLOCK_SIZE_PX) * PRICE_STEP;
    const priceMin = centerPrice - priceRange / 2;
    const priceMax = centerPrice + priceRange / 2;
    const pxPerMs = PX_PER_SECOND / 1000;
    const centerX = chartWidth / 2;

    const timeToX = (t: number) => centerX + (t - now) * pxPerMs;
    const priceToY = (p: number) => ((priceMax - p) / priceRange) * height;

    // Clear
    ctx.fillStyle = "#0d0d0f";
    ctx.fillRect(0, 0, width, height);

    // Grid: vertical lines (time, 5s steps) — fill chart from left to right edge
    const t0 = Math.floor(now / TIME_STEP_MS) * TIME_STEP_MS;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = GRID_LINE_WIDTH;
    ctx.beginPath();
    for (let t = t0 - 120_000; timeToX(t) <= chartWidth + 20; t += TIME_STEP_MS) {
      const x = timeToX(t);
      if (x >= -20 && x < chartWidth) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
    }
    ctx.stroke();

    // Grid: horizontal lines (price, $10 steps) — chart area only
    const p0 = Math.floor(priceMin / PRICE_STEP) * PRICE_STEP;
    ctx.beginPath();
    for (let p = p0; p <= priceMax + PRICE_STEP; p += PRICE_STEP) {
      const y = priceToY(p);
      if (y >= -10 && y <= height + 10) {
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
      }
    }
    ctx.stroke();

    // "Now" vertical line (center of chart)
    ctx.strokeStyle = "rgba(34, 197, 94, 0.5)";
    ctx.lineWidth = NOW_LINE_WIDTH;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hover highlight for future cell under cursor (same size as cell; stroke drawn inside)
    const hovered = hoveredCellRef.current;
    if (hovered) {
      const hx1 = timeToX(hovered.timeStart);
      const hx2 = timeToX(hovered.timeStart + TIME_STEP_MS);
      const hyTop = priceToY(hovered.priceMin + PRICE_STEP);
      const hyBottom = priceToY(hovered.priceMin);
      const hx = Math.min(hx1, hx2);
      const hy = Math.min(hyTop, hyBottom);
      const hw = Math.abs(hx2 - hx1);
      const hh = Math.abs(hyBottom - hyTop);
      const inset = 0.75;
      if (hw > inset * 2 && hh > inset * 2 && hx + hw > 0 && hx < chartWidth) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
        ctx.fillRect(hx + inset, hy + inset, hw - inset * 2, hh - inset * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(hx + inset, hy + inset, hw - inset * 2, hh - inset * 2);
      }
    }

    // Real-time multipliers in future cells (and payout when wager selected)
    const rawVol = getVolatility(history, now);
    const volMult = volatilityMultiplierRef.current;
    const volatility = rawVol * volMult;
    const wagerSelected = selectedWagerRef.current;
    const pendingBetSet = new Set(
      betsRef.current
        .filter((b) => b.status === "pending")
        .map((b) => `${b.timeStart}-${b.priceMin}`)
    );
    let timeStart = Math.ceil(now / TIME_STEP_MS) * TIME_STEP_MS;
    // Clip to chart area so the last column can extend to the right edge without drawing on the axis
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, chartWidth, height);
    ctx.clip();
    while (timeToX(timeStart) < chartWidth + 50) {
      for (let p = p0; p <= priceMax + PRICE_STEP; p += PRICE_STEP) {
        const cellPriceMin = p;
        const cellPriceMax = p + PRICE_STEP;
        const cellMidPrice = (cellPriceMin + cellPriceMax) / 2;
        const secondsToCell = (timeStart - now) / 1000;
        const x1 = timeToX(timeStart);
        const x2 = timeToX(timeStart + TIME_STEP_MS);
        const yTop = priceToY(cellPriceMax);
        const yBottom = priceToY(cellPriceMin);
        const cx = (Math.min(x1, x2) + Math.abs(x2 - x1) / 2);
        const cy = (Math.min(yTop, yBottom) + Math.abs(yBottom - yTop) / 2);
        if (x1 > chartWidth || x2 < 0) continue;
        const key = `${timeStart}-${cellPriceMin}`;
        if (pendingBetSet.has(key)) continue;

        const isLocked = secondsToCell < LOCKED_CELL_SECONDS;
        if (isLocked) {
          ctx.fillStyle = "rgba(63, 63, 70, 0.6)";
          ctx.fillRect(Math.min(x1, x2), Math.min(yTop, yBottom), Math.abs(x2 - x1), Math.abs(yBottom - yTop));
          const lockImg = lockImageRef.current;
          if (lockImg?.complete && lockImg.naturalWidth > 0) {
            const s = LOCK_ICON_SIZE;
            ctx.drawImage(lockImg, cx - s / 2, cy - s / 2, s, s);
          }
          continue;
        }

        const multiplier = getCellMultiplier(
          cellMidPrice,
          centerPrice,
          volatility,
          secondsToCell
        );
        const right = Math.max(x1, x2);
        const top = Math.min(yTop, yBottom);
        const multPad = 4;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        if (multiplier >= 10) {
          ctx.shadowColor = "#c084fc";
          ctx.shadowBlur = 8;
        }
        ctx.fillStyle = multiplierFillStyle(multiplier);
        ctx.fillText(`x${multiplier.toFixed(2)}`, right - multPad, top + multPad);
        ctx.shadowBlur = 0;
      }
      timeStart += TIME_STEP_MS;
    }
    ctx.restore();

    // Local time label above the "now" line (drawn on top of locked cells)
    const localTimeStr = new Date(now).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    ctx.font = "10px system-ui, sans-serif";
    const timeW = ctx.measureText(localTimeStr).width;
    const timePad = 6;
    const timeBoxW = timeW + timePad * 2;
    const timeBoxH = 18;
    const timeY = 4;
    ctx.fillStyle = "#0d0d0f";
    ctx.strokeStyle = "rgba(34, 197, 94, 0.5)";
    ctx.lineWidth = 1;
    ctx.fillRect(centerX - timeBoxW / 2, timeY, timeBoxW, timeBoxH);
    ctx.strokeRect(centerX - timeBoxW / 2, timeY, timeBoxW, timeBoxH);
    ctx.fillStyle = "rgba(34, 197, 94, 0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(localTimeStr, centerX, timeY + timeBoxH / 2);

    if (history.length < 2) {
      frameRef.current = requestAnimationFrame(draw);
      return;
    }

    // Visible range: only iterate the slice that can land on screen (binary search)
    const minX = -chartWidth * 10;
    const maxX = chartWidth + 50;
    const minTime = now + (minX - centerX) / pxPerMs;
    const maxTime = now + (maxX - centerX) / pxPerMs;
    const startIdx = findStartIndex(history, minTime);
    const endIdx = findEndIndex(history, maxTime);
    const points: { x: number; y: number; time: number }[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const pt = history[i];
      const x = timeToX(pt.time);
      points.push({ x, y: priceToY(pt.price), time: pt.time });
    }

    // Extend line to "now" at center with latest price so chart scrolls smoothly between socket updates
    const lastPrice =
      history.length > 0 ? history[history.length - 1].price : centerPrice;
    const currentPrice = priceRef.current ?? lastPrice;
    points.push({
      x: centerX,
      y: priceToY(currentPrice),
      time: now,
    });

    if (points.length < 2) {
      frameRef.current = requestAnimationFrame(draw);
      return;
    }

    // Price line: white
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = PRICE_LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Glowing dot at the end of the line (where it meets the "now" vertical)
    const tip = points[points.length - 1];
    const dotRadius = 4;
    const glowRadius = 20;
    const glowPasses = 6;
    for (let i = glowPasses; i >= 1; i--) {
      const r = (i / glowPasses) * glowRadius;
      const alpha = 0.25 * (1 - i / glowPasses) * (1 - i / glowPasses);
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(248, 250, 252, ${alpha})`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#f8fafc";
    ctx.shadowColor = "rgba(248, 250, 252, 0.9)";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Price bubble above the dot
    const bubblePaddingH = 8;
    const bubblePaddingV = 4;
    const bubbleText = formatPriceFull(currentPrice);
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const textW = ctx.measureText(bubbleText).width;
    const bubbleW = textW + bubblePaddingH * 2;
    const bubbleH = 20;
    const bubbleX = tip.x - bubbleW / 2;
    const bubbleY = tip.y - dotRadius - bubbleH - 6;
    if (bubbleY >= 2) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = "rgba(248, 250, 252, 0.4)";
      ctx.lineWidth = 1;
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(bubbleX + r, bubbleY);
      ctx.lineTo(bubbleX + bubbleW - r, bubbleY);
      ctx.arcTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + r, r);
      ctx.lineTo(bubbleX + bubbleW, bubbleY + bubbleH - r);
      ctx.arcTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX + bubbleW - r, bubbleY + bubbleH, r);
      ctx.lineTo(bubbleX + r, bubbleY + bubbleH);
      ctx.arcTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH - r, r);
      ctx.lineTo(bubbleX, bubbleY + r);
      ctx.arcTo(bubbleX, bubbleY, bubbleX + r, bubbleY, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f8fafc";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(bubbleText, tip.x, bubbleY + bubbleH / 2);
    }

    // Bets overlay: pending = yellow + place animation; won = green; lost = red; result animation
    const betCells = betsRef.current;
    const nowMs = Date.now();
    const PLACE_DURATION_MS = 420;
    const RESOLVE_DURATION_MS = 400;

    for (const bet of betCells) {
      const x1 = timeToX(bet.timeStart);
      const x2 = timeToX(bet.timeEnd);
      if (x2 < -20 || x1 > chartWidth + 20) continue;
      const yTop = priceToY(bet.priceMax);
      const yBottom = priceToY(bet.priceMin);
      let x = Math.min(x1, x2);
      const y = Math.min(yTop, yBottom);
      let w = Math.abs(x2 - x1);
      const h = Math.abs(yBottom - yTop);
      if (x + w > chartWidth) w = chartWidth - x;
      if (w <= 0 || h <= 0) continue;

      const cx = x + w / 2;
      const cy = y + h / 2;

      if (bet.status === "pending") {
        const elapsed = nowMs - bet.placedAt;
        const placeProgress = Math.min(1, elapsed / PLACE_DURATION_MS);
        const ease = easeOutBack(placeProgress);
        const scale = 0.92 + 0.08 * ease;
        const opacity = Math.min(1, placeProgress * 1.2);
        const drawW = w * scale;
        const drawH = h * scale;
        const drawX = cx - drawW / 2;
        const drawY = cy - drawH / 2;
        const potentialWin = (bet.wager * (bet.multiplierAtPlace ?? 2));
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = "rgba(234, 179, 8, 0.85)";
        ctx.fillRect(drawX, drawY, drawW, drawH);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(drawX, drawY, drawW, drawH);
        ctx.globalAlpha = 1;
        ctx.font = "bold 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#0d0d0f";
        ctx.fillText(`$${bet.wager}`, cx, cy);
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#0d0d0f";
        ctx.fillText(`$${potentialWin.toFixed(2)}`, x + w - 4, y + 4);
        ctx.restore();
      } else if (bet.status === "won") {
        const resolvedAt = bet.resolvedAt ?? nowMs;
        const elapsed = nowMs - resolvedAt;
        const resolveProgress = Math.min(1, elapsed / RESOLVE_DURATION_MS);
        const ease = easeOutCubic(resolveProgress);
        const fromYellow = 1 - ease;
        const r = Math.round(34 + (234 - 34) * fromYellow);
        const g = Math.round(197 + (179 - 197) * fromYellow);
        const b = Math.round(94 + (8 - 94) * fromYellow);
        const fillAlpha = 0.2 + 0.35 * ease;
        const burstMs = 400;
        const burstProgress = Math.min(1, elapsed / burstMs);
        const scale = 1 + 0.12 * (1 - burstProgress);
        const flashAlpha = Math.max(0, 0.9 * (1 - burstProgress * 2));
        const drawX = cx - (w * scale) / 2;
        const drawY = cy - (h * scale) / 2;
        const drawW = w * scale;
        const drawH = h * scale;
        const payout = bet.wager * (bet.multiplierAtPlace ?? 2);
        ctx.save();
        if (flashAlpha > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
          ctx.fillRect(drawX, drawY, drawW, drawH);
        }
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fillAlpha})`;
        ctx.fillRect(drawX, drawY, drawW, drawH);
        ctx.strokeStyle = `rgba(34, 197, 94, ${0.6 + 0.4 * ease})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(drawX, drawY, drawW, drawH);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`+$${payout.toFixed(2)}`, cx, cy);
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText(`$${bet.wager}`, x + 4, y + h - 4);
        ctx.restore();
      } else {
        const resolvedAt = bet.resolvedAt ?? nowMs;
        const elapsed = nowMs - resolvedAt;
        const resolveProgress = Math.min(1, elapsed / RESOLVE_DURATION_MS);
        const ease = easeOutCubic(resolveProgress);
        const fromYellow = 1 - ease;
        const r = Math.round(239 + (234 - 239) * fromYellow);
        const g = Math.round(68 + (179 - 68) * fromYellow);
        const b = Math.round(68 + (8 - 68) * fromYellow);
        const fillAlpha = 0.15 + 0.35 * ease;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fillAlpha})`;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 + 0.5 * ease})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`−$${bet.wager}`, cx, cy);
      }
    }

    // Right axis: vertical line
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartWidth + 0.5, 0);
    ctx.lineTo(chartWidth + 0.5, height);
    ctx.stroke();

    // Axis labels at each $10 grid line (full dollars, no fractions)
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let p = p0; p <= priceMax + PRICE_STEP; p += PRICE_STEP) {
      const y = priceToY(p);
      if (y < -5 || y > height + 5) continue;
      ctx.fillStyle = "#71717a";
      ctx.fillText(formatPriceFull(p), chartWidth + 6, y);
    }

    // Current price indicator (moves with chart vertically, full dollars)
    const currentPriceY = priceToY(centerPrice);
    if (currentPriceY >= -10 && currentPriceY <= height + 10) {
      ctx.fillStyle = "rgba(15,23,42,0.95)";
      ctx.fillRect(chartWidth + 2, currentPriceY - 10, AXIS_WIDTH - 4, 20);
      ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(chartWidth + 2, currentPriceY - 10, AXIS_WIDTH - 4, 20);
      ctx.fillStyle = "#22c55e";
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(formatPriceFull(centerPrice), chartWidth + 6, currentPriceY);
    }

    frameRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const setSize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      dimensionsRef.current = { width: rect.width, height: rect.height };
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas);
    frameRef.current = requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [draw]);
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const width = rect.width;
    const height = rect.height;
    const chartWidth = Math.max(0, width - AXIS_WIDTH);
    const centerX = chartWidth / 2;

    // Only in chart area (not on axis)
    if (x < 0 || x > chartWidth) return;
    // Only allow betting on future cells (right of "now" line)
    if (x <= centerX) return;

    const now = Date.now();
    const centerPrice = price ?? DEFAULT_PRICE;
    const priceRange = (height / BLOCK_SIZE_PX) * PRICE_STEP;
    const priceMin = centerPrice - priceRange / 2;
    const priceMax = centerPrice + priceRange / 2;
    const pxPerMs = PX_PER_SECOND / 1000;

    const t = now + (x - centerX) / pxPerMs;
    const colIndex = Math.floor(t / TIME_STEP_MS);
    const timeStart = colIndex * TIME_STEP_MS;
    const timeEnd = timeStart + TIME_STEP_MS;
    if (timeStart <= now) return;
    if (timeStart - now < LOCKED_CELL_SECONDS * 1000) return; // locked: too close to now

    const priceValue = priceMax - (y / height) * priceRange;
    if (priceValue < priceMin || priceValue > priceMax) return;
    const rowIndex = Math.floor(priceValue / PRICE_STEP);
    const cellPriceMin = rowIndex * PRICE_STEP;
    const cellPriceMax = cellPriceMin + PRICE_STEP;

    const existing = bets.find(
      (b) =>
        b.status === "pending" &&
        b.timeStart === timeStart &&
        b.priceMin === cellPriceMin
    );
    if (existing) return;

    if (balance < selectedWager) return;
    const nowMs = Date.now();
    const secondsToCell = (timeStart - nowMs) / 1000;
    const cellMidPrice = (cellPriceMin + cellPriceMax) / 2;
    const history = priceTimeHistory;
    const rawVol = getVolatility(history, nowMs);
    const volMult = volatilityMultiplierRef.current;
    const volatility = rawVol * volMult;
    const multiplierAtPlace = getCellMultiplier(
      cellMidPrice,
      centerPrice,
      volatility,
      secondsToCell
    );
    deduct(selectedWager);
    const id = `${timeStart}-${cellPriceMin}-${nowMs}`;
    setBets((prev) => [
      ...prev,
      {
        id,
        timeStart,
        timeEnd,
        priceMin: cellPriceMin,
        priceMax: cellPriceMax,
        wager: selectedWager,
        multiplierAtPlace,
        status: "pending" as BetStatus,
        placedAt: nowMs,
      },
    ]);
  };

  const getCellFromEvent = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const width = rect.width;
      const height = rect.height;
      const chartWidth = Math.max(0, width - AXIS_WIDTH);
      const centerX = chartWidth / 2;
      if (x < 0 || x > chartWidth) return null;
      if (x <= centerX) return null;
      const now = Date.now();
      const centerPrice = price ?? DEFAULT_PRICE;
      const priceRange = (height / BLOCK_SIZE_PX) * PRICE_STEP;
      const priceMin = centerPrice - priceRange / 2;
      const priceMax = centerPrice + priceRange / 2;
      const pxPerMs = PX_PER_SECOND / 1000;
      const t = now + (x - centerX) / pxPerMs;
      const colIndex = Math.floor(t / TIME_STEP_MS);
      const timeStart = colIndex * TIME_STEP_MS;
      if (timeStart <= now) return null;
      if (timeStart - now < LOCKED_CELL_SECONDS * 1000) return null; // locked
      const priceValue = priceMax - (y / height) * priceRange;
      if (priceValue < priceMin || priceValue > priceMax) return null;
      const rowIndex = Math.floor(priceValue / PRICE_STEP);
      const cellPriceMin = rowIndex * PRICE_STEP;
      return { timeStart, priceMin: cellPriceMin };
    },
    [price]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      setHoveredCell(getCellFromEvent(event) ?? null);
    },
    [getCellFromEvent]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  return (
    <div className="relative flex h-full w-full min-h-[320px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Wager
        </span>
        {[5, 10, 20, 50, 100].map((amount) => {
          const active = selectedWager === amount;
          return (
            <button
              key={amount}
              type="button"
              onClick={() => setSelectedWager(amount as WagerAmount)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-[var(--neon-green)] text-black shadow-[0_0_12px_var(--neon-green-glow)]"
                  : "border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              ${amount}
            </button>
          );
        })}
      </div>
      <div className="relative flex-1">
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          style={{ width: "100%", height: "100%" }}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        <div className="pointer-events-none absolute bottom-2 left-2 text-xs font-mono text-[var(--muted)]">
          $10 × 5s grid · click future cells to bet
        </div>
      </div>
    </div>
  );
}
