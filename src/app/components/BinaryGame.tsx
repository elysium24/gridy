 "use client";

import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";
import { useBalance } from "@/contexts/BalanceContext";
import { AnimatePresence, motion, animate } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

type Direction = "up" | "down";

const ROUND_DURATION_MS = 10_000;
const MULTIPLIER = 1.9;
const MAX_STREAK = 10;
const MAX_PAYOUT = 100_000; // soft cap for a single streak

// Button accent colors
const UP_COLOR = "#3B82F6"; // blue
const DOWN_COLOR = "#F97316"; // orange
const BG_NEAR_BLACK = "#0B0E11";
const BORDER_COLOR = "#1E2329";

interface RoundState {
  direction: Direction | null;
  startPrice: number | null;
  endPrice: number | null;
  result: "win" | "lose" | "push" | null;
  endsAt: number | null;
}

export function BinaryGame() {
  const { price, priceTimeHistory } = useBinanceWebSocket({
    maxHistoryLength: 2000,
  });
  const { balance, add, deduct } = useBalance();

  // Base stake chosen when (re)starting a streak
  const [baseStake, setBaseStake] = useState(10);

  // Streak state
  const [isStreakActive, setIsStreakActive] = useState(false);
  const [currentStreakCount, setCurrentStreakCount] = useState(0);
  const [currentPotentialPayout, setCurrentPotentialPayout] = useState(0);

  // For the current round
  const [round, setRound] = useState<RoundState>({
    direction: null,
    startPrice: null,
    endPrice: null,
    result: null,
    endsAt: null,
  });
  const [isResolving, setIsResolving] = useState(false);
  const [remainingSeconds, setRemainingSeconds] =
    useState<number | null>(null);

  // UI / animation helpers
  const [lastWinAmount, setLastWinAmount] = useState<number | null>(null);
  const [lastLossAmount, setLastLossAmount] = useState<number | null>(null);
  const [autoCapped, setAutoCapped] = useState(false);
  const [showResultBanner, setShowResultBanner] = useState(false);

  const stakeForCurrentRound = useMemo(() => {
    if (isStreakActive && currentPotentialPayout > 0) {
      // Entire potential amount is riding on the next flip
      return currentPotentialPayout;
    }
    return baseStake;
  }, [isStreakActive, currentPotentialPayout, baseStake]);

  const isInCountdown =
    round.endsAt !== null &&
    remainingSeconds !== null &&
    remainingSeconds > 0;

  const canPlaceNewRound = useMemo(() => {
    if (price == null) return false;
    if (isInCountdown || isResolving) return false;
    return balance >= stakeForCurrentRound && stakeForCurrentRound > 0;
  }, [price, isInCountdown, isResolving, balance, stakeForCurrentRound]);

  const roundRef = useRef<RoundState>(round);
  roundRef.current = round;

  // Animated payout value (count-up on win)
  const [payoutDisplay, setPayoutDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(payoutDisplay, currentPotentialPayout, {
      duration: 0.5,
      ease: "easeOut",
      onUpdate: (latest) => setPayoutDisplay(latest),
    });
    return () => controls.stop();
  }, [currentPotentialPayout]);

  // When not in a streak, current payout is 0
  useEffect(() => {
    if (!isStreakActive) {
      setCurrentPotentialPayout(0);
    }
  }, [isStreakActive]);

  // Countdown timer
  useEffect(() => {
    if (!round.endsAt) {
      setRemainingSeconds(null);
      return;
    }
    const tick = () => {
      const now = Date.now();
      const diff = roundRef.current.endsAt
        ? roundRef.current.endsAt - now
        : 0;
      if (!roundRef.current.endsAt || diff <= 0) {
        setRemainingSeconds(0);
        return;
      }
      setRemainingSeconds(Math.max(0, Math.ceil(diff / 1000)));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [round.endsAt]);

  // Resolve round when timer completes and we have price data
  useEffect(() => {
    if (!round.endsAt || isResolving || round.result) return;
    if (remainingSeconds === null || remainingSeconds > 0) return;
    if (!priceTimeHistory.length) return;

    setIsResolving(true);
    const endsAt = round.endsAt;
    const settlePoint =
      priceTimeHistory.find((pt) => pt.time >= endsAt) ??
      priceTimeHistory[priceTimeHistory.length - 1];
    const endPrice = settlePoint.price;
    const startPrice = round.startPrice ?? endPrice;
    let result: "win" | "lose" | "push";
    if (endPrice > startPrice) {
      result =
        round.direction === "up"
          ? "win"
          : round.direction === "down"
          ? "lose"
          : "push";
    } else if (endPrice < startPrice) {
      result =
        round.direction === "down"
          ? "win"
          : round.direction === "up"
          ? "lose"
          : "push";
    } else {
      result = "push";
    }

    const stake = stakeForCurrentRound;
    const winAmount = stake * MULTIPLIER;

    if (result === "win") {
      // Update streak state but do NOT credit balance yet
      const nextStreakCount = isStreakActive ? currentStreakCount + 1 : 1;
      const nextPotential = isStreakActive
        ? currentPotentialPayout * MULTIPLIER
        : winAmount;
      setIsStreakActive(true);
      setCurrentStreakCount(nextStreakCount);
      setCurrentPotentialPayout(nextPotential);
      setLastWinAmount(nextPotential);
      setLastLossAmount(null);
      setAutoCapped(false);
    } else if (result === "lose") {
      // Entire streak evaporates; reset potential payout to selected stake
      if (isStreakActive) {
        setLastLossAmount(currentPotentialPayout || stake);
      } else {
        setLastLossAmount(stake);
      }
      setIsStreakActive(false);
      setCurrentStreakCount(0);
      setCurrentPotentialPayout(0);
      setLastWinAmount(null);
      setAutoCapped(false);
    } else {
      // push -> refund stake, reset streak state but without loss animation
      add(stake);
      setIsStreakActive(false);
      setCurrentStreakCount(0);
      setCurrentPotentialPayout(0);
      setLastWinAmount(null);
      setLastLossAmount(null);
      setAutoCapped(false);
    }

    setRound((prev) => ({
      ...prev,
      endPrice,
      result,
      endsAt: null,
    }));
    setRemainingSeconds(0);
    setIsResolving(false);
  }, [
    add,
    currentPotentialPayout,
    currentStreakCount,
    isResolving,
    isStreakActive,
    priceTimeHistory,
    remainingSeconds,
    round.direction,
    round.endsAt,
    round.result,
    round.startPrice,
    baseStake,
    stakeForCurrentRound,
  ]);

  // Auto-hide win / lose status after 3 seconds
  useEffect(() => {
    if (round.result === "win" || round.result === "lose") {
      setShowResultBanner(true);
      const id = setTimeout(() => setShowResultBanner(false), 3000);
      return () => clearTimeout(id);
    }
    setShowResultBanner(false);
  }, [round.result]);

  const handlePlaceBet = (direction: Direction) => {
    if (!canPlaceNewRound || price == null) return;
    const stake = stakeForCurrentRound;
    if (balance < stake) return;

    deduct(stake);
    const now = Date.now();
    const endsAt = now + ROUND_DURATION_MS;

    setRound({
      direction,
      startPrice: price,
      endPrice: null,
      result: null,
      endsAt,
    });
    setRemainingSeconds(Math.ceil(ROUND_DURATION_MS / 1000));
    setIsResolving(false);
    setLastWinAmount(null);
    setLastLossAmount(null);
  };

  const handleCashOut = () => {
    if (!isStreakActive || currentPotentialPayout <= 0) return;
    add(currentPotentialPayout);
    setIsStreakActive(false);
    setCurrentStreakCount(0);
    setCurrentPotentialPayout(0);
    setRound({
      direction: null,
      startPrice: null,
      endPrice: null,
      result: null,
      endsAt: null,
    });
    setRemainingSeconds(null);
    setLastLossAmount(null);
    setLastWinAmount(null);
    setAutoCapped(false);
  };

  const handleLetItRide = () => {
    if (!isStreakActive || currentPotentialPayout <= 0) return;

    // Risk management caps
    if (
      currentStreakCount >= MAX_STREAK ||
      currentPotentialPayout >= MAX_PAYOUT
    ) {
      setAutoCapped(true);
      handleCashOut();
      return;
    }

    // Keep streak active and use full potential payout as the next stake,
    // but let the user choose Up / Down for the next round.
    setRound({
      direction: null,
      startPrice: null,
      endPrice: null,
      result: null,
      endsAt: null,
    });
    setRemainingSeconds(null);
    setIsResolving(false);
    setLastLossAmount(null);
    setLastWinAmount(null);
  };

  const isAtCap =
    isStreakActive &&
    (currentStreakCount >= MAX_STREAK ||
      currentPotentialPayout >= MAX_PAYOUT);

  const canChooseDirection =
    !isInCountdown &&
    !isResolving &&
    (!isStreakActive || currentPotentialPayout > 0);

  const upDisabled = !canChooseDirection || !canPlaceNewRound;
  const downDisabled = !canChooseDirection || !canPlaceNewRound;

  // Price color while round is live
  let livePriceClass =
    "font-mono text-xl font-semibold tabular-nums text-zinc-50";
  if (
    isInCountdown &&
    round.startPrice !== null &&
    round.direction &&
    price !== null
  ) {
    const winningNow =
      (round.direction === "up" && price > round.startPrice) ||
      (round.direction === "down" && price < round.startPrice);
    const losingNow =
      (round.direction === "up" && price < round.startPrice) ||
      (round.direction === "down" && price > round.startPrice);
    if (winningNow) {
      livePriceClass =
        "font-mono text-xl font-semibold tabular-nums text-emerald-400";
    } else if (losingNow) {
      livePriceClass =
        "font-mono text-xl font-semibold tabular-nums text-rose-400";
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="relative flex h-full flex-col rounded-2xl border"
      style={{
        backgroundColor: BG_NEAR_BLACK,
        borderColor: BORDER_COLOR,
      }}
    >
      {/* Top: Title + live price */}
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: BORDER_COLOR }}
      >
        <div className="space-y-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            Game 02 · Chain Reaction
          </h2>
          <p className="text-[11px] text-zinc-500">
            10s BTC Up / Down with streak-based compounding.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              BTC · USD
            </span>
            {isInCountdown && (
              <motion.span
                className="inline-flex items-center justify-center text-amber-400"
                aria-hidden
                animate={{
                  rotate: [0, -8, 8, 0],
                  transition: {
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 4 L18 4 L12 12 L6 4 M12 12 L18 20 L6 20 L12 12" />
                </svg>
              </motion.span>
            )}
            <motion.span
              className={`flex items-center gap-1 rounded-full border px-2 py-[1px] font-mono text-[11px] tabular-nums ${
                isInCountdown
                  ? remainingSeconds !== null && remainingSeconds <= 3
                    ? "border-rose-400 bg-rose-500/20 text-rose-300"
                    : "border-amber-400 text-amber-300"
                  : "border-zinc-700 text-zinc-500"
              }`}
              animate={
                isInCountdown &&
                remainingSeconds !== null &&
                remainingSeconds <= 3
                  ? { opacity: [1, 0.45, 1] }
                  : {}
              }
              transition={
                isInCountdown &&
                remainingSeconds !== null &&
                remainingSeconds <= 3
                  ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
                  : {}
              }
            >
              {isInCountdown
                ? `${remainingSeconds?.toString().padStart(2, "0")}s`
                : "Ready"}
            </motion.span>
          </div>
          <span className={livePriceClass}>
            {price
              ? `$${price.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "—"}
          </span>
          {round.startPrice !== null && (
            <span className="flex items-center gap-1 font-mono text-[11px] text-amber-300 tabular-nums">
              <span className="inline-flex items-center" aria-hidden>
                {round.direction === "up" ? (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 9.5 8 5l4.5 4.5" />
                  </svg>
                ) : round.direction === "down" ? (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 6.5 8 11l4.5-4.5" />
                  </svg>
                ) : null}
              </span>
              Entry: $
              {round.startPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          )}
          <span className="text-[10px] text-zinc-500">
            Round: 10s · Multiplier: {MULTIPLIER.toFixed(1)}x · Max streak:{" "}
            {MAX_STREAK}
          </span>
        </div>
      </div>

      {/* Middle: streak progress + payout + command center */}
      <div className="flex flex-1 flex-col gap-4 px-4 py-3">
        {/* Streak segmented progress bar */}
        <motion.div
          layout
          className="rounded-xl border px-3 py-2"
          style={{
            borderColor: BORDER_COLOR,
            background:
              "linear-gradient(120deg, rgba(15,18,22,0.9), rgba(18,22,28,0.9))",
            backdropFilter: "blur(10px)",
          }}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Streak progress
            </span>
            <span className="text-[10px] text-zinc-500">
              {isStreakActive
                ? `${currentStreakCount} / ${MAX_STREAK} wins`
                : "No active streak"}
            </span>
          </div>
          <div className="mt-1 flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-zinc-900">
            {Array.from({ length: MAX_STREAK }).map((_, i) => {
              const idx = i + 1;
              const active = isStreakActive && idx <= currentStreakCount;
              return (
                <motion.div
                  key={idx}
                  className="flex-1 rounded-[999px]"
                  initial={false}
                  animate={
                    active
                      ? {
                          background:
                            "radial-gradient(circle at 50% 0%, rgba(0,192,118,0.9), rgba(0,192,118,0.2))",
                          boxShadow: "0 0 16px rgba(0,192,118,0.45) inset",
                        }
                      : {
                          background:
                            "linear-gradient(to bottom, #111318, #0d1014)",
                          boxShadow: "0 0 0 rgba(0,0,0,0)",
                        }
                  }
                  transition={{
                    type: "spring",
                    stiffness: 220,
                    damping: 22,
                  }}
                />
              );
            })}
          </div>
        </motion.div>

        {/* Payout / round summary + Command center side by side */}
        <div className="flex flex-col gap-3 lg:flex-row">
          {/* Payout panel */}
          <motion.div
            layout
            className="flex flex-1 flex-col gap-3 rounded-xl border px-4 py-3"
            style={{
              borderColor: BORDER_COLOR,
              background:
                "radial-gradient(circle at 0% 0%, rgba(0,192,118,0.16), transparent 55%), radial-gradient(circle at 100% 100%, rgba(255,59,105,0.12), transparent 55%), #0C1015",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                Payouts
              </span>
              {autoCapped && (
                <span className="rounded-full bg-amber-500/10 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  Safety cap hit
                </span>
              )}
            </div>

            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-1 flex-wrap items-stretch gap-4 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    Current payout
                  </span>
                  <motion.span
                    layout
                    className="mt-0.5 block font-mono text-2xl font-semibold text-zinc-50 tabular-nums sm:text-3xl"
                  >
                    $
                    {payoutDisplay.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </motion.span>
                  <span className="mt-0.5 block text-[10px] text-zinc-500">
                    Cash out now to lock this in.
                  </span>
                </div>
                <div
                  className="min-w-0 flex-1 border-l pl-4 sm:border-l sm:pl-4"
                  style={{ borderColor: BORDER_COLOR }}
                >
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    If you win next
                  </span>
                  <span className="mt-0.5 block font-mono text-xl font-semibold text-emerald-400/90 tabular-nums sm:text-2xl">
                    $
                    {(isStreakActive
                      ? currentPotentialPayout * MULTIPLIER
                      : baseStake * MULTIPLIER
                    ).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-zinc-500">
                    One more successful prediction.
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-[2px] text-[10px] text-zinc-500">
                <span>
                  Stake this round:{" "}
                  <span className="font-mono text-[11px] text-zinc-200 tabular-nums">
                    $
                    {stakeForCurrentRound.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </span>
                <span>
                  Win amount:{" "}
                  <span className="font-mono text-[11px] text-zinc-200 tabular-nums">
                    $
                    {(stakeForCurrentRound * MULTIPLIER).toLocaleString(
                      "en-US",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}
                  </span>
                </span>
                <span>
                  Status:{" "}
                  <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
                    {isInCountdown
                      ? `Live · ${remainingSeconds
                          ?.toString()
                          .padStart(2, "0")}s`
                      : round.result === "win"
                      ? "Won"
                      : round.result === "lose"
                      ? "Lost"
                      : round.result === "push"
                      ? "Push"
                      : "Idle"}
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-1 min-h-[22px] text-[10px]">
              <AnimatePresence>
                {showResultBanner &&
                  lastWinAmount !== null &&
                  round.result === "win" && (
                  <motion.div
                    key="win-toast"
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-[10px] text-emerald-300"
                  >
                    <span className="h-[6px] w-[6px] rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                    <span>
                      Streak continues · riding $
                      {lastWinAmount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </motion.div>
                )}
                {showResultBanner &&
                  lastLossAmount !== null &&
                  round.result === "lose" && (
                  <motion.div
                    key="loss-toast"
                    initial={{ opacity: 1, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.06 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1 font-mono text-[10px] text-rose-300"
                  >
                    <span className="h-[6px] w-[6px] rounded-full bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.9)]" />
                    <span>
                      Chain broken · lost $
                      {lastLossAmount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Command center to the right */}
          <motion.div
            layout
            className="mt-1 flex w-full flex-col gap-3 rounded-xl border px-4 py-3 lg:mt-0 lg:w-[320px]"
            style={{
              borderColor: BORDER_COLOR,
              background:
                "linear-gradient(to top, rgba(5,7,10,0.96), rgba(5,7,10,0.9))",
              backdropFilter: "blur(10px)",
            }}
          >
            {!isStreakActive && (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                    Stake
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[5, 10, 20, 50, 100].map((amount) => {
                      const active = baseStake === amount;
                      return (
                        <motion.button
                          key={amount}
                          type="button"
                          whileTap={{ scale: 0.98 }}
                          whileHover={{
                            scale: 1.02,
                            boxShadow: "0 0 18px rgba(148,163,184,0.25)",
                          }}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                            active
                              ? "bg-zinc-100 text-zinc-900"
                              : "border border-zinc-700/80 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                          }`}
                          onClick={() => setBaseStake(amount)}
                        >
                          ${amount}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Action center */}
            <div className="flex flex-1 flex-col gap-2">
              {round.result === "win" && isStreakActive ? (
                // CASH OUT vs LET IT RIDE
                <motion.div
                  layout
                  className="flex w-full flex-col gap-2"
                >
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    whileHover={{
                      scale: 1.02,
                      boxShadow: "0 0 22px rgba(148,163,184,0.55)",
                    }}
                    onClick={handleCashOut}
                    className="flex items-center justify-center gap-2 rounded-full bg-zinc-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-900"
                  >
                    <span>Cash out</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    whileHover={{
                      scale: !isAtCap ? 1.02 : 1,
                      boxShadow: !isAtCap
                        ? "0 0 22px rgba(59,130,246,0.55)"
                        : "none",
                    }}
                    onClick={handleLetItRide}
                    disabled={isAtCap}
                    className={`flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      isAtCap
                        ? "cursor-not-allowed border-zinc-700 bg-zinc-900 text-zinc-500"
                        : "border-sky-500/80 bg-sky-500/10 text-sky-300"
                    }`}
                  >
                    <span>Let it ride</span>
                  </motion.button>
                </motion.div>
              ) : (
                // UP / DOWN buttons
                <motion.div
                  layout
                  className="flex w-full flex-col gap-2"
                >
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    whileHover={
                      upDisabled
                        ? {}
                        : {
                            scale: 1.02,
                            boxShadow: "0 0 20px rgba(59,130,246,0.55)",
                          }
                    }
                    disabled={upDisabled}
                    onClick={() => handlePlaceBet("up")}
                    className={`flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      upDisabled
                        ? "cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-600"
                        : "border-[rgba(59,130,246,0.6)] bg-[rgba(59,130,246,0.12)] text-zinc-50"
                    }`}
                  >
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(59,130,246,0.6)]"
                      style={{ color: UP_COLOR }}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3 w-3"
                        aria-hidden="true"
                      >
                        <path
                          d="M3.5 9.5 8 5l4.5 4.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span>Up in 10s</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    whileHover={
                      downDisabled
                        ? {}
                        : {
                            scale: 1.02,
                            boxShadow: "0 0 20px rgba(249,115,22,0.55)",
                          }
                    }
                    disabled={downDisabled}
                    onClick={() => handlePlaceBet("down")}
                    className={`flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      downDisabled
                        ? "cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-600"
                        : "border-[rgba(249,115,22,0.7)] bg-[rgba(249,115,22,0.14)] text-zinc-50"
                    }`}
                  >
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(249,115,22,0.7)]"
                      style={{ color: DOWN_COLOR }}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3 w-3"
                        aria-hidden="true"
                      >
                        <path
                          d="M3.5 6.5 8 11l4.5-4.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span>Down in 10s</span>
                  </motion.button>
                </motion.div>
              )}

              {/* Helper text */}
              <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
                <span>
                  Balance:{" "}
                  <span className="font-mono text-[11px] text-zinc-200 tabular-nums">
                    $
                    {balance.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </span>
                <span>
                  Stake is{" "}
                  <span className="font-mono text-[11px] text-zinc-200 tabular-nums">
                    ${stakeForCurrentRound.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>{" "}
                  per flip.
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Full-card win / lose overlay */}
      <AnimatePresence>
        {showResultBanner && round.result === "win" && (
          <motion.div
            key="win-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
              className="rounded-3xl border border-emerald-500/60 bg-emerald-500/10 px-6 py-4 text-center shadow-[0_0_40px_rgba(16,185,129,0.7)] backdrop-blur-md"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-300">
                Streak win
              </div>
              <div className="mt-1 text-2xl font-semibold text-emerald-100">
                +
                {lastWinAmount?.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                USDC (unlocked)
              </div>
            </motion.div>
          </motion.div>
        )}
        {showResultBanner && round.result === "lose" && (
          <motion.div
            key="lose-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: 1.05, opacity: 0.9 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="rounded-3xl border border-rose-500/60 bg-rose-500/10 px-6 py-4 text-center shadow-[0_0_40px_rgba(248,113,113,0.6)] backdrop-blur-md"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-rose-300">
                Streak lost
              </div>
              <div className="mt-1 text-2xl font-semibold text-rose-100">
                Chain broken
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

