"use client";

import { WheelRoomProvider } from "@/contexts/WheelRoomContext";
import { Header } from "@/app/components/Header";
import { LuckyWheelGame } from "@/app/components/LuckyWheelGame";

export default function GlobalWheelGamePage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)]">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="shrink-0 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
              The Global Wheel · 60s pari-mutuel
            </h2>
          </div>
          <div className="relative flex min-h-[420px] flex-1 flex-col">
            <WheelRoomProvider>
              <LuckyWheelGame />
            </WheelRoomProvider>
          </div>
        </section>
      </main>
    </div>
  );
}
