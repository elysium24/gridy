"use client";

import { Header } from "@/app/components/Header";
import { BinaryGame } from "@/app/components/BinaryGame";

export default function ChainReactionGamePage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)]">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="shrink-0 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
              Chain Reaction · 10s Up/Down
            </h2>
          </div>
          <div className="relative min-h-0 flex-1">
            <BinaryGame />
          </div>
        </section>
      </main>
    </div>
  );
}

