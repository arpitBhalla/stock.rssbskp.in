"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/components/providers/i18n-provider";
import { EmptyState, ListCard, ListRow, PageTitle, Section } from "@/components/app/section";
import { AddButton, FormSheet } from "@/components/app/form-sheet";
import { Field } from "@/components/entry/entry-sheet";
import { errorText } from "@/components/entry/use-after-entry";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Draft = { id?: number; centerId?: number; name?: string; code?: string };

export default function DepartmentsPage() {
  const t = useT();
  const utils = trpc.useUtils();
  const centers = trpc.centers.list.useQuery();
  const depts = trpc.departments.list.useQuery();
  const [editing, setEditing] = useState<Draft | null>(null);
  const done = (msg: string) => {
    toast.success(msg);
    setEditing(null);
    void utils.departments.invalidate();
  };
  const onError = (e: unknown) => toast.error(errorText(e));
  const create = trpc.departments.create.useMutation({ onSuccess: () => done(t("toast.saved")), onError });
  const update = trpc.departments.update.useMutation({ onSuccess: () => done(t("toast.saved")), onError });
  const remove = trpc.departments.delete.useMutation({ onSuccess: () => done(t("toast.deleted")), onError });

  function save() {
    if (!editing?.centerId || !editing.name || !editing.code) return;
    const input = { centerId: editing.centerId, name: editing.name.trim(), code: editing.code.trim().toUpperCase() };
    if (editing.id) update.mutate({ ...input, id: editing.id });
    else create.mutate(input);
  }

  return (
    <div className="space-y-4 pb-6">
      <PageTitle
        title={t("manage.departments")}
        back="/more"
        action={<AddButton label={t("common.add")} onClick={() => setEditing({ centerId: centers.data?.[0]?.id })} />}
      />
      {centers.data?.length ? (
        centers.data.map((c) => {
          const rows = (depts.data ?? []).filter((d) => d.centerId === c.id);
          return (
            <Section key={c.id} title={`${c.code} · ${c.name}`}>
              {rows.length ? (
                <ListCard>
                  {rows.map((d) => (
                    <ListRow key={d.id} onClick={() => setEditing({ id: d.id, centerId: d.centerId, name: d.name, code: d.code })}>
                      <p className="flex-1 font-medium">{d.name}</p>
                      <span className="text-sm text-muted-foreground">{d.code}</span>
                    </ListRow>
                  ))}
                </ListCard>
              ) : (
                <EmptyState>{t("common.nothingYet")}</EmptyState>
              )}
            </Section>
          );
        })
      ) : centers.isLoading ? null : (
        <div className="px-4">
          <EmptyState>{t("common.nothingYet")}</EmptyState>
        </div>
      )}

      <FormSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? t("manage.editDepartment") : t("manage.addDepartment")}
        onSave={save}
        saving={create.isPending || update.isPending}
        canSave={!!editing?.centerId && !!editing?.name?.trim() && !!editing?.code?.trim()}
        onDelete={editing?.id ? () => remove.mutate({ id: editing.id! }) : undefined}
      >
        <Field label={t("common.center")} htmlFor="d-center">
          <NativeSelect
            id="d-center"
            value={editing?.centerId ?? ""}
            onChange={(e) => setEditing((s) => ({ ...s, centerId: Number(e.target.value) }))}
          >
            {centers.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("common.name")} htmlFor="d-name">
          <Input id="d-name" className="h-11" value={editing?.name ?? ""} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} />
        </Field>
        <Field label={t("common.code")} hint="LNG" htmlFor="d-code">
          <Input
            id="d-code"
            className="h-11 uppercase"
            autoCapitalize="characters"
            value={editing?.code ?? ""}
            onChange={(e) => setEditing((s) => ({ ...s, code: e.target.value }))}
          />
        </Field>
      </FormSheet>
    </div>
  );
}
