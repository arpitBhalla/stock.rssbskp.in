"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { formatDate, itemsCount } from "@/lib/i18n";
import { useI18n } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { BorrowStatusBadge } from "@/components/app/badges";
import { EmptyState, ListCard, ListRow, PageTitle } from "@/components/app/section";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tab = "incoming" | "outgoing";

export default function BorrowsPage() {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const { current } = useDepartment();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "incoming" ? "incoming" : "outgoing");
  const list = trpc.borrows.list.useQuery(
    { departmentId: current?.id, direction: tab },
    { enabled: !!current },
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4 pb-4">
      <PageTitle title={t("borrows.title")} back="/more" />
      <div className="mx-4 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(["outgoing", "incoming"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("h-10 rounded-lg text-sm font-medium", tab === k ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {t(k === "incoming" ? "borrows.incoming" : "borrows.outgoing")}
          </button>
        ))}
      </div>

      <div className="px-4">
        {list.isLoading && current ? (
          <Skeleton className="h-64" />
        ) : list.data?.length ? (
          <ListCard>
            {list.data.map((b) => {
              const open = b.status === "approved" || b.status === "partially_returned";
              const overdue = open && b.dueDate && b.dueDate < today;
              return (
                <ListRow key={b.id} href={`/borrows/${b.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{tab === "incoming" ? b.toName : b.fromName}</p>
                      <BorrowStatusBadge status={b.status} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      #{b.id} · {itemsCount(t, b.totalQty ?? 0)} · {formatDate(b.requestedAt, locale)}
                    </p>
                    {b.dueDate && open ? (
                      <p className={cn("text-xs", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        {overdue ? `${t("borrows.overdue")} · ` : ""}
                        {t("borrows.due", { date: formatDate(b.dueDate, locale) })}
                      </p>
                    ) : null}
                  </div>
                </ListRow>
              );
            })}
          </ListCard>
        ) : (
          <EmptyState>{t("borrows.empty")}</EmptyState>
        )}
      </div>
    </div>
  );
}
