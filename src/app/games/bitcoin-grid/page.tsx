"use client";

import { GridChart } from "@/app/components/GridChart";
import { Header } from "@/app/components/Header";
import { VolatilityControl } from "@/app/components/VolatilityControl";
import { useState } from "react";

export default function BitcoinGridGamePage() {
  const [volatilityMultiplier, setVolatilityMultiplier] = useState(0.5);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)]">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <h2 className="mb-2 shrink-0 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
            Bitcoin Grid Betting · $10 × 5s grid
          </h2>
          <div className="relative min-h-0 flex-1">
            <GridChart volatilityMultiplier={volatilityMultiplier} />
            <VolatilityControl
              value={volatilityMultiplier}
              onChange={setVolatilityMultiplier}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

