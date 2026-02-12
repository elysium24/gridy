"use client";

import Link from "next/link";
import { useBalance } from "@/contexts/BalanceContext";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PriceFeedStatus } from "./PriceFeedStatus";

export function Header() {
  const { balance, reset } = useBalance();
  const { connected, publicKey } = useWallet();

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3 md:px-6">
      <div>
        <Link href="/" className="inline-flex items-center">
          <h1 className="text-xl font-bold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors">
            Gridy
          </h1>
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 font-mono text-sm transition-colors hover:border-[var(--primary)] hover:bg-[var(--border)]/40"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            In-app balance
          </span>
          <span className="font-mono-tab text-lg text-[var(--neon-green)]">
            ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-[var(--muted)]">USDC (test)</span>
        </button>
        <PriceFeedStatus />
        <div className="[&_.wallet-adapter-button]:!rounded-lg [&_.wallet-adapter-button]:!border [&_.wallet-adapter-button]:!border-[var(--border)] [&_.wallet-adapter-button]:!bg-[var(--panel)] [&_.wallet-adapter-button]:!px-4 [&_.wallet-adapter-button]:!py-2 [&_.wallet-adapter-button]:!text-sm [&_.wallet-adapter-button]:!text-[var(--foreground)] [&_.wallet-adapter-button]:!transition-colors [&_.wallet-adapter-button:hover]:!bg-[var(--border)]">
          <WalletMultiButton />
        </div>
        {connected && publicKey && (
          <span className="max-w-[120px] truncate text-xs text-[var(--muted)]" title={publicKey.toBase58()}>
            {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
          </span>
        )}
      </div>
    </header>
  );
}
