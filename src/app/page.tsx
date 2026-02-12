"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--panel)]/80 p-6 shadow-xl backdrop-blur">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">
              Blocky Games Arcade
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Choose a game to start playing. More modes coming soon.
            </p>
          </div>
        </header>

        <section className="space-y-4">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Available games
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/games/bitcoin-grid"
              className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--background)]/80 p-4 transition hover:border-[var(--primary)] hover:shadow-[0_0_20px_rgba(56,189,248,0.25)]"
            >
              <div>
                <div className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Game 01
                </div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  Bitcoin Grid Betting
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Live BTC price grid. Place time/price range bets on a $10 × 5s
                  board and watch outcomes in real time.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]">
                <span>Grid-based BTC betting</span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--panel)]/80 px-2 py-0.5 text-[0.65rem] font-medium text-[var(--muted)] group-hover:border-[var(--primary)] group-hover:bg-[var(--primary)]/10 group-hover:text-[var(--primary)]">
                  Play
                </span>
              </div>
            </Link>

            <Link
              href="/games/chain-reaction"
              className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--background)]/80 p-4 transition hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(52,211,153,0.25)]"
            >
              <div>
                <div className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Game 02
                </div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  Chain Reaction · Up/Down
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  10-second BTC Up/Down with a 1.9x multiplier. Win streaks can
                  be cashed out or ridden to the limit.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]">
                <span>Streak-based compounding</span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--panel)]/80 px-2 py-0.5 text-[0.65rem] font-medium text-[var(--muted)] group-hover:border-emerald-400 group-hover:bg-emerald-500/10 group-hover:text-emerald-300">
                  Play
                </span>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
