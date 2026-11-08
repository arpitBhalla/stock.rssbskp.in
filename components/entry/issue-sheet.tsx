"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { uuid } from "@/lib/uuid";
import { useT } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { useEntrySubmit } from "@/components/providers/offline-provider";
import { EntrySheet, Field } from "@/components/entry/entry-sheet";
import { ItemPickerPanel } from "@/components/entry/item-picker";
import { LineEditor, lineFromItem, validLines, type Line } from "@/components/entry/line-editor";
import { errorText, useAfterEntry } from "@/components/entry/use-after-entry";
import { useAvailability } from "@/components/entry/use-availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function IssueSheet({
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
  const mutation = trpc.inventory.issue.useMutation();

  const [clientMutationId] = useState(uuid);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    preset?.itemId && preset.itemName
      ? [{ itemId: preset.itemId, name: preset.itemName, unit: preset.unit ?? "", quantity: 1, rate: 0 }]
      : [],
  );
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const valid = validLines(lines);
  const canSubmit = !!current && recipient.trim() && valid.length > 0 && !busy;

  async function submit() {
    if (!current || !canSubmit) return;
    setBusy(true);
    try {
      const input = {
        departmentId: current.id,
        recipient: recipient.trim(),
        note: note.trim() || undefined,
        clientMutationId,
        lines: valid.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
      };
      const result = await submitEntry(
        { path: "inventory.issue", input, label: `${t("qa.issue")} · ${input.recipient}` },
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
      title={t("form.issue.title")}
      description={current ? `${current.centerCode} · ${current.name}` : undefined}
      overlay={
        picking ? (
          <ItemPickerPanel
            available={available}
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
          {busy ? t("common.saving") : t("form.issue.submit")}
        </Button>
      }
    >
      <Field label={t("form.issue.recipient")} htmlFor="recipient">
        <Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} className="h-11" />
      </Field>
      <LineEditor lines={lines} onChange={setLines} onAdd={() => setPicking(true)} available={available} />
      <Field label={t("common.note")} hint={t("common.optional")} htmlFor="issue-note">
        <Textarea id="issue-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
    </EntrySheet>
  );
}
