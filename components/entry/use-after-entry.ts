"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/components/providers/i18n-provider";

/** Common follow-up after an entry: refresh data, then open the new Rahdari. */
export function useAfterEntry() {
  const t = useT();
  const router = useRouter();
  const utils = trpc.useUtils();
  return (result: { queued: true } | { queued: false; challan: { id: number; number: string } }) => {
    if (result.queued) {
      toast.info(t("toast.queued"));
      return;
    }
    void utils.invalidate();
    toast.success(t("toast.issued", { number: result.challan.number }));
    router.push(`/rahdari/${result.challan.id}`);
  };
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
