"use client";

import { useState } from "react";
import { AlertTriangle, CloudUpload, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatDate } from "@/lib/i18n";
import type { RouterInputs } from "@/lib/trpc/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import { useOffline } from "@/components/providers/offline-provider";
import { EmptyState, ListCard, PageTitle, Section } from "@/components/app/section";
import { RahdariRow } from "@/components/app/rahdari-row";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Kind = NonNullable<RouterInputs["challans"]["list"]["kind"]>;
const KINDS: (Kind | undefined)[] = [undefined, "receipt", "transfer", "return", "issue", "adjustment"];

export default function RahdariListPage() {
  const { t, locale } = useI18n();
  const { current } = useDepartment();
  const { queue, online, syncing, syncNow, discard } = useOffline();
  const [kind, setKind] = useState<Kind | undefined>();
  const list = trpc.challans.list.useInfiniteQuery(
    { departmentId: current?.id, kind, limit: 30 },
    { enabled: !!current, getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <div className="space-y-4 pb-4">
      <PageTitle title={t("rahdari.title")} />

      {queue.length ? (
        <Section title={t("rahdari.pendingSync", { n: queue.length })}>
          <ListCard>
            {queue.map((m) => (
              <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                {m.error ? (
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                ) : (
                  <CloudUpload className="mt-0.5 size-5 shrink-0 text-sky-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(new Date(m.createdAt), locale, true)}</p>
                  {m.error ? <p className="text-sm text-destructive">{m.error}</p> : null}
                </div>
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={() => void discard(m.id)}
                  className="grid size-9 place-items-center rounded-full text-muted-foreground active:bg-foreground/5"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </ListCard>
          {online ? (
            <Button variant="outline" className="mt-2 h-11 w-full" disabled={syncing} onClick={() => void syncNow()}>
              {t("rahdari.syncNow")}
            </Button>
          ) : null}
        </Section>
      ) : null}

      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {KINDS.map((k) => (
          <button
            key={k ?? "all"}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-4 text-sm font-medium",
              kind === k ? "border-primary bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            {t(k ? `kind.${k}` : "kind.all")}
          </button>
        ))}
      </div>

      <div className="space-y-3 px-4">
        {list.isLoading && current ? (
          <Skeleton className="h-72" />
        ) : rows.length ? (
          <ListCard>
            {rows.map((r) => (
              <RahdariRow key={r.id} r={r} />
            ))}
          </ListCard>
        ) : (
          <EmptyState>{t("rahdari.empty")}</EmptyState>
        )}
        {list.hasNextPage ? (
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t("rahdari.loadMore")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
