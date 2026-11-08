"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ScanLine, Search } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatQty } from "@/lib/i18n";
import { useT } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { useEntry } from "@/components/providers/entry-provider";
import { EmptyState, ListCard, ListRow, PageTitle } from "@/components/app/section";
import { StockBar } from "@/components/app/stock-bar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function StockPage() {
  const t = useT();
  const params = useSearchParams();
  const { current } = useDepartment();
  const { openEntry } = useEntry();
  const [q, setQ] = useState("");
  const stock = trpc.inventory.listByDepartment.useQuery(
    { departmentId: current?.id ?? 0 },
    { enabled: !!current },
  );

  const query = q.trim().toLowerCase();
  const rows = (stock.data ?? []).filter(
    (r) =>
      !query ||
      r.itemName.toLowerCase().includes(query) ||
      r.itemSku.toLowerCase().includes(query) ||
      r.itemBarcode === q.trim(),
  );

  return (
    <div className="space-y-3 pb-4">
      <PageTitle title={t("nav.stock")} />
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 flex gap-2 bg-background px-4 pb-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus={params.get("focus") === "1"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("stock.search")}
            className="h-12 rounded-xl pl-9"
            type="search"
            autoCorrect="off"
          />
        </div>
        <button
          type="button"
          aria-label={t("qa.scan")}
          onClick={() => openEntry("scan")}
          className="grid size-12 place-items-center rounded-xl border bg-card"
        >
          <ScanLine className="size-5" />
        </button>
      </div>

      <div className="px-4">
        {stock.isLoading && current ? (
          <Skeleton className="h-64" />
        ) : rows.length ? (
          <ListCard>
            {rows.map((r) => {
              const qty = Number(r.quantity);
              const req = Number(r.requiredQty);
              return (
                <ListRow key={r.itemId} href={`/stock/${r.itemId}`}>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.itemName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.itemSku} · {r.itemUnit}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("text-lg font-semibold tabular-nums leading-tight", req > 0 && qty < req && "text-destructive")}>
                          {formatQty(qty)}
                        </p>
                        {req > 0 ? (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {t("common.required")} {formatQty(req)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <StockBar quantity={qty} required={req} />
                  </div>
                </ListRow>
              );
            })}
          </ListCard>
        ) : (
          <EmptyState>{query ? t("stock.noMatch") : t("stock.empty")}</EmptyState>
        )}
      </div>
    </div>
  );
}
