"use client";

type Preset = "safe" | "normal" | "aggressive";

const PRESETS: { id: Preset; label: string; value: number }[] = [
  { id: "safe", label: "Safe", value: 1.5 },
  { id: "normal", label: "Normal", value: 1.0 },
  { id: "aggressive", label: "Aggressive", value: 0.5 },
];

interface VolatilityControlProps {
  value: number;
  onChange: (value: number) => void;
}

export function VolatilityControl({ value, onChange }: VolatilityControlProps) {
  return (
    <div className="absolute left-4 top-14 z-50 flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[#0d0d0f] p-3 shadow-lg">
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        Volatility multiplier
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="h-2 w-32 cursor-pointer appearance-none rounded-full bg-[var(--muted)] accent-[var(--primary)]"
        />
        <span className="min-w-[3rem] text-sm tabular-nums text-[var(--foreground)]">
          {value.toFixed(1)}
        </span>
      </div>
      <div className="flex gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.value)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              Math.abs(value - preset.value) < 0.05
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "bg-[var(--muted)]/50 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
