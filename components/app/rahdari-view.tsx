"use client";

import { useI18n } from "@/components/providers/i18n-provider";
import { ChallanStatusBadge } from "@/components/app/badges";
import { formatDate, formatMoney, formatQty } from "@/lib/i18n";
import type { ChallanDetail } from "@/server/stock/challan-detail";

type Viewable = Omit<ChallanDetail, "issuedBy" | "billAttachmentId" | "acknowledgedByPhone">;

/** Read-only Rahdari body, shared by the in-app detail and the public QR page. */
export function RahdariView({ d }: { d: Viewable }) {
  const { t, locale } = useI18n();
  const invoice = d.kind === "receipt";

  const parties: { label: string; value: string; sub?: string }[] =
    d.kind === "receipt"
      ? [
          { label: t("rahdari.vendor"), value: d.partyName ?? "—", sub: d.partyRef ? `${t("rahdari.billNo")} ${d.partyRef}` : undefined },
          { label: t("common.to"), value: d.toName ?? "—" },
        ]
      : d.kind === "issue"
        ? [
            { label: t("common.from"), value: d.fromName ?? "—" },
            { label: t("rahdari.recipient"), value: d.partyName ?? "—" },
          ]
        : d.kind === "adjustment"
          ? [{ label: t("common.department"), value: d.fromName ?? "—" }]
          : [
              { label: t("common.from"), value: d.fromName ?? "—" },
              { label: t("common.to"), value: d.toName ?? "—" },
            ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {t(`kind.${d.kind}`)} · {d.center.name}
            </p>
            <p className="break-all font-mono text-lg font-semibold">{d.number}</p>
            <p className="text-sm text-muted-foreground">{formatDate(d.issuedAt, locale, true)}</p>
          </div>
          <ChallanStatusBadge status={d.status} kind={d.kind} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {parties.map((p) => (
            <div key={p.label} className={parties.length === 1 ? "col-span-2" : undefined}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{p.label}</p>
              <p className="font-medium">{p.value}</p>
              {p.sub ? <p className="text-sm text-muted-foreground">{p.sub}</p> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="divide-y overflow-hidden rounded-2xl border bg-card">
        {d.lines.map((l) => {
          const q = Number(l.quantity);
          return (
            <div key={l.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{l.itemName}</p>
                <p className="text-xs text-muted-foreground">
                  {l.itemSku}
                  {invoice && l.rate ? ` · ${formatQty(q)} × ${formatMoney(l.rate)}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums">
                  {d.kind === "adjustment" && q > 0 ? "+" : ""}
                  {formatQty(q)} <span className="text-sm font-normal text-muted-foreground">{l.unit}</span>
                </p>
                {invoice ? <p className="text-sm tabular-nums text-muted-foreground">{formatMoney(l.amount ?? 0)}</p> : null}
              </div>
            </div>
          );
        })}
        {invoice ? (
          <div className="flex items-center justify-between px-4 py-3 text-base font-semibold">
            <span>{t("common.total")}</span>
            <span className="tabular-nums">{formatMoney(d.totalAmount ?? 0)}</span>
          </div>
        ) : null}
      </div>

      {d.note ? (
        <div className="rounded-xl bg-muted p-3 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {d.kind === "adjustment" ? t("rahdari.reason") : t("common.note")}
          </p>
          <p>{d.note}</p>
        </div>
      ) : null}
      {d.status === "void" && d.voidReason ? (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {t("rahdari.voided", { reason: d.voidReason })}
        </p>
      ) : null}

      <div className="space-y-1 px-1 text-sm text-muted-foreground">
        <p>{t("rahdari.issuedBy", { name: d.issuedByName })}</p>
        {d.acknowledgedAt ? (
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            {t("rahdari.receivedBy", { name: d.acknowledgedByName ?? "" })} · {formatDate(d.acknowledgedAt, locale, true)}
          </p>
        ) : d.acknowledgeable && d.status === "issued" ? (
          <p>{t("rahdari.awaiting")}</p>
        ) : null}
      </div>
    </div>
  );
}
