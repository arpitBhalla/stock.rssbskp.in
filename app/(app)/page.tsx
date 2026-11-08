"use client";

import Link from "next/link";
import { ScanLine, Search } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { formatDate, formatQty } from "@/lib/i18n";
import { useI18n } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { useEntry } from "@/components/providers/entry-provider";
import { EmptyState, ListCard, ListRow, Section } from "@/components/app/section";
import { RahdariRow } from "@/components/app/rahdari-row";
import { StockBar } from "@/components/app/stock-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/entry/use-after-entry";

export default function HomePage() {
  const { t, locale } = useI18n();
  const utils = trpc.useUtils();
  const { current, canManage } = useDepartment();
  const { openEntry } = useEntry();
  const departmentId = current?.id;
  const enabled = !!departmentId;

  const toApprove = trpc.borrows.list.useQuery({ departmentId, direction: "incoming", status: "pending" }, { enabled });
  const toReturn = trpc.borrows.list.useQuery({ departmentId, direction: "outgoing", status: "open" }, { enabled });
  const waiting = trpc.borrows.list.useQuery({ departmentId, direction: "outgoing", status: "pending" }, { enabled });
  const low = trpc.inventory.lowStock.useQuery({ departmentId }, { enabled });
  const recent = trpc.challans.list.useQuery({ departmentId, limit: 5 }, { enabled });

  const approve = trpc.borrows.approve.useMutation({
    onSuccess: (c) => {
      toast.success(t("toast.approved", { number: c.number }));
      void utils.invalidate();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const reject = trpc.borrows.reject.useMutation({
    onSuccess: () => {
      toast.success(t("toast.rejected"));
      void utils.borrows.invalidate();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const needsAction = (toApprove.data?.length ?? 0) + (toReturn.data?.length ?? 0) + (waiting.data?.length ?? 0);

  return (
    <div className="space-y-6 pt-4">
      <div className="flex gap-2 px-4">
        <Link
          href="/stock?focus=1"
          className="flex h-12 flex-1 items-center gap-2 rounded-xl border bg-card px-3 text-muted-foreground"
        >
          <Search className="size-5" />
          <span className="truncate">{t("home.search")}</span>
        </Link>
        <button
          type="button"
          aria-label={t("qa.scan")}
          onClick={() => openEntry("scan")}
          className="grid size-12 place-items-center rounded-xl border bg-card active:bg-foreground/5"
        >
          <ScanLine className="size-5" />
        </button>
      </div>

      {needsAction ? (
        <div className="space-y-5">
          {toApprove.data?.length ? (
            <Section title={t("home.toApprove")} href="/borrows?tab=incoming" hrefLabel={t("common.seeAll")}>
              <ListCard>
                {toApprove.data.map((b) => (
                  <div key={b.id} className="space-y-2 px-4 py-3">
                    <Link href={`/borrows/${b.id}`} className="block">
                      <p className="font-medium">{t("home.toApproveRow", { dept: b.toName, n: formatQty(b.totalQty ?? 0) })}</p>
                      <p className="text-sm text-muted-foreground">
                        {b.requesterName}
                        {b.dueDate ? ` · ${t("home.dueOn", { date: formatDate(b.dueDate, locale) })}` : ""}
                      </p>
                    </Link>
                    {canManage ? (
                      <div className="flex gap-2">
                        <Button
                          className="h-10 flex-1"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate({ id: b.id })}
                        >
                          {t("home.approve")}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 flex-1"
                          disabled={reject.isPending}
                          onClick={() => reject.mutate({ id: b.id })}
                        >
                          {t("home.reject")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </ListCard>
            </Section>
          ) : null}

          {toReturn.data?.length ? (
            <Section title={t("home.toReturn")}>
              <ListCard>
                {toReturn.data.map((b) => (
                  <ListRow
                    key={b.id}
                    href={canManage ? undefined : `/borrows/${b.id}`}
                    onClick={canManage ? () => openEntry("return", { borrowId: b.id }) : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {t("home.toReturnRow", {
                          dept: b.fromName,
                          n: formatQty(Number(b.totalQty) - Number(b.returnedQty)),
                        })}
                      </p>
                      {b.dueDate ? (
                        <p className={new Date(b.dueDate) < new Date() ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
                          {t("borrows.due", { date: formatDate(b.dueDate, locale) })}
                        </p>
                      ) : null}
                    </div>
                  </ListRow>
                ))}
              </ListCard>
            </Section>
          ) : null}

          {waiting.data?.length ? (
            <Section title={t("home.waiting")}>
              <ListCard>
                {waiting.data.map((b) => (
                  <ListRow key={b.id} href={`/borrows/${b.id}`}>
                    <p className="min-w-0 flex-1 truncate font-medium">
                      {t("home.waitingRow", { dept: b.fromName, n: formatQty(b.totalQty ?? 0) })}
                    </p>
                  </ListRow>
                ))}
              </ListCard>
            </Section>
          ) : null}
        </div>
      ) : null}

      <Section title={t("home.lowStock")}>
        {low.isLoading && enabled ? (
          <Skeleton className="h-28" />
        ) : low.data?.length ? (
          <ListCard>
            {low.data.map((r) => (
              <ListRow key={r.itemId} href={`/stock/${r.itemId}`}>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{r.itemName}</p>
                    <p className="shrink-0 text-sm tabular-nums">
                      <span className="font-semibold text-destructive">{formatQty(r.quantity)}</span>
                      <span className="text-muted-foreground"> / {formatQty(r.requiredQty)}</span>
                    </p>
                  </div>
                  <StockBar quantity={Number(r.quantity)} required={Number(r.requiredQty)} />
                </div>
              </ListRow>
            ))}
          </ListCard>
        ) : (
          <EmptyState>{t("home.allGood")}</EmptyState>
        )}
      </Section>

      <Section title={t("home.recent")} href="/rahdari" hrefLabel={t("common.seeAll")}>
        {recent.isLoading && enabled ? (
          <Skeleton className="h-40" />
        ) : recent.data?.rows.length ? (
          <ListCard>
            {recent.data.rows.map((r) => (
              <RahdariRow key={r.id} r={r} />
            ))}
          </ListCard>
        ) : (
          <EmptyState>{t("rahdari.empty")}</EmptyState>
        )}
      </Section>
    </div>
  );
}
