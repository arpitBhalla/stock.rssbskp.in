"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { uuid } from "@/lib/uuid";
import { formatQty } from "@/lib/i18n";
import { useT } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { useEntrySubmit } from "@/components/providers/offline-provider";
import { EntrySheet, Field } from "@/components/entry/entry-sheet";
import { ItemPickerPanel } from "@/components/entry/item-picker";
import { QtyStepper } from "@/components/entry/qty-stepper";
import { errorText, useAfterEntry } from "@/components/entry/use-after-entry";
import { useAvailability } from "@/components/entry/use-availability";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Picked = { id: number; name: string; unit: string };

export function AdjustSheet({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preset?: { itemId?: number; itemName?: string; unit?: string };
}) {
  const t = useT();
  const { current } = useDepartment();
  const available = useAvailability(current?.id);
  const submitEntry = useEntrySubmit();
  const after = useAfterEntry();
  const mutation = trpc.inventory.adjust.useMutation();

  const [clientMutationId] = useState(uuid);
  const [item, setItem] = useState<Picked | null>(
    preset?.itemId && preset.itemName ? { id: preset.itemId, name: preset.itemName, unit: preset.unit ?? "" } : null,
  );
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [picking, setPicking] = useState(!item);
  const [busy, setBusy] = useState(false);

  const have = item ? (available.get(item.id) ?? 0) : 0;
  const canSubmit = !!current && !!item && qty > 0 && reason.trim().length >= 3 && !busy;

  async function submit() {
    if (!current || !item || !canSubmit) return;
    setBusy(true);
    try {
      const input = {
        departmentId: current.id,
        itemId: item.id,
        delta: direction === "add" ? qty : -qty,
        reason: reason.trim(),
        clientMutationId,
      };
      const result = await submitEntry(
        { path: "inventory.adjust", input, label: `${t("qa.adjust")} · ${item.name}` },
        () => mutation.mutateAsync(input),
      );
      onOpenChange(false);
      after(result);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntrySheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("form.adjust.title")}
      description={current ? `${current.centerCode} · ${current.name}` : undefined}
      overlay={
        picking ? (
          <ItemPickerPanel
            available={available}
            onCancel={() => (item ? setPicking(false) : onOpenChange(false))}
            onPick={(i) => {
              setItem({ id: i.id, name: i.name, unit: i.unit });
              setPicking(false);
            }}
          />
        ) : null
      }
      footer={
        <Button className="h-12 w-full text-base" disabled={!canSubmit} onClick={submit}>
          {busy ? t("common.saving") : t("form.adjust.submit")}
        </Button>
      }
    >
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item?.name ?? t("form.adjust.pickItem")}</p>
          {item ? (
            <p className="text-sm text-muted-foreground">
              {t("common.onHand")}: {formatQty(have)} {item.unit}
            </p>
          ) : null}
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(["remove", "add"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={cn(
              "h-11 rounded-lg text-base font-medium",
              direction === d ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {t(d === "add" ? "form.adjust.add" : "form.adjust.remove")}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <QtyStepper
          label={t("common.qty")}
          value={qty}
          min={0}
          max={direction === "remove" ? have : undefined}
          onChange={setQty}
        />
        {item ? (
          <p className="text-sm tabular-nums text-muted-foreground">
            {formatQty(have)} → <span className="font-semibold text-foreground">{formatQty(direction === "add" ? have + qty : have - qty)}</span>
          </p>
        ) : null}
      </div>

      <Field label={t("form.adjust.reason")} htmlFor="reason">
        <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Field>
    </EntrySheet>
  );
}
