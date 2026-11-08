"use client";

import { Plus, X } from "lucide-react";
import { useT } from "@/components/providers/i18n-provider";
import { QtyStepper } from "@/components/entry/qty-stepper";
import type { PickedItem } from "@/components/entry/item-picker";
import { formatMoney, formatQty } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export type Line = {
  itemId: number;
  name: string;
  unit: string;
  quantity: number;
  rate: number;
};

export const lineFromItem = (i: PickedItem, quantity = 1): Line => ({
  itemId: i.id,
  name: i.name,
  unit: i.unit,
  quantity,
  rate: 0,
});

/** Cart-style list of items with quantity (and rate for invoices). */
export function LineEditor({
  lines,
  onChange,
  onAdd,
  withRate = false,
  available,
}: {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  onAdd: () => void;
  withRate?: boolean;
  /** Caps quantities to what is on hand (issue, request). */
  available?: Map<number, number>;
}) {
  const t = useT();
  const update = (i: number, patch: Partial<Line>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + l.quantity * l.rate, 0);

  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const max = available?.get(l.itemId);
        return (
          <div key={l.itemId} className="space-y-2 rounded-xl border bg-card p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-tight">{l.name}</p>
                <p className="text-xs text-muted-foreground">
                  {l.unit}
                  {max !== undefined ? ` · ${t("common.available", { n: formatQty(max) })}` : ""}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("form.remove")}
                onClick={() => onChange(lines.filter((_, j) => j !== i))}
                className="-mr-1 -mt-1 grid size-9 place-items-center rounded-full text-muted-foreground active:bg-foreground/5"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <QtyStepper
                label={t("common.qty")}
                value={l.quantity}
                min={0}
                max={max}
                onChange={(n) => update(i, { quantity: n })}
              />
              {withRate ? (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground" htmlFor={`rate-${l.itemId}`}>
                    {t("form.receive.rate")}
                  </label>
                  <input
                    id={`rate-${l.itemId}`}
                    inputMode="decimal"
                    value={l.rate ? String(l.rate) : ""}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Number(e.currentTarget.value.replace(",", "."));
                      update(i, { rate: Number.isFinite(n) && n >= 0 ? n : 0 });
                    }}
                    className="h-11 w-24 rounded-lg border bg-transparent px-2 text-right tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
              ) : null}
            </div>
            {withRate && l.rate > 0 ? (
              <p className="text-right text-sm tabular-nums text-muted-foreground">
                {formatQty(l.quantity)} × {formatMoney(l.rate)} = {formatMoney(l.quantity * l.rate)}
              </p>
            ) : null}
          </div>
        );
      })}

      <Button type="button" variant="outline" className="h-12 w-full border-dashed text-base" onClick={onAdd}>
        <Plus className="size-5" />
        {t("form.addItem")}
      </Button>

      {withRate && lines.length ? (
        <div className="flex items-center justify-between px-1 pt-1 text-base font-semibold">
          <span>{t("common.total")}</span>
          <span className="tabular-nums">{formatMoney(total)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function validLines(lines: Line[]) {
  return lines.filter((l) => l.quantity > 0);
}
