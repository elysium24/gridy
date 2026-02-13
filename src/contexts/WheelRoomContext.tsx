"use client";

import type { DataConnection } from "peerjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface WheelBet {
  id: string;
  label: string;
  amount: number;
  avatar?: string | null;
}

type RoomRole = "host" | "peer" | null;

interface WheelRoomValue {
  role: RoomRole;
  roomId: string | null;
  /** Peer's own PeerJS id (when role === "peer"); null for host. */
  myPeerId: string | null;
  peerCount: number;
  connected: boolean;
  /** All bets from network (host broadcasts; peers receive). Host merges their own in. */
  networkBets: WheelBet[];
  /** Host: set and broadcast. Peer: n/a (send via placeBetToHost). */
  setNetworkBets: (bets: WheelBet[] | ((prev: WheelBet[]) => WheelBet[])) => void;
  /** Create room as host. Returns room id to share. Pass optional id to claim a specific room. If id is taken, onIdTaken is called (e.g. to retry join). initialBets used when taking over after host migration. */
  createRoom: (roomId?: string, onIdTaken?: () => void, initialBets?: WheelBet[]) => Promise<string>;
  /** Join room by id (host's peer id). */
  joinRoom: (id: string) => Promise<void>;
  leaveRoom: () => void;
  /** Peer sends bet to host; host will add and broadcast. */
  placeBetToHost: (bet: WheelBet) => void;
  /** Host notifies a peer they won (so they can add to balance). */
  notifyPeerWon: (peerId: string, amount: number) => void;
  /** Host-authoritative winner bet id; all clients show this. Host sets and broadcasts; peers receive. */
  winnerId: string | null;
  /** Host-authoritative spin angle (degrees) so wheel lands on same segment on all clients. */
  winnerSpinAngle: number | null;
  /** Host: set and broadcast winner id + spin angle. Peers: no-op (receive via network). Call with (null) to clear. */
  setWinner: (winnerId: string | null, spinAngle?: number | null) => void;
}

const WheelRoomContext = createContext<WheelRoomValue | null>(null);

export const DEFAULT_WHEEL_ROOM_ID = "BLOCKYWHL";

function genRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function WheelRoomProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<RoomRole>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  const [networkBets, setNetworkBets] = useState<WheelBet[]>([]);
  const [connections, setConnections] = useState<Map<string, DataConnection>>(new Map());
  const [peer, setPeer] = useState<import("peerjs").default | null>(null);
  const [connected, setConnected] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [winnerSpinAngle, setWinnerSpinAngle] = useState<number | null>(null);

  const peerRef = useRef<import("peerjs").default | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const networkBetsRef = useRef<WheelBet[]>([]);
  const winnerIdRef = useRef<string | null>(null);
  const winnerSpinAngleRef = useRef<number | null>(null);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);
  useEffect(() => {
    networkBetsRef.current = networkBets;
  }, [networkBets]);
  useEffect(() => {
    winnerIdRef.current = winnerId;
  }, [winnerId]);
  useEffect(() => {
    winnerSpinAngleRef.current = winnerSpinAngle;
  }, [winnerSpinAngle]);

  const broadcast = useCallback((msg: object, connMap?: Map<string, DataConnection>) => {
    const map = connMap ?? connectionsRef.current;
    map.forEach((conn) => {
      try {
        if (conn.open) conn.send(msg);
      } catch {
        // ignore
      }
    });
  }, []);

  const createRoom = useCallback(
    async (roomId?: string, onIdTaken?: () => void, initialBets?: WheelBet[]): Promise<string> => {
      const id = roomId ?? genRoomId();
    const { default: Peer } = await import("peerjs");
    const p = new Peer(id, {
      host: "0.peerjs.com",
      secure: true,
      port: 443,
    });
    peerRef.current = p;
    setPeer(p);

    let opened = false;
    let idTakenTimer: ReturnType<typeof setTimeout> | null = null;
    const tryJoinInstead = () => {
      if (opened) return;
      if (roomId == null || typeof onIdTaken !== "function") return;
      if (idTakenTimer != null) {
        clearTimeout(idTakenTimer);
        idTakenTimer = null;
      }
      try {
        p.destroy();
      } catch {
        // ignore
      }
      peerRef.current = null;
      setPeer(null);
      setTimeout(() => onIdTaken(), 600);
    };

    p.on("open", () => {
      opened = true;
      if (idTakenTimer != null) {
        clearTimeout(idTakenTimer);
        idTakenTimer = null;
      }
      setRoomId(id);
      setRole("host");
      setNetworkBets(initialBets ?? []);
      setConnections(new Map());
      setConnected(true);
    });
    p.on("disconnected", () => setConnected(false));
    p.on("close", () => setConnected(false));
    p.on("error", () => {
      setConnected(false);
      tryJoinInstead();
    });
    if (roomId != null && typeof onIdTaken === "function") {
      idTakenTimer = setTimeout(tryJoinInstead, 6000);
    }

    p.on("connection", (conn) => {
      conn.on("open", () => {
        const peerId = conn.peer;
        if (typeof peerId !== "string" || peerId.length === 0) return;
        setConnections((prev) => {
          const next = new Map(prev);
          next.set(peerId, conn);
          connectionsRef.current = next;
          const allIds = [...prev.keys(), peerId];
          conn.send({ type: "bets", payload: networkBetsRef.current });
          conn.send({ type: "peerList", payload: allIds });
          if (winnerIdRef.current != null && winnerSpinAngleRef.current != null)
            conn.send({
              type: "winner",
              payload: { id: winnerIdRef.current, spinAngle: winnerSpinAngleRef.current },
            });
          prev.forEach((c, pid) => {
            if (pid !== peerId) {
              try {
                if (c.open) c.send({ type: "peerJoined", payload: peerId });
              } catch {
                // ignore
              }
            }
          });
          return next;
        });
      });
      conn.on("data", (data: unknown) => {
        const msg = data as { type: string; payload?: { label?: string; amount: number } };
        if (msg.type === "placeBet" && msg.payload && typeof msg.payload.amount === "number") {
          const peerId = conn.peer;
          const addedAmount = msg.payload.amount;
          const label = msg.payload.label ?? "Peer";
          setNetworkBets((prev) => {
            const existing = prev.find((b) => b.id === peerId);
            const newAmount = (existing?.amount ?? 0) + addedAmount;
            return [
              ...prev.filter((b) => b.id !== peerId),
              { id: peerId, label: label || (existing?.label ?? "Peer"), amount: newAmount },
            ];
          });
        }
        if (msg.type === "requestBets") {
          try {
            if (conn.open) conn.send({ type: "bets", payload: networkBetsRef.current });
          } catch {
            // ignore
          }
        }
      });
      conn.on("close", () => {
        const peerId = conn.peer;
        setConnections((prev) => {
          const next = new Map(prev);
          if (typeof peerId === "string") next.delete(peerId);
          connectionsRef.current = next;
          return next;
        });
      });
    });

    return id;
  },
    [networkBets]
  );

  const hostConnRef = useRef<DataConnection | null>(null);
  const peerConnectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const networkBetsRefPeer = useRef<WheelBet[]>([]);

  useEffect(() => {
    networkBetsRefPeer.current = networkBets;
  }, [networkBets]);

  const joinRoom = useCallback(async (id: string) => {
    const { default: Peer } = await import("peerjs");
    const p = new Peer(undefined as unknown as string, { host: "0.peerjs.com", secure: true, port: 443 });
    peerRef.current = p;
    setPeer(p);
    setRole("peer");
    setRoomId(id);
    setNetworkBets([]);
    hostConnRef.current = null;
    peerConnectionsRef.current = new Map();

    p.on("open", () => {
      setMyPeerId(p.id ?? null);
      const conn = p.connect(id);
      hostConnRef.current = conn;
      let fallbackDone = false;
      const tryBecomeHost = () => {
        if (fallbackDone) return;
        fallbackDone = true;
        try {
          clearTimeout(timer);
        } catch {
          // ignore
        }
        p.destroy();
        createRoom(id, () => joinRoom(id));
      };
      const timer = setTimeout(tryBecomeHost, 12000);
      let hostAliveTimer: ReturnType<typeof setTimeout> | null = null;
      let hostHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
      let hostResponded = false;
      let lastHostMessageTime = 0;
      /** When host disconnects, every peer tries to take over the same room. Delay so PeerJS server can release old host's id; retry a few times if claim fails. */
      const runPeerMigration = () => {
        const currentRoomId = id;
        const currentBets = networkBetsRefPeer.current;
        let retries = 0;
        const maxRetries = 3;
        const onIdTaken = () => {
          retries += 1;
          if (retries < maxRetries) {
            setTimeout(() => {
              createRoom(currentRoomId, onIdTaken, currentBets);
            }, 2500);
          } else {
            joinRoom(currentRoomId);
          }
        };
        try {
          p.destroy();
        } catch {
          // ignore
        }
        createRoom(currentRoomId, onIdTaken, currentBets);
      };
      const runPeerMigrationDelayed = () => {
        setTimeout(runPeerMigration, 2000);
      };
      conn.on("open", () => {
        if (fallbackDone) return;
        clearTimeout(timer);
        const sendRequestBets = () => {
          try {
            if (conn.open) conn.send({ type: "requestBets" });
          } catch {
            // ignore
          }
        };
        sendRequestBets();
        setTimeout(sendRequestBets, 800);
        hostAliveTimer = setTimeout(() => {
          if (hostResponded) return;
          if (hostAliveTimer != null) {
            clearTimeout(hostAliveTimer);
            hostAliveTimer = null;
          }
          tryBecomeHost();
        }, 2000);
      });
      conn.on("data", (data: unknown) => {
        lastHostMessageTime = Date.now();
        const msg = data as { type: string; payload?: unknown };
        if (msg.type === "bets" && Array.isArray(msg.payload)) {
          fallbackDone = true;
          hostResponded = true;
          if (hostAliveTimer != null) {
            clearTimeout(hostAliveTimer);
            hostAliveTimer = null;
          }
          setConnected(true);
          if (hostHeartbeatInterval == null) {
            hostHeartbeatInterval = setInterval(() => {
              if (Date.now() - lastHostMessageTime > 4000) {
                if (hostHeartbeatInterval != null) {
                  clearInterval(hostHeartbeatInterval);
                  hostHeartbeatInterval = null;
                }
                setConnected(false);
                runPeerMigrationDelayed();
              }
            }, 2000);
          }
          setNetworkBets(msg.payload as WheelBet[]);
        }
        if (msg.type === "youWon" && typeof msg.payload === "number") {
          window.dispatchEvent(new CustomEvent("wheel-peer-won", { detail: msg.payload }));
        }
        if (msg.type === "winner") {
          const pl = msg.payload;
          if (pl != null && typeof pl === "object" && "id" in pl && "spinAngle" in pl) {
            setWinnerId(String(pl.id));
            setWinnerSpinAngle(Number(pl.spinAngle));
          } else {
            setWinnerId(null);
            setWinnerSpinAngle(null);
          }
        }
        if (msg.type === "peerList" && Array.isArray(msg.payload)) {
          fallbackDone = true;
          hostResponded = true;
          if (hostAliveTimer != null) {
            clearTimeout(hostAliveTimer);
            hostAliveTimer = null;
          }
          setConnected(true);
          if (hostHeartbeatInterval == null) {
            hostHeartbeatInterval = setInterval(() => {
              if (Date.now() - lastHostMessageTime > 4000) {
                if (hostHeartbeatInterval != null) {
                  clearInterval(hostHeartbeatInterval);
                  hostHeartbeatInterval = null;
                }
                setConnected(false);
                runPeerMigrationDelayed();
              }
            }, 2000);
          }
          const list = msg.payload as string[];
          const myId = p.id ?? "";
          list.forEach((peerId) => {
            if (peerId === myId || peerConnectionsRef.current.has(peerId)) return;
            const pc = p.connect(peerId);
            pc.on("open", () => {
              peerConnectionsRef.current.set(peerId, pc);
              pc.on("data", (d: unknown) => {
                const mx = d as { type: string; payload?: unknown };
                if (mx.type === "newHost" && typeof mx.payload === "string") {
                  const newHostId = mx.payload;
                  peerConnectionsRef.current.forEach((c) => {
                    try {
                      if (c.open) c.close();
                    } catch {
                      // ignore
                    }
                  });
                  peerConnectionsRef.current.clear();
                  const newConn = p.connect(newHostId);
                  hostConnRef.current = newConn;
                  setRoomId(newHostId);
                  newConn.on("open", () => {
                    setConnected(true);
                    try {
                      if (newConn.open) newConn.send({ type: "requestBets" });
                    } catch {
                      // ignore
                    }
                  });
                  newConn.on("data", (data2: unknown) => {
                    const m2 = data2 as { type: string; payload?: unknown };
                    if (m2.type === "bets" && Array.isArray(m2.payload)) setNetworkBets(m2.payload as WheelBet[]);
                    if (m2.type === "youWon" && typeof m2.payload === "number")
                      window.dispatchEvent(new CustomEvent("wheel-peer-won", { detail: m2.payload }));
                    if (m2.type === "winner") {
                      const pl = m2.payload;
                      if (pl != null && typeof pl === "object" && "id" in pl && "spinAngle" in pl) {
                        setWinnerId(String(pl.id));
                        setWinnerSpinAngle(Number(pl.spinAngle));
                      } else {
                        setWinnerId(null);
                        setWinnerSpinAngle(null);
                      }
                    }
                    if (m2.type === "peerList" && Array.isArray(m2.payload)) {
                      (m2.payload as string[]).forEach((pid) => {
                        if (pid === p.id || peerConnectionsRef.current.has(pid)) return;
                        const pconn = p.connect(pid);
                        pconn.on("open", () => peerConnectionsRef.current.set(pid, pconn));
                      });
                    }
                  });
                  newConn.on("close", () => setConnected(false));
                }
              });
            });
          });
        }
        if (msg.type === "peerJoined" && typeof msg.payload === "string") {
          const peerId = msg.payload as string;
          if (peerId === p.id || peerConnectionsRef.current.has(peerId)) return;
          const pc = p.connect(peerId);
          pc.on("open", () => {
            peerConnectionsRef.current.set(peerId, pc);
            pc.on("data", (d: unknown) => {
              const mx = d as { type: string; payload?: unknown };
              if (mx.type === "newHost" && typeof mx.payload === "string") {
                const newHostId = mx.payload;
                peerConnectionsRef.current.forEach((c) => {
                  try {
                    if (c.open) c.close();
                } catch {
                  // ignore
                }
              });
              peerConnectionsRef.current.clear();
              const newConn = p.connect(newHostId);
              hostConnRef.current = newConn;
              setRoomId(newHostId);
              newConn.on("open", () => {
                setConnected(true);
                if (newConn.open) newConn.send({ type: "requestBets" });
              });
              newConn.on("data", (data2: unknown) => {
                const m2 = data2 as { type: string; payload?: unknown };
                if (m2.type === "bets" && Array.isArray(m2.payload)) setNetworkBets(m2.payload as WheelBet[]);
                if (m2.type === "youWon" && typeof m2.payload === "number")
                  window.dispatchEvent(new CustomEvent("wheel-peer-won", { detail: m2.payload }));
                if (m2.type === "winner") {
                  const pl = m2.payload;
                  if (pl != null && typeof pl === "object" && "id" in pl && "spinAngle" in pl) {
                    setWinnerId(String(pl.id));
                    setWinnerSpinAngle(Number(pl.spinAngle));
                  } else {
                    setWinnerId(null);
                    setWinnerSpinAngle(null);
                  }
                }
              });
              newConn.on("close", () => setConnected(false));
            }
            });
          });
        }
      });
      conn.on("close", () => {
        setConnected(false);
        if (hostHeartbeatInterval != null) {
          clearInterval(hostHeartbeatInterval);
          hostHeartbeatInterval = null;
        }
        if (!hostResponded && hostAliveTimer != null) {
          clearTimeout(hostAliveTimer);
          hostAliveTimer = null;
          tryBecomeHost();
          return;
        }
        runPeerMigrationDelayed();
      });
    });
    p.on("error", () => setConnected(false));

    p.on("connection", (incomingConn: DataConnection) => {
      incomingConn.on("open", () => {
        peerConnectionsRef.current.set(incomingConn.peer, incomingConn);
        incomingConn.on("data", (d: unknown) => {
          const mx = d as { type: string; payload?: unknown };
          if (mx.type === "newHost" && typeof mx.payload === "string") {
            const newHostId = mx.payload;
            peerConnectionsRef.current.forEach((c) => {
              try {
                if (c.open) c.close();
              } catch {
                // ignore
              }
            });
            peerConnectionsRef.current.clear();
            const newConn = p.connect(newHostId);
            hostConnRef.current = newConn;
            setRoomId(newHostId);
            newConn.on("open", () => {
              setConnected(true);
              if (newConn.open) newConn.send({ type: "requestBets" });
            });
            newConn.on("data", (data2: unknown) => {
              const m2 = data2 as { type: string; payload?: unknown };
              if (m2.type === "bets" && Array.isArray(m2.payload)) setNetworkBets(m2.payload as WheelBet[]);
              if (m2.type === "youWon" && typeof m2.payload === "number")
                window.dispatchEvent(new CustomEvent("wheel-peer-won", { detail: m2.payload }));
              if (m2.type === "winner") {
                const pl = m2.payload;
                if (pl != null && typeof pl === "object" && "id" in pl && "spinAngle" in pl) {
                  setWinnerId(String(pl.id));
                  setWinnerSpinAngle(Number(pl.spinAngle));
                } else {
                  setWinnerId(null);
                  setWinnerSpinAngle(null);
                }
              }
            });
            newConn.on("close", () => setConnected(false));
          }
        });
      });
    });
  }, [createRoom]);

  const leaveRoom = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    hostConnRef.current = null;
    setPeer(null);
    setRole(null);
    setRoomId(null);
    setMyPeerId(null);
    setPeerCount(0);
    setNetworkBets([]);
    setConnections(new Map());
    setConnected(false);
  }, []);

  useEffect(() => {
    const count = Array.from(connections.keys()).filter(
      (k) => typeof k === "string" && k.length > 0
    ).length;
    setPeerCount(count);
  }, [connections]);

  useEffect(() => {
    if (role !== "host" || connections.size === 0) return;
    broadcast({ type: "bets", payload: networkBets }, connections);
  }, [role, networkBets, broadcast, connections]);

  useEffect(() => {
    if (role !== "host" || connections.size === 0) return;
    const interval = setInterval(() => {
      broadcast({ type: "bets", payload: networkBetsRef.current }, connectionsRef.current);
    }, 2000);
    return () => clearInterval(interval);
  }, [role, connections.size, broadcast]);

  useEffect(() => {
    if (role !== "peer" || !connected) return;
    const interval = setInterval(() => {
      try {
        if (hostConnRef.current?.open) hostConnRef.current.send({ type: "requestBets" });
      } catch {
        // ignore
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [role, connected]);

  const placeBetToHost = useCallback(
    (bet: WheelBet) => {
      const conn = hostConnRef.current;
      if (conn?.open) conn.send({ type: "placeBet", payload: bet });
    },
    []
  );

  const notifyPeerWon = useCallback((peerId: string, amount: number) => {
    const conn = connectionsRef.current.get(peerId);
    if (conn?.open) conn.send({ type: "youWon", payload: amount });
  }, []);

  const setWinner = useCallback(
    (id: string | null, spinAngle?: number | null) => {
      setWinnerId(id);
      setWinnerSpinAngle(spinAngle ?? null);
      if (role === "host")
        broadcast({
          type: "winner",
          payload: id == null ? null : { id, spinAngle: spinAngle ?? 0 },
        });
    },
    [role, broadcast]
  );

  const value = useMemo(
    () => ({
      role,
      roomId,
      myPeerId,
      peerCount,
      connected,
      networkBets,
      setNetworkBets,
      createRoom,
      joinRoom,
      leaveRoom,
      placeBetToHost,
      notifyPeerWon,
      winnerId,
      winnerSpinAngle,
      setWinner,
    }),
    [
      role,
      roomId,
      myPeerId,
      peerCount,
      connected,
      networkBets,
      createRoom,
      joinRoom,
      leaveRoom,
      placeBetToHost,
      notifyPeerWon,
      winnerId,
      winnerSpinAngle,
      setWinner,
    ]
  );

  return (
    <WheelRoomContext.Provider value={value}>{children}</WheelRoomContext.Provider>
  );
}

export function useWheelRoom(): WheelRoomValue {
  const ctx = useContext(WheelRoomContext);
  if (!ctx) throw new Error("useWheelRoom must be used within WheelRoomProvider");
  return ctx;
}
