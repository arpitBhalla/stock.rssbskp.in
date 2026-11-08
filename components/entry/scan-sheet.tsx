"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/components/providers/i18n-provider";
import { EntrySheet } from "@/components/entry/entry-sheet";
import { Scanner } from "@/components/entry/scanner";
import { errorText } from "@/components/entry/use-after-entry";

/** Scan a barcode / item QR and jump to that item's stock page. */
export function ScanSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [attempt, setAttempt] = useState(0);

  async function onCode(code: string) {
    try {
      const item = await utils.items.byCode.fetch({ code });
      if (!item) {
        toast.error(t("scan.notFound", { code }));
        setAttempt((a) => a + 1); // remount the scanner for another try
        return;
      }
      onOpenChange(false);
      router.push(`/stock/${item.id}`);
    } catch (e) {
      toast.error(errorText(e));
      setAttempt((a) => a + 1);
    }
  }

  return (
    <EntrySheet open={open} onOpenChange={onOpenChange} title={t("scan.title")} tall={false}>
      {open ? <Scanner key={attempt} onCode={onCode} /> : null}
    </EntrySheet>
  );
}
