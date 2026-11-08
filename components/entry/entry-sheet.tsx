"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Tall bottom sheet with a scrolling body and a sticky footer for the submit
 * button. `overlay` (e.g. the item picker) temporarily replaces body+footer,
 * which avoids stacking dialogs on small screens.
 */
export function EntrySheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  overlay,
  children,
  tall = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  overlay?: React.ReactNode;
  children: React.ReactNode;
  tall?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "mx-auto max-w-lg gap-0 rounded-t-2xl p-0",
          tall ? "h-[92svh]" : "max-h-[92svh]",
        )}
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        {overlay ? (
          <div className="flex min-h-0 flex-1 flex-col">{overlay}</div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
              {children}
            </div>
            {footer ? (
              <div className="border-t bg-background p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
                {footer}
              </div>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {hint ? <span className="ml-1 font-normal text-muted-foreground">({hint})</span> : null}
      </label>
      {children}
    </div>
  );
}
