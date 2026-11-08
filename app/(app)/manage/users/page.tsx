"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useT } from "@/components/providers/i18n-provider";
import { useMe } from "@/components/providers/me-provider";
import { EmptyState, ListCard, ListRow, PageTitle } from "@/components/app/section";
import { AddButton, FormSheet } from "@/components/app/form-sheet";
import { Field } from "@/components/entry/entry-sheet";
import { errorText } from "@/components/entry/use-after-entry";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

type User = RouterOutputs["users"]["list"][number];
type Role = "admin" | "manager" | "viewer";
type Access = "none" | "viewer" | "manager";
type Draft = {
  id?: string;
  name: string;
  username: string;
  password: string;
  role: Role;
  access: Record<number, Access>;
};

const toDraft = (u?: User): Draft => ({
  id: u?.id,
  name: u?.name ?? "",
  username: u?.username ?? "",
  password: "",
  role: (u?.role as Role) ?? "viewer",
  access: Object.fromEntries((u?.memberships ?? []).map((m) => [m.departmentId, m.role])),
});

export default function UsersPage() {
  const t = useT();
  const me = useMe();
  const utils = trpc.useUtils();
  const users = trpc.users.list.useQuery();
  const depts = trpc.departments.list.useQuery();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const create = trpc.users.create.useMutation();
  const setRole = trpc.users.setRole.useMutation();
  const setMemberships = trpc.users.setMemberships.useMutation();
  const remove = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success(t("toast.deleted"));
      setDraft(null);
      void utils.users.invalidate();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const deptName = new Map((depts.data ?? []).map((d) => [d.id, d.name]));
  const roleLabel = (r: string) => t(`manage.role.${(r === "admin" || r === "manager" ? r : "viewer") as Role}`);

  async function save() {
    if (!draft) return;
    const memberships = Object.entries(draft.access)
      .filter(([, a]) => a !== "none")
      .map(([departmentId, role]) => ({ departmentId: Number(departmentId), role: role as "manager" | "viewer" }));
    setSaving(true);
    try {
      if (draft.id) {
        const original = users.data?.find((u) => u.id === draft.id);
        if (original && original.role !== draft.role && draft.id !== me.id) {
          await setRole.mutateAsync({ userId: draft.id, role: draft.role });
        }
        await setMemberships.mutateAsync({ userId: draft.id, memberships });
      } else {
        await create.mutateAsync({
          name: draft.name.trim(),
          username: draft.username.trim(),
          password: draft.password,
          role: draft.role,
          memberships,
        });
      }
      toast.success(t("toast.saved"));
      setDraft(null);
      void utils.users.invalidate();
      void utils.departments.invalidate();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const isNew = draft && !draft.id;
  const canSave = !!draft && (!isNew || (draft.name.trim() && draft.username.trim().length >= 3 && draft.password.length >= 8));

  return (
    <div className="space-y-4 pb-6">
      <PageTitle
        title={t("manage.users")}
        back="/more"
        action={<AddButton label={t("common.add")} onClick={() => setDraft(toDraft())} />}
      />
      <div className="px-4">
        {users.data?.length ? (
          <ListCard>
            {users.data.map((u) => (
              <ListRow key={u.id} onClick={() => setDraft(toDraft(u))}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{u.name}</p>
                    <Badge variant="secondary">{roleLabel(u.role)}</Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    @{u.username ?? "—"}
                    {u.memberships.length
                      ? ` · ${u.memberships.map((m) => `${deptName.get(m.departmentId) ?? "?"}${m.role === "manager" ? " ★" : ""}`).join(", ")}`
                      : ""}
                  </p>
                </div>
              </ListRow>
            ))}
          </ListCard>
        ) : users.isLoading ? null : (
          <EmptyState>{t("common.nothingYet")}</EmptyState>
        )}
      </div>

      <FormSheet
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.id ? draft.name : t("manage.addUser")}
        onSave={save}
        saving={saving}
        canSave={!!canSave}
        onDelete={draft?.id && draft.id !== me.id ? () => remove.mutate({ userId: draft.id! }) : undefined}
      >
        {isNew ? (
          <>
            <Field label={t("common.name")} htmlFor="u-name">
              <Input id="u-name" className="h-11" value={draft.name} onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })} />
            </Field>
            <Field label={t("manage.username")} htmlFor="u-username">
              <Input
                id="u-username"
                className="h-11"
                autoCapitalize="none"
                autoCorrect="off"
                value={draft.username}
                onChange={(e) => setDraft((d) => d && { ...d, username: e.target.value })}
              />
            </Field>
            <Field label={t("manage.password")} hint="8+" htmlFor="u-password">
              <Input
                id="u-password"
                type="password"
                autoComplete="new-password"
                className="h-11"
                value={draft.password}
                onChange={(e) => setDraft((d) => d && { ...d, password: e.target.value })}
              />
            </Field>
          </>
        ) : null}

        <Field label={t("manage.globalRole")} htmlFor="u-role">
          <NativeSelect
            id="u-role"
            disabled={draft?.id === me.id}
            value={draft?.role ?? "viewer"}
            onChange={(e) => setDraft((d) => d && { ...d, role: e.target.value as Role })}
          >
            {(["viewer", "manager", "admin"] as const).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {draft?.role !== "admin" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("manage.memberships")}</p>
            {(depts.data ?? []).map((d) => {
              const value = draft?.access[d.id] ?? "none";
              return (
                <div key={d.id} className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm">
                    {d.name} <span className="text-muted-foreground">{d.centerCode}</span>
                  </p>
                  <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5">
                    {(["none", "viewer", "manager"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setDraft((s) => s && { ...s, access: { ...s.access, [d.id]: a } })}
                        className={cn(
                          "h-8 rounded-md px-2 text-xs font-medium",
                          value === a ? "bg-background shadow-sm" : "text-muted-foreground",
                        )}
                      >
                        {t(a === "none" ? "manage.noAccess" : a === "viewer" ? "manage.deptViewer" : "manage.deptManager")}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </FormSheet>
    </div>
  );
}
