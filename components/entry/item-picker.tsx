"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Plus, ScanLine, Search } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { formatQty } from "@/lib/i18n";
import { getRecentItemIds, pushRecentItem } from "@/lib/recent-items";
import { useT } from "@/components/providers/i18n-provider";
import { Scanner } from "@/components/entry/scanner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PickedItem = RouterOutputs["items"]["list"][number];

function autoSku(name: string) {
  const stem = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "ITEM";
  return `${stem}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/**
 * Full-height item search shown inside an entry sheet. Recent items first,
 * matches by name/SKU/barcode, optional scan, optional quick-create.
 */
export function ItemPickerPanel({
  onPick,
  onCancel,
  available,
  excludeIds = [],
  allowCreate = false,
}: {
  onPick: (item: PickedItem) => void;
  onCancel: () => void;
  /** Quantity on hand per item id, shown next to each row. */
  available?: Map<number, number>;
  excludeIds?: number[];
  allowCreate?: boolean;
}) {
  const t = useT();
  const utils = trpc.useUtils();
  const items = trpc.items.list.useQuery();
  const create = trpc.items.create.useMutation();
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState(false);
  const [newUnit, setNewUnit] = useState("pcs");
  const [recentIds] = useState(getRecentItemIds);

  const pick = (item: PickedItem) => {
    pushRecentItem(item.id);
    onPick(item);
  };

  const all = useMemo(
    () => (items.data ?? []).filter((i) => !excludeIds.includes(i.id)),
    [items.data, excludeIds],
  );
  const query = q.trim().toLowerCase();
  const matches = query
    ? all.filter(
        (i) =>
          i.name.toLowerCase().includes(query) ||
          i.sku.toLowerCase().includes(query) ||
          i.barcode?.toLowerCase() === query,
      )
    : all;
  const recent = query
    ? []
    : recentIds.map((id) => all.find((i) => i.id === id)).filter((i): i is PickedItem => !!i);
  const exact = all.some((i) => i.name.toLowerCase() === query);

  async function onScan(code: string) {
    setScanning(false);
    const found = await utils.items.byCode.fetch({ code });
    if (found) pick(found);
    else toast.error(t("scan.notFound", { code }));
  }

  async function onCreate() {
    try {
      const item = await create.mutateAsync({ name: q.trim(), sku: autoSku(q), unit: newUnit.trim() || "pcs" });
      await utils.items.list.invalidate();
      pick(item);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const row = (i: PickedItem) => {
    const have = available?.get(i.id);
    return (
      <button
        key={i.id}
        type="button"
        onClick={() => pick(i)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-foreground/5"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{i.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {i.sku} · {i.unit}
          </p>
        </div>
        {available ? (
          <span className={cn("text-sm tabular-nums", have ? "text-foreground" : "text-muted-foreground")}>
            {t("common.available", { n: formatQty(have ?? 0) })}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("common.back")}
          className="grid size-10 shrink-0 place-items-center rounded-full active:bg-foreground/5"
        >
          <ChevronLeft className="size-6" />
        </button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("picker.search")}
            className="h-11 pl-9"
            autoCorrect="off"
          />
        </div>
        <button
          type="button"
          onClick={() => setScanning((s) => !s)}
          aria-label={t("qa.scan")}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-lg border",
            scanning && "border-primary bg-primary/10 text-primary",
          )}
        >
          <ScanLine className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {scanning ? (
          <div className="p-4">
            <Scanner onCode={onScan} />
          </div>
        ) : null}

        {allowCreate && query && !exact ? (
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Plus className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-medium">{t("picker.newItem", { name: q.trim() })}</span>
            <Input
              aria-label={t("common.unit")}
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              className="h-9 w-20"
            />
            <Button size="sm" className="h-9" onClick={onCreate} disabled={create.isPending}>
              {t("common.add")}
            </Button>
          </div>
        ) : null}

        {recent.length ? (
          <>
            <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("picker.recent")}
            </p>
            <div className="divide-y">{recent.map(row)}</div>
            <p className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("picker.all")}
            </p>
          </>
        ) : null}
        <div className="divide-y">{matches.map(row)}</div>
        {!items.isLoading && !matches.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t("picker.none")}</p>
        ) : null}
      </div>
    </div>
  );
}
