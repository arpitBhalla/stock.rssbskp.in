"use client";

import { useState } from "react";
import Link from "next/link";
import { QrCode, ScanLine, Search } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { hasRole } from "@/lib/permissions";
import { useT } from "@/components/providers/i18n-provider";
import { useMe } from "@/components/providers/me-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { EmptyState, ListCard, ListRow, PageTitle } from "@/components/app/section";
import { AddButton, FormSheet } from "@/components/app/form-sheet";
import { Field } from "@/components/entry/entry-sheet";
import { Scanner } from "@/components/entry/scanner";
import { errorText } from "@/components/entry/use-after-entry";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Draft = { id?: number; name?: string; sku?: string; unit?: string; barcode?: string | null; description?: string | null };

export default function ItemsPage() {
  const t = useT();
  const me = useMe();
  const utils = trpc.useUtils();
  const { departments } = useDepartment();
  const items = trpc.items.list.useQuery();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [scanning, setScanning] = useState(false);
  // Mirrors the server rule: catalog managers, admins, or any dept manager.
  const canEdit = hasRole(me.role, "manager") || departments.some((d) => d.role === "manager");

  const done = (msg: string) => {
    toast.success(msg);
    setEditing(null);
    void utils.items.invalidate();
  };
  const onError = (e: unknown) => toast.error(errorText(e));
  const create = trpc.items.create.useMutation({ onSuccess: () => done(t("toast.saved")), onError });
  const update = trpc.items.update.useMutation({ onSuccess: () => done(t("toast.saved")), onError });
  const remove = trpc.items.delete.useMutation({ onSuccess: () => done(t("toast.deleted")), onError });

  function save() {
    if (!editing?.name || !editing.sku) return;
    const input = {
      name: editing.name.trim(),
      sku: editing.sku.trim().toUpperCase(),
      unit: editing.unit?.trim() || "pcs",
      barcode: editing.barcode?.trim() || null,
      description: editing.description?.trim() || null,
    };
    if (editing.id) update.mutate({ ...input, id: editing.id });
    else create.mutate(input);
  }

  const query = q.trim().toLowerCase();
  const rows = (items.data ?? []).filter(
    (i) => !query || i.name.toLowerCase().includes(query) || i.sku.toLowerCase().includes(query) || i.barcode === q.trim(),
  );

  return (
    <div className="space-y-4 pb-6">
      <PageTitle
        title={t("manage.items")}
        back="/more"
        action={canEdit ? <AddButton label={t("common.add")} onClick={() => setEditing({ unit: "pcs" })} /> : undefined}
      />
      <div className="flex gap-2 px-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("picker.search")} className="h-11 pl-9" type="search" />
        </div>
        <Link
          href="/manage/items/labels"
          aria-label={t("manage.labels")}
          className="grid size-11 place-items-center rounded-lg border bg-card"
        >
          <QrCode className="size-5" />
        </Link>
      </div>
      <div className="px-4">
        {rows.length ? (
          <ListCard>
            {rows.map((i) => (
              <ListRow key={i.id} onClick={canEdit ? () => setEditing(i) : undefined} href={canEdit ? undefined : `/stock/${i.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {i.sku} · {i.unit}
                    {i.barcode ? ` · ${i.barcode}` : ""}
                  </p>
                </div>
              </ListRow>
            ))}
          </ListCard>
        ) : items.isLoading ? null : (
          <EmptyState>{query ? t("stock.noMatch") : t("common.nothingYet")}</EmptyState>
        )}
      </div>

      <FormSheet
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setScanning(false);
          }
        }}
        title={editing?.id ? t("manage.editItem") : t("manage.addItem")}
        onSave={save}
        saving={create.isPending || update.isPending}
        canSave={!!editing?.name?.trim() && !!editing?.sku?.trim()}
        onDelete={editing?.id ? () => remove.mutate({ id: editing.id! }) : undefined}
      >
        <Field label={t("common.name")} htmlFor="i-name">
          <Input id="i-name" className="h-11" value={editing?.name ?? ""} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("manage.sku")} htmlFor="i-sku">
            <Input
              id="i-sku"
              className="h-11 uppercase"
              autoCapitalize="characters"
              value={editing?.sku ?? ""}
              onChange={(e) => setEditing((s) => ({ ...s, sku: e.target.value }))}
            />
          </Field>
          <Field label={t("common.unit")} htmlFor="i-unit">
            <Input id="i-unit" className="h-11" value={editing?.unit ?? ""} onChange={(e) => setEditing((s) => ({ ...s, unit: e.target.value }))} />
          </Field>
        </div>
        <Field label={t("manage.barcode")} hint={t("common.optional")} htmlFor="i-barcode">
          <div className="flex gap-2">
            <Input
              id="i-barcode"
              className="h-11"
              inputMode="numeric"
              value={editing?.barcode ?? ""}
              onChange={(e) => setEditing((s) => ({ ...s, barcode: e.target.value }))}
            />
            <button
              type="button"
              aria-label={t("qa.scan")}
              onClick={() => setScanning((v) => !v)}
              className="grid size-11 shrink-0 place-items-center rounded-lg border"
            >
              <ScanLine className="size-5" />
            </button>
          </div>
        </Field>
        {scanning ? (
          <Scanner
            onCode={(code) => {
              setEditing((s) => ({ ...s, barcode: code }));
              setScanning(false);
            }}
          />
        ) : null}
        <Field label={t("manage.description")} hint={t("common.optional")} htmlFor="i-desc">
          <Textarea id="i-desc" rows={2} value={editing?.description ?? ""} onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))} />
        </Field>
      </FormSheet>
    </div>
  );
}
