"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatDate, formatQty, itemsCount } from "@/lib/i18n";
import { useI18n } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { EmptyState, ListCard, ListRow, PageTitle, Section } from "@/components/app/section";
import { Field } from "@/components/entry/entry-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const isoDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default function ReportsPage() {
  const { t, locale } = useI18n();
  const { departments } = useDepartment();
  const outstanding = trpc.reports.outstandingBorrows.useQuery();
  const stock = trpc.reports.stockByDepartment.useQuery();

  const now = new Date();
  const [from, setFrom] = useState(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(isoDate(now));
  const [dept, setDept] = useState("");

  const byDept = new Map<string, NonNullable<typeof stock.data>>();
  for (const r of stock.data ?? []) {
    const key = `${r.centerCode} · ${r.departmentName}`;
    byDept.set(key, [...(byDept.get(key) ?? []), r]);
  }
  const exportHref = `/api/reports/rahdari?${new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(dept ? { departmentId: dept } : {}),
  })}`;

  return (
    <div className="space-y-6 pb-6">
      <PageTitle title={t("reports.title")} back="/more" />

      <Section title={t("reports.register")}>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("reports.registerHint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.from")} htmlFor="r-from">
              <Input id="r-from" type="date" className="h-11" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t("common.to")} htmlFor="r-to">
              <Input id="r-to" type="date" className="h-11" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <NativeSelect value={dept} onChange={(e) => setDept(e.target.value)} aria-label={t("common.department")}>
            <option value="">{t("reports.allDepts")}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.centerCode} · {d.name}
              </option>
            ))}
          </NativeSelect>
          <Button nativeButton={false} className="h-11 w-full" render={<a href={exportHref} download />}>
            <Download className="size-5" />
            {t("reports.export")}
          </Button>
        </div>
      </Section>

      <Section title={t("reports.outstanding")}>
        {outstanding.isLoading ? (
          <Skeleton className="h-32" />
        ) : outstanding.data?.length ? (
          <ListCard>
            {outstanding.data.map((b) => (
              <ListRow key={b.id} href={`/borrows/${b.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {b.fromName} → {b.toName}
                  </p>
                  <p className={cn("text-sm", b.overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    #{b.id} · {t("form.return.remaining", { n: formatQty(b.outstandingQty) })}
                    {b.dueDate ? ` · ${b.overdue ? t("borrows.overdue") : t("borrows.due", { date: formatDate(b.dueDate, locale) })}` : ""}
                  </p>
                </div>
              </ListRow>
            ))}
          </ListCard>
        ) : (
          <EmptyState>{t("reports.noOutstanding")}</EmptyState>
        )}
      </Section>

      <Section title={t("reports.stockByDept")}>
        {stock.isLoading ? (
          <Skeleton className="h-48" />
        ) : byDept.size ? (
          <div className="space-y-2">
            {[...byDept].map(([name, rows]) => {
              const short = rows.filter((r) => Number(r.quantity) < Number(r.requiredQty)).length;
              return (
                <details key={name} className="group overflow-hidden rounded-xl border bg-card">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-medium">
                    <span>{name}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {itemsCount(t, rows.length)}
                      {short ? <span className="ml-2 text-destructive">↓{short}</span> : null}
                    </span>
                  </summary>
                  <div className="divide-y border-t">
                    {rows.map((r) => {
                      const low = Number(r.quantity) < Number(r.requiredQty);
                      return (
                        <div key={r.itemId} className="flex items-center justify-between px-4 py-2 text-sm">
                          <span className="min-w-0 truncate">{r.itemName}</span>
                          <span className="shrink-0 tabular-nums">
                            <span className={cn("font-semibold", low && "text-destructive")}>{formatQty(r.quantity)}</span>
                            {Number(r.requiredQty) > 0 ? <span className="text-muted-foreground"> / {formatQty(r.requiredQty)}</span> : null}{" "}
                            <span className="text-muted-foreground">{r.unit}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <EmptyState>{t("common.nothingYet")}</EmptyState>
        )}
      </Section>
    </div>
  );
}
