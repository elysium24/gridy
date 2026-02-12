"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";

const INITIAL_BALANCE = 1000;
const STORAGE_KEY = "gridy:in-app-balance";

interface BalanceContextValue {
  balance: number;
  add: (amount: number) => void;
  deduct: (amount: number) => void;
  reset: () => void;
}

const BalanceContext = createContext<BalanceContextValue | null>(null);

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const [balance, setBalance] = useState(INITIAL_BALANCE);

  // Load persisted balance on mount (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored != null) {
        const value = Number(stored);
        if (!Number.isNaN(value) && value >= 0) {
          setBalance(value);
        }
      }
    } catch {
      // ignore storage errors and fall back to default
    }
  }, []);

  // Persist balance whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(balance));
    } catch {
      // ignore storage errors
    }
  }, [balance]);

  const add = useCallback((amount: number) => {
    setBalance((b) => b + amount);
  }, []);

  const deduct = useCallback((amount: number) => {
    setBalance((b) => Math.max(0, b - amount));
  }, []);

  const reset = useCallback(() => {
    setBalance(INITIAL_BALANCE);
  }, []);

  const value = useMemo(
    () => ({ balance, add, deduct, reset }),
    [balance, add, deduct, reset]
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
