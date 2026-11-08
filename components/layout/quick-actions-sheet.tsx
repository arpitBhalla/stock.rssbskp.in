"use client";

import {
  PackagePlus,
  PackageMinus,
  ArrowLeftRight,
  Undo2,
  SlidersHorizontal,
  ScanLine,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useT } from "@/components/providers/i18n-provider";
import { useDepartment } from "@/components/providers/department-provider";
import type { EntryKind } from "@/components/providers/entry-provider";
import type { MessageKey } from "@/lib/i18n";

const ACTIONS: { kind: EntryKind; label: MessageKey; hint: MessageKey; icon: React.ComponentType<{ className?: string }>; managers: boolean }[] = [
  { kind: "receive", label: "qa.receive", hint: "qa.receiveHint", icon: PackagePlus, managers: true },
  { kind: "request", label: "qa.request", hint: "qa.requestHint", icon: ArrowLeftRight, managers: true },
  { kind: "return", label: "qa.return", hint: "qa.returnHint", icon: Undo2, managers: true },
  { kind: "issue", label: "qa.issue", hint: "qa.issueHint", icon: PackageMinus, managers: true },
  { kind: "adjust", label: "qa.adjust", hint: "qa.adjustHint", icon: SlidersHorizontal, managers: true },
  { kind: "scan", label: "qa.scan", hint: "qa.scanHint", icon: ScanLine, managers: false },
];

export function QuickActionsSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (kind: EntryKind) => void;
}) {
  const t = useT();
  const { canManage, current } = useDepartment();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-lg rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <SheetHeader className="pb-0">
          <SheetTitle className="text-lg">{t("nav.newEntry")}</SheetTitle>
          {current ? <p className="text-sm text-muted-foreground">{current.centerCode} · {current.name}</p> : null}
        </SheetHeader>
        <div className="grid grid-cols-2 gap-2 px-4">
          {ACTIONS.map(({ kind, label, hint, icon: Icon, managers }) => (
            <button
              key={kind}
              type="button"
              disabled={managers && !canManage}
              onClick={() => onPick(kind)}
              className="flex min-h-24 flex-col items-start justify-between gap-2 rounded-xl border bg-card p-3 text-left active:bg-foreground/5 disabled:opacity-50"
            >
              <Icon className="size-6 text-primary" />
              <span>
                <span className="block font-medium">{t(label)}</span>
                <span className="block text-xs text-muted-foreground">{t(hint)}</span>
              </span>
            </button>
          ))}
        </div>
        {!canManage ? (
          <p className="px-4 text-xs text-muted-foreground">{t("qa.managersOnly")}</p>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
