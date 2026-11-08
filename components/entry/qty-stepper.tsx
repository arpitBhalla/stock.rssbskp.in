"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Big −/+ buttons around a decimal keypad input. */
export function QtyStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  label,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  className?: string;
}) {
  const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(max, n));
  const btn =
    "grid size-11 shrink-0 place-items-center rounded-lg border bg-card active:bg-foreground/5 disabled:opacity-40";
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        aria-label={`− ${label}`}
        className={btn}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <Minus className="size-5" />
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        value={Number.isFinite(value) ? String(value) : ""}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const n = Number(e.currentTarget.value.replace(",", "."));
          onChange(Number.isFinite(n) ? clamp(n) : 0);
        }}
        className="h-11 w-16 min-w-0 rounded-lg border bg-transparent text-center text-lg font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <button
        type="button"
        aria-label={`+ ${label}`}
        className={btn}
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}
