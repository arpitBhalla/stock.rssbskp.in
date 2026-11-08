"use client";

import { use, useState } from "react";
import Link from "next/link";
import { PackageMinus, SlidersHorizontal, Target } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { formatDate, formatQty } from "@/lib/i18n";
import { useI18n } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { useEntry } from "@/components/providers/entry-provider";
import { EmptyState, ListCard, PageTitle, Section } from "@/components/app/section";
import { StockBar } from "@/components/app/stock-bar";
import { EntrySheet } from "@/components/entry/entry-sheet";
import { QtyStepper } from "@/components/entry/qty-stepper";
import { errorText } from "@/components/entry/use-after-entry";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function ItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params);
  const { t, locale } = useI18n();
  const utils = trpc.useUtils();
  const { current, canManage } = useDepartment();
  const { openEntry } = useEntry();
  const detail = trpc.inventory.itemDetail.useQuery(
    { itemId: Number(itemId), departmentId: current?.id },
    { enabled: Number(itemId) > 0 },
  );
  const [reqOpen, setReqOpen] = useState(false);
  const [required, setRequired] = useState(0);
  const setReq = trpc.inventory.setRequired.useMutation({
    onSuccess: () => {
      toast.success(t("stock.requiredSaved"));
      setReqOpen(false);
      void utils.inventory.invalidate();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  const d = detail.data;
  if (!d) return <PageTitle title={t("common.error")} back="/stock" />;

  const here = d.holdings.find((h) => h.departmentId === current?.id);
  const qty = Number(here?.quantity ?? 0);
  const req = Number(here?.requiredQty ?? 0);
  const others = d.holdings.filter((h) => h.departmentId !== current?.id && Number(h.quantity) > 0);
  const preset = { itemId: d.item.id, itemName: d.item.name, unit: d.item.unit };

  return (
    <div className="space-y-6 pb-4">
      <div>
        <PageTitle title={d.item.name} back="/stock" />
        <p className="px-4 text-sm text-muted-foreground">
          {d.item.sku} · {d.item.unit}
          {d.item.barcode ? ` · ${d.item.barcode}` : ""}
        </p>
      </div>

      <div className="mx-4 space-y-3 rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {current?.name} · {t("common.onHand")}
        </p>
        <div className="flex items-end justify-between">
          <p className={cn("text-4xl font-semibold tabular-nums", req > 0 && qty < req && "text-destructive")}>
            {formatQty(qty)}
            <span className="ml-1 text-base font-normal text-muted-foreground">{d.item.unit}</span>
          </p>
          {req > 0 ? (
            <p className="text-sm text-muted-foreground tabular-nums">
              {t("common.required")} {formatQty(req)}
            </p>
          ) : null}
        </div>
        <StockBar quantity={qty} required={req} />
        {!here ? <p className="text-sm text-muted-foreground">{t("stock.notHere")}</p> : null}
        {canManage ? (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <Button variant="outline" className="h-12 flex-col gap-0.5 text-xs" onClick={() => openEntry("adjust", preset)}>
              <SlidersHorizontal className="size-4" />
              {t("qa.adjust")}
            </Button>
            <Button
              variant="outline"
              className="h-12 flex-col gap-0.5 text-xs"
              disabled={qty <= 0}
              onClick={() => openEntry("issue", preset)}
            >
              <PackageMinus className="size-4" />
              {t("qa.issue")}
            </Button>
            <Button
              variant="outline"
              className="h-12 flex-col gap-0.5 text-xs"
              onClick={() => {
                setRequired(req);
                setReqOpen(true);
              }}
            >
              <Target className="size-4" />
              {t("common.required")}
            </Button>
          </div>
        ) : null}
      </div>

      <Section title={t("stock.whereHeld")}>
        {others.length ? (
          <ListCard>
            {others.map((h) => (
              <div key={h.departmentId} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{h.departmentName}</p>
                  <p className="text-xs text-muted-foreground">{h.centerCode}</p>
                </div>
                <p className="font-semibold tabular-nums">{formatQty(h.quantity)}</p>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => openEntry("request", { ...preset, fromDepartmentId: h.departmentId })}
                  >
                    {t("qa.request")}
                  </Button>
                ) : null}
              </div>
            ))}
          </ListCard>
        ) : (
          <EmptyState>{t("stock.noOthers")}</EmptyState>
        )}
      </Section>

      <Section title={t("stock.history")}>
        {d.history.length ? (
          <ListCard>
            {d.history.map((h) => {
              const delta = Number(h.delta);
              return (
                <div key={h.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t(`txn.${h.kind}`)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(h.createdAt, locale, true)}
                      {h.performedByName ? ` · ${h.performedByName}` : ""}
                    </p>
                    {h.challanId ? (
                      <Link href={`/rahdari/${h.challanId}`} className="font-mono text-xs text-primary">
                        {h.challanNumber}
                      </Link>
                    ) : null}
                    {h.note ? <p className="text-sm text-muted-foreground">{h.note}</p> : null}
                  </div>
                  <p className={cn("font-semibold tabular-nums", delta < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                    {delta > 0 ? "+" : ""}
                    {formatQty(delta)}
                  </p>
                </div>
              );
            })}
          </ListCard>
        ) : (
          <EmptyState>{t("stock.noHistory")}</EmptyState>
        )}
      </Section>

      <EntrySheet
        open={reqOpen}
        onOpenChange={setReqOpen}
        tall={false}
        title={t("stock.setRequired")}
        description={d.item.name}
        footer={
          <Button
            className="h-12 w-full text-base"
            disabled={!current || setReq.isPending}
            onClick={() =>
              current && setReq.mutate({ departmentId: current.id, itemId: d.item.id, requiredQty: required })
            }
          >
            {t("common.save")}
          </Button>
        }
      >
        <QtyStepper label={t("common.required")} value={required} onChange={setRequired} step={5} />
      </EntrySheet>
    </div>
  );
}
