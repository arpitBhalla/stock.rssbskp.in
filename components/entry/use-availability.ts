"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";

/** itemId → quantity on hand in a department. */
export function useAvailability(departmentId: number | undefined) {
  const stock = trpc.inventory.listByDepartment.useQuery(
    { departmentId: departmentId ?? 0 },
    { enabled: !!departmentId },
  );
  return useMemo(
    () => new Map((stock.data ?? []).map((r) => [r.itemId, Number(r.quantity)])),
    [stock.data],
  );
}
