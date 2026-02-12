"use client";

import Link from "next/link";
import { Header } from "@/app/components/Header";

export default function Home() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)]">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          <div className="mx-auto w-full max-w-5xl rounded-2xl border border-[var(--border)] bg-[var(--panel)]/80 p-6 shadow-xl backdrop-blur">
            <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">
                  Choose your mode
                </h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Pick a game to start playing. More Gridy experiments are on the way.
                </p>
              </div>
            </header>

            <section className="space-y-4">
              <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                Available games
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Link
                  href="/games/bitcoin-grid"
                  className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]/80 transition hover:border-[var(--primary)] hover:shadow-[0_0_20px_rgba(56,189,248,0.25)]"
                >
                  <div
                    className="h-20 w-full shrink-0 rounded-t-xl bg-gradient-to-b from-amber-500/25 via-amber-500/10 to-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(to bottom, rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.06), transparent), radial-gradient(circle at 50% 30%, rgba(245, 158, 11, 0.15) 0%, transparent 50%)",
                    }}
                    aria-hidden
                  />
                  <div className="flex flex-1 flex-col justify-between px-4 pb-4 pt-2">
                    <div>
                      <div className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                        Game 01
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          >
                            <circle
                              cx="12"
                              cy="12"
                              r="9"
                              className="fill-amber-500/20 stroke-amber-400"
                            />
                            <path
                              d="M11 7.5h2.4a2.1 2.1 0 0 1 0 4.2H11m0-4.2V16m0-4.3h2.7a2.1 2.1 0 0 1 0 4.2H11"
                              className="stroke-amber-300"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill="none"
                            />
                          </svg>
                        </span>
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">
                          Bitcoin Grid Betting
                        </h3>
                      </div>
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
                  </div>
                </Link>

                <Link
                  href="/games/chain-reaction"
                  className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]/80 transition hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(52,211,153,0.25)]"
                >
                  <div
                    className="h-20 w-full shrink-0 rounded-t-xl bg-gradient-to-b from-emerald-500/25 via-emerald-500/10 to-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(to bottom, rgba(16, 185, 129, 0.22), rgba(16, 185, 129, 0.06), transparent), radial-gradient(circle at 50% 30%, rgba(16, 185, 129, 0.12) 0%, transparent 50%)",
                    }}
                    aria-hidden
                  />
                  <div className="flex flex-1 flex-col justify-between px-4 pb-4 pt-2">
                    <div>
                      <div className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                        Game 02
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/40">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          >
                            <path
                              d="M7 7.5 12 4l5 3.5-5 3.5-5-3.5Zm0 9 5-3.5 5 3.5-5 3.5-5-3.5Z"
                              className="fill-sky-400/30 stroke-sky-300"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">
                          Chain Reaction · Up/Down
                        </h3>
                      </div>
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
                  </div>
                </Link>

                {/* Game 03 placeholder */}
                <div className="flex flex-col overflow-hidden rounded-xl border border-dashed border-[var(--border)]/80 bg-[var(--background)]/60 text-[var(--muted)]">
                  <div
                    className="h-20 w-full shrink-0 rounded-t-xl bg-gradient-to-b from-zinc-600/20 via-zinc-600/8 to-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(to bottom, rgba(82, 82, 91, 0.18), rgba(82, 82, 91, 0.05), transparent), radial-gradient(circle at 50% 30%, rgba(113, 113, 122, 0.1) 0%, transparent 50%)",
                    }}
                    aria-hidden
                  />
                  <div className="flex flex-1 flex-col justify-between px-4 pb-4 pt-2">
                    <div>
                      <div className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.22em]">
                        Game 03
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 ring-1 ring-zinc-600/60">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          >
                            <rect
                              x="5"
                              y="6"
                              width="6"
                              height="6"
                              className="fill-zinc-700 stroke-zinc-400"
                              rx="1.2"
                            />
                            <rect
                              x="13"
                              y="12"
                              width="6"
                              height="6"
                              className="fill-zinc-800 stroke-zinc-500"
                              rx="1.2"
                            />
                          </svg>
                        </span>
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">
                          Coming soon
                        </h3>
                      </div>
                      <p className="mt-1 text-xs">
                        A new high-volatility game mode will appear here once it&apos;s
                        ready.
                      </p>
                    </div>
                    <div className="mt-3 text-xs">
                      Stay tuned for more Gridy experiments.
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
