"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { formatDate, formatQty } from "@/lib/i18n";
import { useI18n } from "@/components/providers/i18n-provider";
import { useEntry } from "@/components/providers/entry-provider";
import { BorrowStatusBadge, ChallanStatusBadge, KindIcon } from "@/components/app/badges";
import { ListCard, ListRow, PageTitle, Section } from "@/components/app/section";
import { errorText } from "@/components/entry/use-after-entry";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function BorrowPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { t, locale } = useI18n();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { openEntry } = useEntry();
  const borrow = trpc.borrows.byId.useQuery({ id }, { enabled: id > 0 });

  const onDone = (msg: string) => {
    toast.success(msg);
    void utils.invalidate();
  };
  const approve = trpc.borrows.approve.useMutation({
    onSuccess: (c) => {
      onDone(t("toast.approved", { number: c.number }));
      router.push(`/rahdari/${c.id}`);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const reject = trpc.borrows.reject.useMutation({
    onSuccess: () => onDone(t("toast.rejected")),
    onError: (e) => toast.error(errorText(e)),
  });
  const cancel = trpc.borrows.cancel.useMutation({
    onSuccess: () => onDone(t("toast.cancelled")),
    onError: (e) => toast.error(errorText(e)),
  });

  if (borrow.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  const b = borrow.data;
  if (!b) return <PageTitle title={t("common.error")} back="/borrows" />;
  const busy = approve.isPending || reject.isPending || cancel.isPending;
  const open = b.status === "approved" || b.status === "partially_returned";
  const overdue = open && b.dueDate && b.dueDate < new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5 pb-6">
      <PageTitle title={`#${b.id}`} back="/borrows" action={<BorrowStatusBadge status={b.status} />} />

      <div className="mx-4 space-y-3 rounded-2xl border bg-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("form.request.from")}</p>
            <p className="font-medium">{b.fromName}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("common.to")}</p>
            <p className="font-medium">{b.toName}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("borrows.requestedBy", { name: b.requesterName })} · {formatDate(b.requestedAt, locale, true)}
        </p>
        {b.dueDate ? (
          <p className={cn("text-sm", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
            {overdue ? `${t("borrows.overdue")} · ` : ""}
            {t("borrows.due", { date: formatDate(b.dueDate, locale) })}
          </p>
        ) : null}
        {b.note ? <p className="rounded-lg bg-muted p-2 text-sm">{b.note}</p> : null}
      </div>

      <Section title={t("common.items")}>
        <ListCard>
          {b.lines.map((l) => {
            const q = Number(l.quantity);
            const r = Number(l.returnedQty);
            return (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.itemName}</p>
                  {r > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("borrows.returnedOf", { r: formatQty(r), q: formatQty(q) })}
                    </p>
                  ) : null}
                </div>
                <p className="font-semibold tabular-nums">
                  {formatQty(q)} <span className="text-sm font-normal text-muted-foreground">{l.itemUnit}</span>
                </p>
              </div>
            );
          })}
        </ListCard>
      </Section>

      <div className="space-y-2 px-4">
        {b.can.approve ? (
          <>
            <Button className="h-12 w-full text-base" disabled={busy} onClick={() => approve.mutate({ id: b.id })}>
              {t("borrows.approve")}
            </Button>
            <Button variant="outline" className="h-12 w-full text-base" disabled={busy} onClick={() => reject.mutate({ id: b.id })}>
              {t("borrows.reject")}
            </Button>
          </>
        ) : null}
        {b.can.recordReturn ? (
          <Button className="h-12 w-full text-base" onClick={() => openEntry("return", { borrowId: b.id })}>
            {t("borrows.recordReturn")}
          </Button>
        ) : null}
        {b.can.cancel ? (
          <Button variant="ghost" className="h-11 w-full text-destructive" disabled={busy} onClick={() => cancel.mutate({ id: b.id })}>
            {t("borrows.cancel")}
          </Button>
        ) : null}
      </div>

      {b.challans.length ? (
        <Section title={t("borrows.documents")}>
          <ListCard>
            {b.challans.map((c) => (
              <ListRow key={c.id} href={`/rahdari/${c.id}`}>
                <KindIcon kind={c.kind} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-semibold">{c.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`kind.${c.kind}`)} · {formatDate(c.issuedAt, locale, true)}
                  </p>
                </div>
                <ChallanStatusBadge status={c.status} kind={c.kind} />
              </ListRow>
            ))}
          </ListCard>
        </Section>
      ) : null}
    </div>
  );
}
