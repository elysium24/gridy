"use client";

import { useBalance } from "@/contexts/BalanceContext";
import { useWheelRoom, DEFAULT_WHEEL_ROOM_ID } from "@/contexts/WheelRoomContext";
import { useGlobalRoundSync, type GlobalPhase } from "@/hooks/useGlobalRoundSync";
import { useSearchParams } from "next/navigation";
import { motion, animate } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const HOUSE_TAKE = 0.05;
const PAYOUT_RATIO = 1 - HOUSE_TAKE; // 0.95
const SEGMENT_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
];

export interface WheelBet {
  id: string;
  /** Display: short wallet or username */
  label: string;
  amount: number;
  /** Optional avatar URL; fallback to initial. */
  avatar?: string | null;
}

interface Segment extends WheelBet {
  startAngle: number;
  endAngle: number;
  color: string;
  index: number;
}

/** Deterministic winner index for a round so all clients get same result. */
function getWinnerIndexForRound(segmentCount: number, roundId: number): number {
  if (segmentCount <= 0) return 0;
  return Math.abs(roundId) % segmentCount;
}

/** Convert polar (angle in deg, radius) to SVG xy (center 0,0). */
function polarToXY(deg: number, r: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

/** SVG path for a pie slice from angle0 to angle1 (degrees), radius. */
function slicePath(angle0: number, angle1: number, radius: number): string {
  const start = polarToXY(angle0, radius);
  const end = polarToXY(angle1, radius);
  const large = angle1 - angle0 > 180 ? 1 : 0;
  return `M 0 0 L ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y} Z`;
}

const WHEEL_SIZE = 280;
const WHEEL_CX = WHEEL_SIZE / 2;
const WHEEL_CY = WHEEL_SIZE / 2;
const WHEEL_R = (WHEEL_SIZE / 2) * 0.9;

const STAKE_OPTIONS = [5, 10, 20, 50, 100];

const WHEEL_PLAYER_NAMES = [
  "Blaze", "Cipher", "Nova", "Echo", "Raven", "Orbit", "Flux", "Apex", "Vex", "Zara",
  "Jinx", "Nyx", "Rune", "Kite", "Wren", "Ash", "Ember", "Frost", "Storm", "Bolt",
];

function getRandomDisplayName(): string {
  return WHEEL_PLAYER_NAMES[Math.floor(Math.random() * WHEEL_PLAYER_NAMES.length)];
}

export function LuckyWheelGame() {
  const { balance, deduct, add } = useBalance();
  const wheelRoom = useWheelRoom();
  const {
    role,
    roomId,
    myPeerId,
    peerCount,
    connected,
    networkBets,
    setNetworkBets,
    createRoom,
    joinRoom,
    placeBetToHost,
    notifyPeerWon,
    winnerId,
    winnerSpinAngle,
    setWinner,
  } = wheelRoom;

  /** Try to become host first; if room is taken, join as peer. Avoids "Connecting to host..." when no one is there (e.g. first visitor on deploy). */
  const tryCreateOrJoin = useCallback(
    (id: string) => {
      createRoom(id, () => joinRoom(id));
    },
    [createRoom, joinRoom]
  );

  const { phase, phaseSecondsLeft, roundSecond, roundId } =
    useGlobalRoundSync(100);
  const searchParams = useSearchParams();
  const hasAutoJoined = useRef(false);

  const [displayName, setDisplayNameState] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const displayNameInitialized = useRef(false);
  useEffect(() => {
    if (displayNameInitialized.current) return;
    displayNameInitialized.current = true;
    setDisplayNameState(getRandomDisplayName());
  }, []);
  const setDisplayName = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 24);
    if (trimmed.length === 0) return;
    setDisplayNameState(trimmed);
  }, []);

  useEffect(() => {
    if (hasAutoJoined.current || role !== null) return;
    hasAutoJoined.current = true;
    const room = searchParams.get("room")?.trim().toUpperCase();
    const id = room && room.length >= 4 ? room : DEFAULT_WHEEL_ROOM_ID;
    tryCreateOrJoin(id);
  }, [searchParams, tryCreateOrJoin, role]);

  const [selectedStake, setSelectedStake] = useState(10);
  const [committedBet, setCommittedBet] = useState(0);
  const spinRotationRef = useRef(0);
  const hasSetWinnerRef = useRef(false);
  /** Frozen segment list during spin/reveal so segments cannot disappear due to late network updates. */
  const [frozenSegments, setFrozenSegments] = useState<Segment[] | null>(null);

  const [segmentHover, setSegmentHover] = useState<{ label: string; x: number; y: number; index: number } | null>(null);

  const effectiveBets = useMemo((): WheelBet[] => {
    if (role === "host") return networkBets;
    if (role === "peer") {
      const myLabel = displayName || "Player";
      if (myPeerId) {
        const hasMe = networkBets.some((b) => b.id === myPeerId);
        if (hasMe) {
          return networkBets.map((b) =>
            b.id === myPeerId ? { ...b, amount: committedBet, label: myLabel } : b
          );
        }
        if (committedBet > 0) {
          return [...networkBets, { id: myPeerId, label: myLabel, amount: committedBet, avatar: null }];
        }
        return networkBets;
      }
      if (committedBet > 0) {
        return [...networkBets, { id: "me", label: myLabel, amount: committedBet, avatar: null }];
      }
      return networkBets;
    }
    return [];
  }, [role, networkBets, committedBet, displayName, myPeerId]);

  const totalPool = useMemo(() => {
    return effectiveBets.reduce((s, b) => s + b.amount, 0);
  }, [effectiveBets]);

  const segments = useMemo((): Segment[] => {
    if (totalPool <= 0) return [];
    const list = effectiveBets.filter((b) => b.amount > 0);
    let angle = 0;
    return list.map((b, i) => {
      const pct = b.amount / totalPool;
      const span = pct * 360;
      const seg: Segment = {
        ...b,
        startAngle: angle,
        endAngle: angle + span,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
        index: i,
      };
      angle += span;
      return seg;
    });
  }, [effectiveBets, totalPool]);

  /** During spin/reveal use frozen list so segments cannot disappear; otherwise use current segments. */
  const displaySegments = useMemo(
    () =>
      (phase === "spin" || phase === "reveal") &&
      frozenSegments != null &&
      frozenSegments.length > 0
        ? frozenSegments
        : segments,
    [phase, frozenSegments, segments]
  );

  const displayTotalPool = useMemo(
    () => displaySegments.reduce((s, seg) => s + seg.amount, 0),
    [displaySegments]
  );

  /** Display winner = segment that contains winnerSpinAngle (so pointer and highlight always match). Fallback to winnerId by id if no angle. */
  const winnerIndex = useMemo(() => {
    if (displaySegments.length === 0) return null;
    const eps = 0.5;
    if (winnerSpinAngle != null) {
      const byAngle = displaySegments.findIndex(
        (seg) =>
          winnerSpinAngle >= seg.startAngle - eps && winnerSpinAngle < seg.endAngle + eps
      );
      if (byAngle >= 0) return byAngle;
    }
    if (winnerId == null) return null;
    const byId = displaySegments.findIndex((s) => s.id === winnerId);
    return byId >= 0 ? byId : null;
  }, [winnerId, winnerSpinAngle, displaySegments]);

  /** Host: set and broadcast winner id + spin angle once when entering spin. Nudge 52% into segment so we land clearly inside, not on a boundary. */
  useEffect(() => {
    if (role !== "host" || phase !== "spin" || segments.length === 0 || hasSetWinnerRef.current)
      return;
    hasSetWinnerRef.current = true;
    const idx = getWinnerIndexForRound(segments.length, roundId);
    const seg = segments[idx];
    const id = seg?.id ?? null;
    if (id != null && seg) {
      const span = seg.endAngle - seg.startAngle;
      const spinAngle = seg.startAngle + span * 0.52; // 52% into segment so we land clearly inside, not on a boundary
      setWinner(id, spinAngle);
    }
  }, [role, phase, segments, roundId, setWinner]);

  useEffect(() => {
    if (phase === "preparation" && roundSecond < 2) {
      hasSetWinnerRef.current = false;
      setFrozenSegments(null);
      setWinner(null);
    }
    if (phase === "spin" && segments.length > 0 && frozenSegments == null) {
      setFrozenSegments(segments);
    }
  }, [phase, roundSecond, segments, setWinner, frozenSegments]);

  const addToWager = useCallback(() => {
    if (selectedStake <= 0 || selectedStake > balance) return;
    if (phase !== "preparation") return;
    if (role === "peer" && !connected) return;
    const amt = selectedStake;
    deduct(amt);
    setCommittedBet((c) => c + amt);
    if (role === "host") {
      setNetworkBets((prev) => {
        const current = prev.find((b) => b.id === "host")?.amount ?? 0;
        return [
          ...prev.filter((b) => b.id !== "host"),
          { id: "host", label: displayName || "Player", amount: current + amt },
        ];
      });
    }
    if (role === "peer") placeBetToHost({ id: "me", label: displayName || "Player", amount: amt });
  }, [selectedStake, balance, phase, deduct, role, connected, setNetworkBets, placeBetToHost, displayName]);

  const leaderboardRows = useMemo(() => {
    const list = displaySegments.map((s) => ({
      ...s,
      winPct: displayTotalPool > 0 ? (s.amount / displayTotalPool) * 100 : 0,
    }));
    const winnerIdx = phase === "reveal" && winnerIndex != null ? winnerIndex : null;
    if (winnerIdx != null && list[winnerIdx]) {
      const winner = list[winnerIdx];
      const rest = list.filter((_, i) => i !== winnerIdx);
      return [winner, ...rest];
    }
    return list;
  }, [displaySegments, displayTotalPool, phase, winnerIndex]);

  const payoutAmount = useMemo(() => {
    if (winnerIndex == null || displaySegments.length === 0) return 0;
    const winner = displaySegments[winnerIndex];
    return displayTotalPool * PAYOUT_RATIO;
  }, [winnerIndex, displaySegments, displayTotalPool]);

  const isWinnerMe =
    phase === "reveal" &&
    winnerIndex != null &&
    (displaySegments[winnerIndex]?.id === "me" ||
      (role === "peer" && myPeerId !== null && displaySegments[winnerIndex]?.id === myPeerId));

  const hasPaidRef = useRef(false);
  useEffect(() => {
    if (phase !== "reveal" || winnerIndex == null) return;
    const winner = displaySegments[winnerIndex];
    if (!winner || displayTotalPool <= 0) return;
    const payout = displayTotalPool * PAYOUT_RATIO;
    if (winner.id === "host" && role === "host") {
      if (!hasPaidRef.current) {
        hasPaidRef.current = true;
        add(payout);
        setCommittedBet(0);
      }
    } else if (role === "host" && winner.id !== "host") {
      notifyPeerWon(winner.id, payout);
    }
  }, [phase, winnerIndex, displaySegments, displayTotalPool, add, role, notifyPeerWon]);

  useEffect(() => {
    const handler = (e: CustomEvent<number>) => {
      add(e.detail);
      setCommittedBet(0);
    };
    window.addEventListener("wheel-peer-won", handler as EventListener);
    return () => window.removeEventListener("wheel-peer-won", handler as EventListener);
  }, [add]);

  const prevPhaseRef = useRef<GlobalPhase>(phase);
  useEffect(() => {
    if (prevPhaseRef.current === "reveal" && phase === "preparation") {
      hasPaidRef.current = false;
      setCommittedBet(0);
      if (role === "host") setNetworkBets([]);
    }
    prevPhaseRef.current = phase;
  }, [phase, role, setNetworkBets]);

  /** Rotation so the segment at winnerSpinAngle lands at the pointer (top). Positive rotate = clockwise; point at wheel angle θ ends at view angle θ − R, so R = winnerSpinAngle. */
  const spinRotation = useMemo(() => {
    const fullTurns = 5 + (roundId % 3) * 0.5;
    if (winnerSpinAngle != null) {
      return fullTurns * 360 + winnerSpinAngle;
    }
    if (winnerIndex == null || displaySegments.length === 0) return 0;
    const seg = displaySegments[winnerIndex];
    if (!seg) return 0;
    const span = seg.endAngle - seg.startAngle;
    const angle = seg.startAngle + span * 0.52;
    return fullTurns * 360 + angle;
  }, [winnerSpinAngle, winnerIndex, displaySegments, roundId]);

  const [displayRotation, setDisplayRotation] = useState(0);

  useEffect(() => {
    if (phase === "preparation") {
      setDisplayRotation(0);
      spinRotationRef.current = 0;
      return;
    }
    if (phase === "spin" && winnerIndex != null) {
      const c = animate(spinRotationRef.current, spinRotation, {
        duration: 4.2,
        ease: [0.17, 0.67, 0.24, 1],
        onUpdate: (v) => {
          spinRotationRef.current = v;
          setDisplayRotation(v);
        },
      });
      return () => c.stop();
    }
    if (phase === "reveal") {
      setDisplayRotation(spinRotation);
      spinRotationRef.current = spinRotation;
    }
  }, [phase, spinRotation, winnerIndex]);

  const phaseLabel =
    phase === "preparation"
      ? "Place bets"
      : phase === "spin"
        ? "Spinning…"
        : "Winner";

  if (role === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border bg-[#0B0E11] p-6" style={{ borderColor: "#1E2329" }}>
        <p className="text-sm text-zinc-400">Connecting to room…</p>
      </div>
    );
  }

  const shareUrl =
    typeof window !== "undefined" && roomId
      ? `${window.location.origin}${window.location.pathname}?room=${roomId}`
      : "";

  return (
    <div className="flex min-h-[380px] flex-col rounded-2xl border bg-[#0B0E11] p-4 md:p-6" style={{ borderColor: "#1E2329" }}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: "#1E2329" }}>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
            Game 03 · The Global Wheel
          </h2>
          <p className="text-xs text-zinc-500">
            60s global round · Pari-mutuel · 95% to winner
            {roomId && (
              <> · Room: <span className="font-mono font-semibold text-amber-400">{roomId}</span></>
            )}
            {role === "peer" && roomId && <> · Joined</>}
          </p>
          {role === "host" && shareUrl && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="max-w-[220px] rounded border bg-black/40 px-2 py-1 font-mono text-[10px] text-zinc-400"
                style={{ borderColor: "#1E2329" }}
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                }}
                className="rounded border border-amber-500/50 px-2 py-1 text-[10px] text-amber-400 hover:bg-amber-500/10"
              >
                Copy link
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Playing as</span>
            {isEditingName ? (
              <input
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setDisplayName(editNameValue);
                    setIsEditingName(false);
                  }
                  if (e.key === "Escape") {
                    setEditNameValue(displayName);
                    setIsEditingName(false);
                  }
                }}
                onBlur={() => {
                  setDisplayName(editNameValue);
                  setIsEditingName(false);
                }}
                placeholder="Name"
                className="w-24 rounded border bg-black/40 px-2 py-1 text-xs font-medium text-zinc-200"
                style={{ borderColor: "#1E2329" }}
                autoFocus
              />
            ) : (
              <>
                <span className="font-medium text-zinc-200">{displayName || "…"}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditNameValue(displayName || "");
                    setIsEditingName(true);
                  }}
                  className="rounded border border-zinc-600/80 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
                >
                  Change
                </button>
              </>
            )}
          </div>
          {connected && role === "host" && (
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              {peerCount} peer{peerCount !== 1 ? "s" : ""}
            </span>
          )}
          {role === "peer" && !connected && (
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              Connecting to host…
            </span>
          )}
          {connected && role === "peer" && (
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              Connected to host
            </span>
          )}
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              Phase
            </div>
            <div className="font-mono text-sm font-semibold text-zinc-200">
              {phaseLabel}
            </div>
          </div>
          <div className="rounded-lg border px-3 py-1.5 font-mono text-lg tabular-nums text-amber-400" style={{ borderColor: "#1E2329" }}>
            {phaseSecondsLeft}s
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="absolute right-0 top-0 z-10 w-full min-w-[280px] lg:w-[26rem]">
          <div className="rounded-xl border bg-black/30 p-3" style={{ borderColor: "#1E2329" }}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Pool: ${displayTotalPool.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div
              className={`wheel-leaderboard-scroll max-h-[280px] overflow-x-auto px-3 py-4 ${leaderboardRows.length >= 20 ? "show-scrollbar" : ""}`}
            >
              <table className="w-full min-w-[260px] table-fixed text-left text-xs border-collapse">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="w-[54%] truncate py-2 pr-2 font-medium">Player</th>
                    <th className="w-[26%] py-2 pr-2 text-right font-medium">Bet</th>
                    <th className="w-[20%] py-2 text-right font-medium">Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardRows.map((row) => {
                    const isWinner =
                      phase === "reveal" &&
                      winnerIndex != null &&
                      displaySegments[winnerIndex]?.id === row.id;
                    return (
                      <motion.tr
                        key={row.id + row.index}
                        layout
                        className="border-t border-zinc-800/80"
                        initial={false}
                        animate={{
                          scale: isWinner ? 1.02 : 1,
                          order: isWinner ? 0 : 1,
                        }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        style={{
                          boxShadow: isWinner ? "0 0 0 2px rgba(234, 179, 8, 0.9), 0 0 8px rgba(234, 179, 8, 0.35)" : undefined,
                          borderRadius: isWinner ? "8px" : undefined,
                          background: isWinner ? "rgba(234, 179, 8, 0.08)" : undefined,
                        }}
                      >
                        <td
                          className={`min-w-0 truncate ${isWinner ? "py-3 pl-3 pr-2" : "py-2 pr-2"}`}
                          title={row.label}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <div
                              className="h-6 w-6 shrink-0 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-semibold text-zinc-300"
                              style={row.id !== "me" ? { backgroundColor: row.color + "40", color: row.color } : undefined}
                            >
                              {row.label.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="min-w-0 truncate font-medium text-zinc-200">
                              {row.label}
                              {(row.id === "me" || (role === "host" && row.id === "host") || (role === "peer" && myPeerId !== null && row.id === myPeerId)) && (
                                <span className="ml-1 text-[10px] font-normal text-zinc-500">(You)</span>
                              )}
                              {isWinner && (
                                <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-400">
                                  Winner
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className={isWinner ? "py-3 px-2 text-right font-mono tabular-nums text-zinc-300" : "py-2 pr-2 text-right font-mono tabular-nums text-zinc-300"}>
                          ${row.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={isWinner ? "py-3 pr-3 pl-2 text-right font-mono tabular-nums text-zinc-400" : "py-2 text-right font-mono tabular-nums text-zinc-400"}>
                          {row.winPct.toFixed(1)}%
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center">
          <div
            className="relative flex items-center justify-center"
            style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
            onMouseMove={(e) => {
              if (segmentHover) setSegmentHover((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
            }}
            onMouseLeave={() => setSegmentHover(null)}
          >
            {segmentHover && (
              <div
                className="pointer-events-none fixed z-[100] rounded-lg border border-amber-500/40 bg-[#0B0E11] px-3 py-2 text-sm font-medium text-zinc-100 shadow-lg"
                style={{
                  left: segmentHover.x + 14,
                  top: segmentHover.y + 14,
                  boxShadow: "0 4px 14px rgba(0,0,0,0.4), 0 0 0 1px rgba(234,179,8,0.15)",
                }}
              >
                {segmentHover.label}
              </div>
            )}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              style={{ transformOrigin: "center center" }}
              animate={{ rotate: displayRotation }}
              transition={{ type: "tween" }}
            >
              <svg
                width={WHEEL_SIZE}
                height={WHEEL_SIZE}
                viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
                className="shrink-0"
                aria-hidden
              >
                <g transform={`translate(${WHEEL_CX},${WHEEL_CY})`}>
                  {displaySegments.length === 0 ? (
                    <circle
                      r={WHEEL_R}
                      fill="#52525b"
                      stroke="#71717a"
                      strokeWidth={2}
                    />
                  ) : displaySegments.length === 1 && displaySegments[0].endAngle - displaySegments[0].startAngle >= 359 ? (
                    <circle
                      r={WHEEL_R}
                      fill={displaySegments[0].color}
                      stroke="#0B0E11"
                      strokeWidth={2}
                    />
                  ) : (
                    displaySegments.map((seg) => (
                      <g
                        key={seg.id + seg.index}
                        onMouseEnter={(e) => setSegmentHover({ label: seg.label, x: e.clientX, y: e.clientY, index: seg.index })}
                        onMouseLeave={() => setSegmentHover(null)}
                        style={{ cursor: "pointer" }}
                      >
                        <path
                          d={slicePath(seg.startAngle, seg.endAngle, WHEEL_R)}
                          fill={seg.color}
                          stroke={segmentHover?.index === seg.index ? "rgba(255,255,255,0.6)" : "#0B0E11"}
                          strokeWidth={segmentHover?.index === seg.index ? 3 : 2}
                          opacity={
                            segmentHover?.index === seg.index
                              ? 1
                              : phase === "reveal" && winnerIndex != null && seg.index === winnerIndex
                                ? 1
                                : phase === "reveal" && winnerIndex != null
                                  ? 0.4
                                  : 1
                          }
                          style={
                            segmentHover?.index === seg.index
                              ? { filter: "brightness(1.2)" }
                              : undefined
                          }
                        />
                      </g>
                    ))
                  )}
                </g>
              </svg>
            </motion.div>
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 z-[5] flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 border-[#1E2329] bg-[#0B0E11]"
            >
              <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                Pool
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
                ${displayTotalPool.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div
              className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-0.5"
              style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}
            >
              <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
                <defs>
                  <linearGradient id="wheel-pointer-fill" x1="14" y1="0" x2="14" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fcd34d" />
                    <stop offset="1" stopColor="#ca8a04" />
                  </linearGradient>
                </defs>
                <path d="M14 22 L0 0 L28 0 Z" fill="url(#wheel-pointer-fill)" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {STAKE_OPTIONS.map((amount) => {
                const active = selectedStake === amount;
                return (
                  <motion.button
                    key={amount}
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    whileHover={{ scale: 1.02 }}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      active
                        ? "bg-amber-500 text-zinc-900"
                        : "border border-zinc-700/80 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                    }`}
                    style={{ borderColor: active ? undefined : "#1E2329" }}
                    onClick={() => setSelectedStake(amount)}
                  >
                    ${amount}
                  </motion.button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addToWager}
              disabled={phase !== "preparation" || selectedStake > balance || (role === "peer" && !connected)}
              className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-amber-400 disabled:opacity-50"
            >
              Add ${selectedStake}
            </button>
            {committedBet > 0 && (
              <span className="text-[10px] text-zinc-500">
                Your wager: ${committedBet.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
          {phase === "reveal" && winnerIndex != null && displaySegments[winnerIndex] && (
            <div className="mt-4 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-center" style={{ borderColor: "#1E2329" }}>
              <span className="text-xs text-amber-400">Winner: </span>
              <span className="font-semibold text-amber-300">
                {displaySegments[winnerIndex].label}
              </span>
              <span className="text-xs text-zinc-400"> · Payout 95%: </span>
              <span className="font-mono font-semibold text-emerald-400">
                ${payoutAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
