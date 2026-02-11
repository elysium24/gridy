"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const INITIAL_BALANCE = 1000;

interface BalanceContextValue {
  balance: number;
  add: (amount: number) => void;
  deduct: (amount: number) => void;
}

const BalanceContext = createContext<BalanceContextValue | null>(null);

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const [balance, setBalance] = useState(INITIAL_BALANCE);

  const add = useCallback((amount: number) => {
    setBalance((b) => b + amount);
  }, []);

  const deduct = useCallback((amount: number) => {
    setBalance((b) => Math.max(0, b - amount));
  }, []);

  const value = useMemo(
    () => ({ balance, add, deduct }),
    [balance, add, deduct]
  );

  return (
    <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>
  );
}

export function useBalance(): BalanceContextValue {
  const ctx = useContext(BalanceContext);
  if (!ctx) throw new Error("useBalance must be used within BalanceProvider");
  return ctx;
}
