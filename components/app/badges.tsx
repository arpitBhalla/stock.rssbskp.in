"use client";

import {
  ArrowLeftRight,
  PackageMinus,
  PackagePlus,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { useT } from "@/components/providers/i18n-provider";
import type { RouterOutputs } from "@/lib/trpc/types";
import { cn } from "@/lib/utils";

type ChallanKind = RouterOutputs["challans"]["byId"]["kind"];
type ChallanStatus = RouterOutputs["challans"]["byId"]["status"];
type BorrowStatus = RouterOutputs["borrows"]["byId"]["status"];

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const CHALLAN_STATUS_STYLE: Record<ChallanStatus, string> = {
  issued: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300",
  acknowledged: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300",
  void: "bg-muted text-muted-foreground line-through",
};

const BORROW_STATUS_STYLE: Record<BorrowStatus, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300",
  approved: "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-300",
  partially_returned: "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-300",
  returned: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300",
  rejected: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export function ChallanStatusBadge({ status, kind }: { status: ChallanStatus; kind?: ChallanKind }) {
  const t = useT();
  // Receipts and adjustments are never "awaiting" anyone; show them as plain issued.
  const quiet = status === "issued" && (kind === "receipt" || kind === "adjustment");
  return (
    <span className={cn(pill, quiet ? "bg-muted text-muted-foreground" : CHALLAN_STATUS_STYLE[status])}>
      {t(`cstatus.${status}`)}
    </span>
  );
}

export function BorrowStatusBadge({ status }: { status: BorrowStatus }) {
  const t = useT();
  return <span className={cn(pill, BORROW_STATUS_STYLE[status])}>{t(`bstatus.${status}`)}</span>;
}

const KIND_ICON: Record<ChallanKind, React.ComponentType<{ className?: string }>> = {
  receipt: PackagePlus,
  transfer: ArrowLeftRight,
  return: Undo2,
  adjustment: SlidersHorizontal,
  issue: PackageMinus,
};

export function KindIcon({ kind, className }: { kind: ChallanKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary", className)}>
      <Icon className="size-5" />
    </span>
  );
}
