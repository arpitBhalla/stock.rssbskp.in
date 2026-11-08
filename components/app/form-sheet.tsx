"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useT } from "@/components/providers/i18n-provider";
import { EntrySheet } from "@/components/entry/entry-sheet";
import { Button } from "@/components/ui/button";

/** Short bottom-sheet form with Save, and an optional two-tap Delete. */
export function FormSheet({
  open,
  onOpenChange,
  title,
  onSave,
  saving,
  canSave = true,
  onDelete,
  deleteLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  onSave: () => void;
  saving?: boolean;
  canSave?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  return (
    <EntrySheet
      open={open}
      onOpenChange={(o) => {
        setConfirming(false);
        onOpenChange(o);
      }}
      tall={false}
      title={title}
      footer={
        <div className="flex gap-2">
          {onDelete ? (
            <Button
              variant={confirming ? "destructive" : "outline"}
              className="h-12"
              onClick={() => (confirming ? onDelete() : setConfirming(true))}
            >
              <Trash2 className="size-5" />
              {confirming ? (deleteLabel ?? t("common.delete")) : null}
            </Button>
          ) : null}
          <Button className="h-12 flex-1 text-base" disabled={!canSave || saving} onClick={onSave}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      }
    >
      {children}
    </EntrySheet>
  );
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button className="h-10" onClick={onClick}>
      {label}
    </Button>
  );
}
