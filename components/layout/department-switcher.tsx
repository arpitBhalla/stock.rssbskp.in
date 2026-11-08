"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  useDepartment,
  type DepartmentOption,
} from "@/components/providers/department-provider";
import { useT } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

export function DepartmentSwitcher() {
  const t = useT();
  const { departments, current, isLoading, select } = useDepartment();
  const [open, setOpen] = useState(false);

  const byCenter = new Map<string, DepartmentOption[]>();
  for (const d of departments) {
    const key = `${d.centerCode} · ${d.centerName}`;
    byCenter.set(key, [...(byCenter.get(key) ?? []), d]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!departments.length}
        className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg px-2 -mx-2 text-left active:bg-foreground/5 disabled:opacity-60"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground leading-none">
            {current ? `${current.centerCode}${current.role === "viewer" ? ` · ${t("shell.viewer")}` : ""}` : isLoading ? "…" : ""}
          </p>
          <p className="truncate font-semibold leading-tight mt-0.5">
            {current?.name ?? (isLoading ? t("common.loading") : t("shell.noDepartments"))}
          </p>
        </div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-lg max-h-[80svh] rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <SheetHeader className="pb-0">
            <SheetTitle>{t("shell.switchDept")}</SheetTitle>
            <SheetDescription>{t("shell.switchDeptHint")}</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-2">
            {[...byCenter].map(([center, depts]) => (
              <div key={center} className="py-2">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {center}
                </p>
                {depts.map((d) => {
                  const active = d.id === current?.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        select(d.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex min-h-12 w-full items-center justify-between rounded-lg px-3 text-left text-base active:bg-foreground/5",
                        active && "font-semibold text-primary",
                      )}
                    >
                      <span>
                        {d.name}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          {d.code}
                        </span>
                      </span>
                      {active && <Check className="size-5" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
