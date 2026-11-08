"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { EntrySheet, Field } from "@/components/entry/entry-sheet";
import { ItemPickerPanel } from "@/components/entry/item-picker";
import { LineEditor, lineFromItem, validLines, type Line } from "@/components/entry/line-editor";
import { errorText } from "@/components/entry/use-after-entry";
import { useAvailability } from "@/components/entry/use-availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

/** Ask another department to lend items. Needs a connection (it notifies the lender). */
export function RequestSheet({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preset?: { fromDepartmentId?: number; itemId?: number; itemName?: string; unit?: string };
}) {
  const t = useT();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { current } = useDepartment();
  const allDepts = trpc.departments.list.useQuery();
  const mutation = trpc.borrows.request.useMutation();

  const [fromId, setFromId] = useState<number | undefined>(preset?.fromDepartmentId);
  const [lines, setLines] = useState<Line[]>(() =>
    preset?.itemId && preset.itemName
      ? [{ itemId: preset.itemId, name: preset.itemName, unit: preset.unit ?? "", quantity: 1, rate: 0 }]
      : [],
  );
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [picking, setPicking] = useState(false);
  const lender = useAvailability(fromId);

  const lenders = (allDepts.data ?? []).filter((d) => d.id !== current?.id);
  const valid = validLines(lines);
  const canSubmit = !!current && !!fromId && valid.length > 0 && !mutation.isPending;

  async function submit() {
    if (!current || !fromId || !canSubmit) return;
    try {
      const b = await mutation.mutateAsync({
        fromDepartmentId: fromId,
        toDepartmentId: current.id,
        dueDate: dueDate || undefined,
        note: note.trim() || undefined,
        lines: valid.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
      });
      onOpenChange(false);
      void utils.borrows.invalidate();
      toast.success(t("form.request.sent", { dept: lenders.find((d) => d.id === fromId)?.name ?? "" }));
      router.push(`/borrows/${b.id}`);
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  return (
    <EntrySheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("form.request.title")}
      description={current ? `→ ${current.name}` : undefined}
      overlay={
        picking ? (
          <ItemPickerPanel
            available={fromId ? lender : undefined}
            excludeIds={lines.map((l) => l.itemId)}
            onCancel={() => setPicking(false)}
            onPick={(item) => {
              setLines((ls) => [...ls, lineFromItem(item)]);
              setPicking(false);
            }}
          />
        ) : null
      }
      footer={
        <Button className="h-12 w-full text-base" disabled={!canSubmit} onClick={submit}>
          {mutation.isPending ? t("common.saving") : t("form.request.submit")}
        </Button>
      }
    >
      <Field label={t("form.request.from")} htmlFor="lender">
        <NativeSelect
          id="lender"
          value={fromId ?? ""}
          onChange={(e) => setFromId(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">{t("form.request.pickDept")}</option>
          {lenders.map((d) => (
            <option key={d.id} value={d.id}>
              {d.centerCode} · {d.name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <LineEditor
        lines={lines}
        onChange={setLines}
        onAdd={() => setPicking(true)}
        available={fromId ? lender : undefined}
      />

      <Field label={t("form.request.due")} hint={t("common.optional")} htmlFor="due">
        <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-11" />
      </Field>
      <Field label={t("common.note")} hint={t("common.optional")} htmlFor="req-note">
        <Textarea id="req-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
    </EntrySheet>
  );
}
