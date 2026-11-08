import { z } from "zod";
import { and, eq, lt, asc, desc, gt, or } from "drizzle-orm";
import {
  centers,
  challans,
  departments,
  departmentInventory,
  inventoryTransactions,
  items,
  user,
} from "@/db/schema";
import { router, protectedProcedure } from "@/server/trpc/trpc";
import { assertDeptManager } from "@/server/trpc/access";
import { addStock, removeStock } from "@/server/stock/movements";
import { createChallan } from "@/server/stock/challan";
import { idempotent } from "@/server/stock/idempotency";

const id = z.number().int().positive();
const positiveQty = z.number().finite().positive();
const clientMutationId = z.string().uuid().optional();
const text = (max: number) => z.string().trim().max(max);

export const inventoryRouter = router({
  listByDepartment: protectedProcedure
    .input(z.object({ departmentId: id }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: departmentInventory.id,
          itemId: items.id,
          itemName: items.name,
          itemSku: items.sku,
          itemUnit: items.unit,
          itemBarcode: items.barcode,
          quantity: departmentInventory.quantity,
          requiredQty: departmentInventory.requiredQty,
          updatedAt: departmentInventory.updatedAt,
        })
        .from(departmentInventory)
        .innerJoin(items, eq(items.id, departmentInventory.itemId))
        .where(eq(departmentInventory.departmentId, input.departmentId))
        .orderBy(asc(items.name));
    }),

  lowStock: protectedProcedure
    .input(z.object({ departmentId: id.optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          departmentId: departments.id,
          departmentName: departments.name,
          centerName: centers.name,
          itemId: items.id,
          itemName: items.name,
          itemSku: items.sku,
          itemUnit: items.unit,
          quantity: departmentInventory.quantity,
          requiredQty: departmentInventory.requiredQty,
        })
        .from(departmentInventory)
        .innerJoin(items, eq(items.id, departmentInventory.itemId))
        .innerJoin(departments, eq(departments.id, departmentInventory.departmentId))
        .innerJoin(centers, eq(centers.id, departments.centerId))
        .where(
          and(
            lt(departmentInventory.quantity, departmentInventory.requiredQty),
            input?.departmentId
              ? eq(departmentInventory.departmentId, input.departmentId)
              : undefined,
          ),
        )
        .orderBy(asc(centers.name), asc(departments.name), asc(items.name));
    }),

  /** Item page: where the item is held, plus this department's movement history. */
  itemDetail: protectedProcedure
    .input(z.object({ itemId: id, departmentId: id.optional() }))
    .query(async ({ ctx, input }) => {
      const [item] = await ctx.db.select().from(items).where(eq(items.id, input.itemId));
      if (!item) return null;

      const holdings = await ctx.db
        .select({
          departmentId: departments.id,
          departmentName: departments.name,
          centerCode: centers.code,
          quantity: departmentInventory.quantity,
          requiredQty: departmentInventory.requiredQty,
        })
        .from(departmentInventory)
        .innerJoin(departments, eq(departments.id, departmentInventory.departmentId))
        .innerJoin(centers, eq(centers.id, departments.centerId))
        .where(
          and(
            eq(departmentInventory.itemId, input.itemId),
            or(
              gt(departmentInventory.quantity, "0"),
              gt(departmentInventory.requiredQty, "0"),
            ),
          ),
        )
        .orderBy(desc(departmentInventory.quantity));

      const history = input.departmentId
        ? await ctx.db
            .select({
              id: inventoryTransactions.id,
              delta: inventoryTransactions.delta,
              kind: inventoryTransactions.kind,
              note: inventoryTransactions.note,
              createdAt: inventoryTransactions.createdAt,
              challanId: inventoryTransactions.challanId,
              challanNumber: challans.number,
              performedByName: user.name,
            })
            .from(inventoryTransactions)
            .leftJoin(challans, eq(challans.id, inventoryTransactions.challanId))
            .leftJoin(user, eq(user.id, inventoryTransactions.performedBy))
            .where(
              and(
                eq(inventoryTransactions.itemId, input.itemId),
                eq(inventoryTransactions.departmentId, input.departmentId),
              ),
            )
            .orderBy(desc(inventoryTransactions.createdAt), desc(inventoryTransactions.id))
            .limit(50)
        : [];

      return { item, holdings, history };
    }),

  /** Receive stock from a vendor/donor. Issues a receipt Rahdari (invoice). */
  bulkIntake: protectedProcedure
    .input(
      z.object({
        departmentId: id,
        partyName: text(160).min(1),
        partyRef: text(80).optional(),
        note: text(500).optional(),
        billAttachmentId: id.optional(),
        clientMutationId,
        lines: z
          .array(
            z.object({
              itemId: id,
              quantity: positiveQty,
              rate: z.number().finite().nonnegative(),
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertDeptManager(ctx.db, ctx.user, input.departmentId);
      return idempotent(ctx.db, input.clientMutationId, () =>
        ctx.db.transaction(async (tx) => {
          const challan = await createChallan(tx, {
            kind: "receipt",
            seriesDepartmentId: input.departmentId,
            toDepartmentId: input.departmentId,
            partyName: input.partyName,
            partyRef: input.partyRef,
            note: input.note,
            billAttachmentId: input.billAttachmentId,
            clientMutationId: input.clientMutationId,
            issuedBy: ctx.user.id,
            lines: input.lines,
          });
          for (const line of input.lines) {
            await addStock(tx, input.departmentId, line.itemId, line.quantity);
          }
          await tx.insert(inventoryTransactions).values(
            input.lines.map((l) => ({
              departmentId: input.departmentId,
              itemId: l.itemId,
              delta: String(l.quantity),
              kind: "intake" as const,
              challanId: challan.id,
              note: input.note,
              performedBy: ctx.user.id,
            })),
          );
          return { id: challan.id, number: challan.number };
        }),
      );
    }),

  /** Consumption: stock leaves the department for good (meals, events, wear). */
  issue: protectedProcedure
    .input(
      z.object({
        departmentId: id,
        recipient: text(160).min(1),
        note: text(500).optional(),
        clientMutationId,
        lines: z
          .array(z.object({ itemId: id, quantity: positiveQty }))
          .min(1)
          .max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertDeptManager(ctx.db, ctx.user, input.departmentId);
      return idempotent(ctx.db, input.clientMutationId, () =>
        ctx.db.transaction(async (tx) => {
          const challan = await createChallan(tx, {
            kind: "issue",
            seriesDepartmentId: input.departmentId,
            fromDepartmentId: input.departmentId,
            partyName: input.recipient,
            note: input.note,
            clientMutationId: input.clientMutationId,
            issuedBy: ctx.user.id,
            lines: input.lines,
          });
          for (const line of input.lines) {
            await removeStock(tx, input.departmentId, line.itemId, line.quantity);
          }
          await tx.insert(inventoryTransactions).values(
            input.lines.map((l) => ({
              departmentId: input.departmentId,
              itemId: l.itemId,
              delta: String(-l.quantity),
              kind: "issue" as const,
              challanId: challan.id,
              note: input.note,
              performedBy: ctx.user.id,
            })),
          );
          return { id: challan.id, number: challan.number };
        }),
      );
    }),

  setRequired: protectedProcedure
    .input(
      z.object({
        departmentId: id,
        itemId: id,
        requiredQty: z.number().finite().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertDeptManager(ctx.db, ctx.user, input.departmentId);
      await ctx.db
        .insert(departmentInventory)
        .values({
          departmentId: input.departmentId,
          itemId: input.itemId,
          quantity: "0",
          requiredQty: String(input.requiredQty),
        })
        .onConflictDoUpdate({
          target: [departmentInventory.departmentId, departmentInventory.itemId],
          set: { requiredQty: String(input.requiredQty) },
        });
      return { ok: true as const };
    }),

  /** Fix a count. The reason is mandatory and printed on the Rahdari. */
  adjust: protectedProcedure
    .input(
      z.object({
        departmentId: id,
        itemId: id,
        delta: z.number().finite().refine((n) => n !== 0, "must not be 0"),
        reason: text(500).min(3),
        clientMutationId,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertDeptManager(ctx.db, ctx.user, input.departmentId);
      return idempotent(ctx.db, input.clientMutationId, () =>
        ctx.db.transaction(async (tx) => {
          const challan = await createChallan(tx, {
            kind: "adjustment",
            seriesDepartmentId: input.departmentId,
            fromDepartmentId: input.departmentId,
            note: input.reason,
            clientMutationId: input.clientMutationId,
            issuedBy: ctx.user.id,
            lines: [{ itemId: input.itemId, quantity: input.delta }],
          });
          if (input.delta < 0) {
            await removeStock(tx, input.departmentId, input.itemId, -input.delta);
          } else {
            await addStock(tx, input.departmentId, input.itemId, input.delta);
          }
          await tx.insert(inventoryTransactions).values({
            departmentId: input.departmentId,
            itemId: input.itemId,
            delta: String(input.delta),
            kind: "adjustment",
            challanId: challan.id,
            note: input.reason,
            performedBy: ctx.user.id,
          });
          return { id: challan.id, number: challan.number };
        }),
      );
    }),
});

