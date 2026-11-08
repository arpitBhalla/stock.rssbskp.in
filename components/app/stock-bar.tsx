import { cn } from "@/lib/utils";

/** On-hand vs required. Red when short, primary otherwise. */
export function StockBar({ quantity, required }: { quantity: number; required: number }) {
  if (required <= 0) return null;
  const pct = Math.min(100, Math.round((quantity / required) * 100));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", quantity < required ? "bg-destructive" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
