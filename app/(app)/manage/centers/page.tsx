"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useT } from "@/components/providers/i18n-provider";
import { EmptyState, ListCard, ListRow, PageTitle } from "@/components/app/section";
import { AddButton, FormSheet } from "@/components/app/form-sheet";
import { Field } from "@/components/entry/entry-sheet";
import { errorText } from "@/components/entry/use-after-entry";
import { Input } from "@/components/ui/input";

type Center = RouterOutputs["centers"]["list"][number];

export default function CentersPage() {
  const t = useT();
  const utils = trpc.useUtils();
  const centers = trpc.centers.list.useQuery();
  const [editing, setEditing] = useState<Partial<Center> | null>(null);
  const done = (msg: string) => {
    toast.success(msg);
    setEditing(null);
    void utils.centers.invalidate();
    void utils.departments.invalidate();
  };
  const onError = (e: unknown) => toast.error(errorText(e));
  const create = trpc.centers.create.useMutation({ onSuccess: () => done(t("toast.saved")), onError });
  const update = trpc.centers.update.useMutation({ onSuccess: () => done(t("toast.saved")), onError });
  const remove = trpc.centers.delete.useMutation({ onSuccess: () => done(t("toast.deleted")), onError });

  function save() {
    if (!editing?.name || !editing.code) return;
    const input = { name: editing.name.trim(), code: editing.code.trim().toUpperCase(), address: editing.address?.trim() || null };
    if (editing.id) update.mutate({ ...input, id: editing.id });
    else create.mutate(input);
  }

  return (
    <div className="space-y-4 pb-6">
      <PageTitle
        title={t("manage.centers")}
        back="/more"
        action={<AddButton label={t("common.add")} onClick={() => setEditing({})} />}
      />
      <div className="px-4">
        {centers.data?.length ? (
          <ListCard>
            {centers.data.map((c) => (
              <ListRow key={c.id} onClick={() => setEditing(c)}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.code}
                    {c.address ? ` · ${c.address}` : ""}
                  </p>
                </div>
              </ListRow>
            ))}
          </ListCard>
        ) : centers.isLoading ? null : (
          <EmptyState>{t("common.nothingYet")}</EmptyState>
        )}
      </div>

      <FormSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? t("manage.editCenter") : t("manage.addCenter")}
        onSave={save}
        saving={create.isPending || update.isPending}
        canSave={!!editing?.name?.trim() && !!editing?.code?.trim()}
        onDelete={editing?.id ? () => remove.mutate({ id: editing.id! }) : undefined}
      >
        <Field label={t("common.name")} htmlFor="c-name">
          <Input id="c-name" className="h-11" value={editing?.name ?? ""} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} />
        </Field>
        <Field label={t("common.code")} hint="SKP" htmlFor="c-code">
          <Input
            id="c-code"
            className="h-11 uppercase"
            autoCapitalize="characters"
            value={editing?.code ?? ""}
            onChange={(e) => setEditing((s) => ({ ...s, code: e.target.value }))}
          />
        </Field>
        <Field label={t("manage.address")} hint={t("common.optional")} htmlFor="c-address">
          <Input id="c-address" className="h-11" value={editing?.address ?? ""} onChange={(e) => setEditing((s) => ({ ...s, address: e.target.value }))} />
        </Field>
      </FormSheet>
    </div>
  );
}
