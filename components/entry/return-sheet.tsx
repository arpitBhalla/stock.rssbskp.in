"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { uuid } from "@/lib/uuid";
import { formatQty } from "@/lib/i18n";
import { useT } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { useEntrySubmit } from "@/components/providers/offline-provider";
import { EntrySheet } from "@/components/entry/entry-sheet";
import { QtyStepper } from "@/components/entry/qty-stepper";
import { errorText, useAfterEntry } from "@/components/entry/use-after-entry";
import { EmptyState } from "@/components/app/section";
import { Button } from "@/components/ui/button";

export function ReturnSheet({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preset?: { borrowId?: number };
}) {
  const t = useT();
  const { current } = useDepartment();
  const submitEntry = useEntrySubmit();
  const after = useAfterEntry();
  const mutation = trpc.borrows.recordReturn.useMutation();

  const openBorrows = trpc.borrows.list.useQuery(
    { departmentId: current?.id, direction: "any", status: "open" },
    { enabled: !!current && !preset?.borrowId },
  );
  const [borrowId, setBorrowId] = useState<number | undefined>(preset?.borrowId);
  const borrow = trpc.borrows.byId.useQuery({ id: borrowId ?? 0 }, { enabled: !!borrowId });
  const [clientMutationId] = useState(uuid);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);

  const lines = (borrow.data?.lines ?? [])
    .map((l) => ({ ...l, remaining: Number(l.quantity) - Number(l.returnedQty) }))
    .filter((l) => l.remaining > 0);
  // Default every line to "all of it" until the user changes it.
  const qtyOf = (id: number, remaining: number) => qty[id] ?? remaining;
  const chosen = lines
    .map((l) => ({ borrowItemId: l.id, quantity: qtyOf(l.id, l.remaining) }))
    .filter((l) => l.quantity > 0);
  const canSubmit = !!borrowId && chosen.length > 0 && !busy;

  async function submit() {
    if (!borrowId || !canSubmit || !borrow.data) return;
    setBusy(true);
    try {
      const input = { id: borrowId, clientMutationId, lines: chosen };
      const result = await submitEntry(
        {
          path: "borrows.recordReturn",
          input,
          label: `${t("qa.return")} · ${borrow.data.toName} → ${borrow.data.fromName}`,
        },
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
      title={t("form.return.title")}
      footer={
        borrowId ? (
          <Button className="h-12 w-full text-base" disabled={!canSubmit} onClick={submit}>
            {busy ? t("common.saving") : t("form.return.submit")}
          </Button>
        ) : null
      }
    >
      {!borrowId ? (
        <>
          <p className="text-sm font-medium">{t("form.return.pick")}</p>
          {openBorrows.data?.length ? (
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {openBorrows.data.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBorrowId(b.id)}
                  className="flex min-h-14 w-full flex-col items-start justify-center px-4 py-2 text-left active:bg-foreground/5"
                >
                  <span className="font-medium">{t("borrows.request", { id: b.id, from: b.fromName, to: b.toName })}</span>
                  <span className="text-sm text-muted-foreground">
                    {t("form.return.remaining", { n: formatQty(Number(b.totalQty) - Number(b.returnedQty)) })}
                  </span>
                </button>
              ))}
            </div>
          ) : openBorrows.isLoading ? null : (
            <EmptyState>{t("form.return.none")}</EmptyState>
          )}
        </>
      ) : (
        <>
          {borrow.data ? (
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {t("borrows.request", { id: borrow.data.id, from: borrow.data.fromName, to: borrow.data.toName })}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQty(Object.fromEntries(lines.map((l) => [l.id, l.remaining])))}
              >
                {t("form.return.all")}
              </Button>
            </div>
          ) : null}
          {lines.map((l) => (
            <div key={l.id} className="space-y-2 rounded-xl border bg-card p-3">
              <div>
                <p className="font-medium leading-tight">{l.itemName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("form.return.remaining", { n: `${formatQty(l.remaining)} ${l.itemUnit}` })}
                </p>
              </div>
              <QtyStepper
                label={t("common.qty")}
                value={qtyOf(l.id, l.remaining)}
                min={0}
                max={l.remaining}
                onChange={(n) => setQty((q) => ({ ...q, [l.id]: n }))}
              />
            </div>
          ))}
        </>
      )}
    </EntrySheet>
  );
}
