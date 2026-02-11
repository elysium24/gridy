"use client";

import { BalanceProvider } from "@/contexts/BalanceContext";
import { WalletProvider } from "./WalletProvider";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <BalanceProvider>
        <div className="flex h-full min-h-0 flex-col">{children}</div>
      </BalanceProvider>
    </WalletProvider>
  );
}
