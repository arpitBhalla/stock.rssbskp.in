"use client";

import { useI18n } from "@/components/providers/i18n-provider";
import { ChallanStatusBadge, KindIcon } from "@/components/app/badges";
import { ListRow } from "@/components/app/section";
import { formatDate, formatMoney, itemsCount } from "@/lib/i18n";
import type { RouterOutputs } from "@/lib/trpc/types";

type Row = RouterOutputs["challans"]["list"]["rows"][number];

export function RahdariRow({ r }: { r: Row }) {
  const { t, locale } = useI18n();
  const who =
    r.kind === "receipt"
      ? `${r.partyName ?? ""} → ${r.toName ?? ""}`
      : r.kind === "issue"
        ? `${r.fromName ?? ""} → ${r.partyName ?? ""}`
        : r.kind === "adjustment"
          ? (r.fromName ?? "")
          : `${r.fromName ?? ""} → ${r.toName ?? ""}`;
  return (
    <ListRow href={`/rahdari/${r.id}`}>
      <KindIcon kind={r.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-mono text-sm font-semibold">{r.number.split("/").pop()}</p>
          <ChallanStatusBadge status={r.status} kind={r.kind} />
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {t(`kind.${r.kind}`)} · {who}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <p>{formatDate(r.issuedAt, locale)}</p>
        <p>{r.totalAmount ? formatMoney(r.totalAmount) : itemsCount(t, r.lineCount ?? 0)}</p>
      </div>
    </ListRow>
  );
}
