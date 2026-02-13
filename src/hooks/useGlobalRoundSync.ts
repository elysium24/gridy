"use client";

import { useEffect, useMemo, useState } from "react";

export type GlobalPhase = "preparation" | "spin" | "reveal";

const ROUND_LENGTH_S = 60;
const PREP_END_S = 40;
const SPIN_END_S = 45;

/** Optional server time offset in ms (serverTime = Date.now() + serverOffsetMs). Set via API. */
let serverOffsetMs = 0;

export function setServerTimeOffset(offsetMs: number) {
  serverOffsetMs = offsetMs;
}

/** Current time in ms, optionally adjusted by server offset. */
function now(): number {
  return Date.now() + serverOffsetMs;
}

/** Seconds into the current minute (0–59). */
function secondsInMinute(): number {
  return Math.floor(now() / 1000) % ROUND_LENGTH_S;
}

export interface GlobalRoundState {
  phase: GlobalPhase;
  /** Seconds left in the current phase (e.g. 25 = 25s left in preparation). */
  phaseSecondsLeft: number;
  /** Seconds into the current 60s round (0–59). */
  roundSecond: number;
  /** Unique round id: floor(timestamp / 60000) so it advances every minute. */
  roundId: number;
}

export function useGlobalRoundSync(updateIntervalMs: number = 100): GlobalRoundState {
  const [roundSecond, setRoundSecond] = useState(0);

  useEffect(() => {
    const tick = () => setRoundSecond(secondsInMinute());
    tick();
    const id = setInterval(tick, updateIntervalMs);
    return () => clearInterval(id);
  }, [updateIntervalMs]);

  return useMemo((): GlobalRoundState => {
    let phase: GlobalPhase = "preparation";
    let phaseSecondsLeft = 0;

    if (roundSecond < PREP_END_S) {
      phase = "preparation";
      phaseSecondsLeft = PREP_END_S - roundSecond;
    } else if (roundSecond < SPIN_END_S) {
      phase = "spin";
      phaseSecondsLeft = SPIN_END_S - roundSecond;
    } else {
      phase = "reveal";
      phaseSecondsLeft = ROUND_LENGTH_S - roundSecond;
    }

    const roundId = Math.floor(now() / 1000 / ROUND_LENGTH_S);

    return { phase, phaseSecondsLeft, roundSecond, roundId };
  }, [roundSecond]);
}
