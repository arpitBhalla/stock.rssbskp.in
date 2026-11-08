import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { departmentInventory, items } from "@/db/schema";
import type { Tx } from "@/db";

export async function addStock(
  tx: Tx,
  departmentId: number,
  itemId: number,
  qty: number,
) {
  await tx
    .insert(departmentInventory)
    .values({ departmentId, itemId, quantity: String(qty) })
    .onConflictDoUpdate({
      target: [departmentInventory.departmentId, departmentInventory.itemId],
      set: {
        quantity: sql`${departmentInventory.quantity} + ${String(qty)}`,
      },
    });
}

/**
 * Atomic check-and-decrement, so two concurrent movements can never take the
 * same stock twice. Throws BAD_REQUEST with the available quantity otherwise.
 */
export async function removeStock(
  tx: Tx,
  departmentId: number,
  itemId: number,
  qty: number,
) {
  const updated = await tx
    .update(departmentInventory)
    .set({ quantity: sql`${departmentInventory.quantity} - ${String(qty)}` })
    .where(
      and(
        eq(departmentInventory.departmentId, departmentId),
        eq(departmentInventory.itemId, itemId),
        gte(departmentInventory.quantity, String(qty)),
      ),
    )
    .returning({ id: departmentInventory.id });
  if (updated.length) return;

  const [row] = await tx
    .select({ have: departmentInventory.quantity, name: items.name })
    .from(items)
    .leftJoin(
      departmentInventory,
      and(
        eq(departmentInventory.itemId, items.id),
        eq(departmentInventory.departmentId, departmentId),
      ),
    )
    .where(eq(items.id, itemId));
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Not enough ${row?.name ?? "stock"}: only ${Number(row?.have ?? 0)} available, need ${qty}`,
  });
}
