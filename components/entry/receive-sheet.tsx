"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { uuid } from "@/lib/uuid";
import { compressImage, uploadAttachment } from "@/lib/image";
import { useT } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { useEntrySubmit, useOffline } from "@/components/providers/offline-provider";
import { EntrySheet, Field } from "@/components/entry/entry-sheet";
import { ItemPickerPanel } from "@/components/entry/item-picker";
import { LineEditor, lineFromItem, validLines, type Line } from "@/components/entry/line-editor";
import { errorText, useAfterEntry } from "@/components/entry/use-after-entry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ReceiveSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const { current } = useDepartment();
  const { online } = useOffline();
  const submitEntry = useEntrySubmit();
  const after = useAfterEntry();
  const mutation = trpc.inventory.bulkIntake.useMutation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [clientMutationId] = useState(uuid);
  const [partyName, setPartyName] = useState("");
  const [partyRef, setPartyRef] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const valid = validLines(lines);
  const canSubmit = !!current && partyName.trim() && valid.length > 0 && !busy;

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const blob = await compressImage(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  async function submit() {
    if (!current || !canSubmit) return;
    setBusy(true);
    try {
      let billAttachmentId: number | undefined;
      let photoSkipped = false;
      if (photo && online) {
        try {
          billAttachmentId = await uploadAttachment(photo.blob);
        } catch (e) {
          if (!(e instanceof TypeError)) throw e; // network failure: save without the photo
          photoSkipped = true;
        }
      } else if (photo) {
        photoSkipped = true;
      }
      const input = {
        departmentId: current.id,
        partyName: partyName.trim(),
        partyRef: partyRef.trim() || undefined,
        note: note.trim() || undefined,
        billAttachmentId,
        clientMutationId,
        lines: valid.map((l) => ({ itemId: l.itemId, quantity: l.quantity, rate: l.rate })),
      };
      const result = await submitEntry(
        { path: "inventory.bulkIntake", input, label: `${t("qa.receive")} · ${input.partyName}` },
        () => mutation.mutateAsync(input),
      );
      onOpenChange(false);
      after(result);
      if (photoSkipped) toast.warning(t("form.receive.photoSkipped"));
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
      title={t("form.receive.title")}
      description={current ? `${current.centerCode} · ${current.name}` : undefined}
      overlay={
        picking ? (
          <ItemPickerPanel
            allowCreate
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
          {busy ? t("common.saving") : t("form.receive.submit")}
        </Button>
      }
    >
      <Field label={t("form.receive.vendor")} htmlFor="vendor">
        <Input id="vendor" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="h-11" />
      </Field>
      <Field label={t("form.receive.billNo")} hint={t("common.optional")} htmlFor="billno">
        <Input id="billno" value={partyRef} onChange={(e) => setPartyRef(e.target.value)} className="h-11" />
      </Field>

      <LineEditor lines={lines} onChange={setLines} onAdd={() => setPicking(true)} withRate />

      <Field label={t("form.receive.photo")} hint={t("common.optional")}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onPhoto(e.target.files?.[0])}
        />
        {photo ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={photo.url} alt="" className="h-28 rounded-lg border object-cover" />
            <button
              type="button"
              aria-label={t("form.remove")}
              onClick={() => setPhoto(null)}
              className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-foreground text-background"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={!online}
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="size-5" />
            {t("form.receive.addPhoto")}
          </Button>
        )}
      </Field>

      <Field label={t("common.note")} hint={t("common.optional")} htmlFor="note">
        <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
    </EntrySheet>
  );
}
