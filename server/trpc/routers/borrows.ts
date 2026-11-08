import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  borrowItems,
  borrows,
  challans,
  departments,
  inventoryTransactions,
  items as itemsTable,
  user,
  type Borrow,
} from "@/db/schema";
import type { Queryable, Tx } from "@/db";
import { router, protectedProcedure } from "@/server/trpc/trpc";
import {
  assertCanSeeDepartments,
  assertDeptManager,
  assertManagerOfAny,
  deptRole,
  memberDepartmentIds,
} from "@/server/trpc/access";
import { addStock, removeStock } from "@/server/stock/movements";
import { createChallan } from "@/server/stock/challan";
import { idempotent } from "@/server/stock/idempotency";
import {
  notifyBorrowDecision,
  notifyBorrowRequested,
  notifyReturned,
} from "@/server/notify";

const id = z.number().int().positive();
const qty = z.number().finite().positive();

const STATUSES = [
  "pending",
  "approved",
  "partially_returned",
  "returned",
  "rejected",
  "cancelled",
] as const;
const OPEN = ["approved", "partially_returned"] as const;

/** Locks the borrow row for the rest of the transaction. */
async function lockBorrow(tx: Tx, borrowId: number) {
  const [b] = await tx.select().from(borrows).where(eq(borrows.id, borrowId)).for("update");
  if (!b) throw new TRPCError({ code: "NOT_FOUND" });
  return b;
}

function assertStatus(b: Borrow, allowed: readonly Borrow["status"][], action: string) {
  if (!allowed.includes(b.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot ${action} a borrow that is ${b.status.replace("_", " ")}`,
    });
  }
}

async function getBorrow(db: Queryable, borrowId: number) {
  const [b] = await db.select().from(borrows).where(eq(borrows.id, borrowId));
  if (!b) throw new TRPCError({ code: "NOT_FOUND" });
  return b;
}

export const borrowsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          departmentId: id.optional(),
          // incoming: others borrowing from this dept; outgoing: this dept borrowing
          direction: z.enum(["incoming", "outgoing", "any"]).default("any"),
          status: z.enum([...STATUSES, "open"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const fromDept = alias(departments, "from_dept");
      const toDept = alias(departments, "to_dept");
      const dept = input?.departmentId;
      const direction = input?.direction ?? "any";
      const status = input?.status;
      // Non-admins only see borrows involving their own departments.
      const mine = await memberDepartmentIds(ctx.db, ctx.user);
      if (dept !== undefined) await assertCanSeeDepartments(ctx.db, ctx.user, [dept]);
      if (mine && !mine.length) return [];

      const lineStats = ctx.db
        .select({
          borrowId: borrowItems.borrowId,
          lineCount: sql<number>`count(*)::int`.as("line_count"),
          totalQty: sql<string>`sum(${borrowItems.quantity})`.as("total_qty"),
          returnedQty: sql<string>`sum(${borrowItems.returnedQty})`.as("returned_qty"),
        })
        .from(borrowItems)
        .groupBy(borrowItems.borrowId)
        .as("line_stats");

      return ctx.db
        .select({
          id: borrows.id,
          status: borrows.status,
          fromDepartmentId: borrows.fromDepartmentId,
          toDepartmentId: borrows.toDepartmentId,
          fromName: fromDept.name,
          toName: toDept.name,
          requestedBy: borrows.requestedBy,
          requesterName: user.name,
          requestedAt: borrows.requestedAt,
          approvedAt: borrows.approvedAt,
          closedAt: borrows.closedAt,
          dueDate: borrows.dueDate,
          note: borrows.note,
          lineCount: lineStats.lineCount,
          totalQty: lineStats.totalQty,
          returnedQty: lineStats.returnedQty,
        })
        .from(borrows)
        .innerJoin(fromDept, eq(fromDept.id, borrows.fromDepartmentId))
        .innerJoin(toDept, eq(toDept.id, borrows.toDepartmentId))
        .innerJoin(user, eq(user.id, borrows.requestedBy))
        .leftJoin(lineStats, eq(lineStats.borrowId, borrows.id))
        .where(
          and(
            status === "open"
              ? inArray(borrows.status, [...OPEN])
              : status
                ? eq(borrows.status, status)
                : undefined,
            dept === undefined
              ? mine
                ? or(inArray(borrows.fromDepartmentId, mine), inArray(borrows.toDepartmentId, mine))
                : undefined
              : direction === "incoming"
                ? eq(borrows.fromDepartmentId, dept)
                : direction === "outgoing"
                  ? eq(borrows.toDepartmentId, dept)
                  : or(eq(borrows.fromDepartmentId, dept), eq(borrows.toDepartmentId, dept)),
          ),
        )
        .orderBy(desc(borrows.requestedAt))
        .limit(200);
    }),

  byId: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const fromDept = alias(departments, "from_dept");
    const toDept = alias(departments, "to_dept");
    const [header] = await ctx.db
      .select({
        borrow: borrows,
        fromName: fromDept.name,
        toName: toDept.name,
        requesterName: user.name,
      })
      .from(borrows)
      .innerJoin(fromDept, eq(fromDept.id, borrows.fromDepartmentId))
      .innerJoin(toDept, eq(toDept.id, borrows.toDepartmentId))
      .innerJoin(user, eq(user.id, borrows.requestedBy))
      .where(eq(borrows.id, input.id));
    if (!header) throw new TRPCError({ code: "NOT_FOUND" });
    const b = header.borrow;
    await assertCanSeeDepartments(ctx.db, ctx.user, [b.fromDepartmentId, b.toDepartmentId]);

    const [lines, docs, fromRole, toRole] = await Promise.all([
      ctx.db
        .select({
          id: borrowItems.id,
          itemId: borrowItems.itemId,
          itemName: itemsTable.name,
          itemSku: itemsTable.sku,
          itemUnit: itemsTable.unit,
          quantity: borrowItems.quantity,
          returnedQty: borrowItems.returnedQty,
        })
        .from(borrowItems)
        .innerJoin(itemsTable, eq(itemsTable.id, borrowItems.itemId))
        .where(eq(borrowItems.borrowId, b.id))
        .orderBy(asc(itemsTable.name)),
      ctx.db
        .select({
          id: challans.id,
          number: challans.number,
          kind: challans.kind,
          status: challans.status,
          issuedAt: challans.issuedAt,
        })
        .from(challans)
        .where(eq(challans.borrowId, b.id))
        .orderBy(asc(challans.issuedAt)),
      deptRole(ctx.db, ctx.user, b.fromDepartmentId),
      deptRole(ctx.db, ctx.user, b.toDepartmentId),
    ]);

    const isOpen = (OPEN as readonly string[]).includes(b.status);
    return {
      ...b,
      fromName: header.fromName,
      toName: header.toName,
      requesterName: header.requesterName,
      lines,
      challans: docs,
      can: {
        approve: b.status === "pending" && fromRole === "manager",
        cancel:
          b.status === "pending" && (toRole === "manager" || b.requestedBy === ctx.user.id),
        recordReturn: isOpen && (fromRole === "manager" || toRole === "manager"),
      },
    };
  }),

  /** A manager of the borrowing department (`to`) asks the lender (`from`). */
  request: protectedProcedure
    .input(
      z.object({
        fromDepartmentId: id,
        toDepartmentId: id,
        dueDate: z.iso.date().optional(),
        note: z.string().trim().max(500).optional(),
        lines: z.array(z.object({ itemId: id, quantity: qty })).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fromDepartmentId === input.toDepartmentId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pick a different department to borrow from",
        });
      }
      await assertDeptManager(ctx.db, ctx.user, input.toDepartmentId);
      const found = await ctx.db
        .select({ id: departments.id })
        .from(departments)
        .where(inArray(departments.id, [input.fromDepartmentId, input.toDepartmentId]));
      if (found.length !== 2) throw new TRPCError({ code: "NOT_FOUND", message: "Department not found" });
      const created = await ctx.db.transaction(async (tx) => {
        const [b] = await tx
          .insert(borrows)
          .values({
            fromDepartmentId: input.fromDepartmentId,
            toDepartmentId: input.toDepartmentId,
            dueDate: input.dueDate ?? null,
            note: input.note || null,
            requestedBy: ctx.user.id,
            status: "pending",
          })
          .returning();
        await tx.insert(borrowItems).values(
          input.lines.map((l) => ({
            borrowId: b.id,
            itemId: l.itemId,
            quantity: String(l.quantity),
          })),
        );
        return b;
      });
      ctx.defer(() =>
        notifyBorrowRequested({ ...created, lineCount: input.lines.length }),
      );
      return created;
    }),

  /** Lender approves: stock moves and a transfer Rahdari is issued. */
  approve: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const pre = await getBorrow(ctx.db, input.id);
    await assertDeptManager(ctx.db, ctx.user, pre.fromDepartmentId);

    const result = await ctx.db.transaction(async (tx) => {
      const b = await lockBorrow(tx, input.id);
      assertStatus(b, ["pending"], "approve");
      const lines = await tx.select().from(borrowItems).where(eq(borrowItems.borrowId, b.id));

      const challan = await createChallan(tx, {
        kind: "transfer",
        seriesDepartmentId: b.fromDepartmentId,
        fromDepartmentId: b.fromDepartmentId,
        toDepartmentId: b.toDepartmentId,
        borrowId: b.id,
        note: b.note,
        issuedBy: ctx.user.id,
        lines: lines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) })),
      });

      for (const line of lines) {
        const n = Number(line.quantity);
        await removeStock(tx, b.fromDepartmentId, line.itemId, n);
        await addStock(tx, b.toDepartmentId, line.itemId, n);
        await tx.insert(inventoryTransactions).values([
          {
            departmentId: b.fromDepartmentId,
            itemId: line.itemId,
            delta: String(-n),
            kind: "borrow_out",
            borrowId: b.id,
            challanId: challan.id,
            performedBy: ctx.user.id,
          },
          {
            departmentId: b.toDepartmentId,
            itemId: line.itemId,
            delta: String(n),
            kind: "borrow_in",
            borrowId: b.id,
            challanId: challan.id,
            performedBy: ctx.user.id,
          },
        ]);
      }

      await tx
        .update(borrows)
        .set({ status: "approved", approvedBy: ctx.user.id, approvedAt: new Date() })
        .where(eq(borrows.id, b.id));
      return { borrow: b, challan: { id: challan.id, number: challan.number } };
    });

    ctx.defer(() => notifyBorrowDecision(result.borrow, "approved", result.challan.number));
    return result.challan;
  }),

  reject: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const pre = await getBorrow(ctx.db, input.id);
    await assertDeptManager(ctx.db, ctx.user, pre.fromDepartmentId);
    const updated = await ctx.db.transaction(async (tx) => {
      const b = await lockBorrow(tx, input.id);
      assertStatus(b, ["pending"], "reject");
      const [u] = await tx
        .update(borrows)
        .set({ status: "rejected", closedAt: new Date() })
        .where(eq(borrows.id, b.id))
        .returning();
      return u;
    });
    ctx.defer(() => notifyBorrowDecision(updated, "rejected"));
    return updated;
  }),

  cancel: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const pre = await getBorrow(ctx.db, input.id);
    if (pre.requestedBy !== ctx.user.id) {
      await assertDeptManager(ctx.db, ctx.user, pre.toDepartmentId);
    }
    return ctx.db.transaction(async (tx) => {
      const b = await lockBorrow(tx, input.id);
      assertStatus(b, ["pending"], "cancel");
      const [u] = await tx
        .update(borrows)
        .set({ status: "cancelled", closedAt: new Date() })
        .where(eq(borrows.id, b.id))
        .returning();
      return u;
    });
  }),

  /** Items come back (possibly partially). Each call issues its own return Rahdari. */
  recordReturn: protectedProcedure
    .input(
      z.object({
        id,
        clientMutationId: z.string().uuid().optional(),
        lines: z.array(z.object({ borrowItemId: id, quantity: qty })).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const pre = await getBorrow(ctx.db, input.id);
      await assertManagerOfAny(ctx.db, ctx.user, [pre.fromDepartmentId, pre.toDepartmentId]);

      const challan = await idempotent(ctx.db, input.clientMutationId, () =>
        ctx.db.transaction(async (tx) => {
          const b = await lockBorrow(tx, input.id);
          assertStatus(b, OPEN, "return");
          const lines = await tx.select().from(borrowItems).where(eq(borrowItems.borrowId, b.id));
          const byId = new Map(lines.map((l) => [l.id, l]));

          // Merge repeated lines first, so duplicates can't each pass the check.
          const wanted = new Map<number, number>();
          for (const r of input.lines) {
            wanted.set(r.borrowItemId, (wanted.get(r.borrowItemId) ?? 0) + r.quantity);
          }
          // Compare in thousandths (numeric(14,3)) to avoid float drift like 0.3 - 0.2.
          const milli = (n: number | string) => Math.round(Number(n) * 1000);
          const returning = [...wanted].map(([borrowItemId, quantity]) => {
            const line = byId.get(borrowItemId);
            if (!line) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid line" });
            const remaining = milli(line.quantity) - milli(line.returnedQty);
            if (milli(quantity) > remaining) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Return exceeds remaining (${remaining / 1000})`,
              });
            }
            return { line, quantity: milli(quantity) / 1000 };
          });

          // The borrower sends the goods back, so the Rahdari is in its series.
          const doc = await createChallan(tx, {
            kind: "return",
            seriesDepartmentId: b.toDepartmentId,
            fromDepartmentId: b.toDepartmentId,
            toDepartmentId: b.fromDepartmentId,
            borrowId: b.id,
            clientMutationId: input.clientMutationId,
            issuedBy: ctx.user.id,
            lines: returning.map((r) => ({ itemId: r.line.itemId, quantity: r.quantity })),
          });

          for (const { line, quantity } of returning) {
            await removeStock(tx, b.toDepartmentId, line.itemId, quantity);
            await addStock(tx, b.fromDepartmentId, line.itemId, quantity);
            await tx
              .update(borrowItems)
              .set({ returnedQty: sql`${borrowItems.returnedQty} + ${String(quantity)}` })
              .where(eq(borrowItems.id, line.id));
            await tx.insert(inventoryTransactions).values([
              {
                departmentId: b.toDepartmentId,
                itemId: line.itemId,
                delta: String(-quantity),
                kind: "return_out",
                borrowId: b.id,
                challanId: doc.id,
                performedBy: ctx.user.id,
              },
              {
                departmentId: b.fromDepartmentId,
                itemId: line.itemId,
                delta: String(quantity),
                kind: "return_in",
                borrowId: b.id,
                challanId: doc.id,
                performedBy: ctx.user.id,
              },
            ]);
          }

          const after = await tx.select().from(borrowItems).where(eq(borrowItems.borrowId, b.id));
          const fullyReturned = after.every((l) => Number(l.returnedQty) >= Number(l.quantity));
          await tx
            .update(borrows)
            .set({
              status: fullyReturned ? "returned" : "partially_returned",
              closedAt: fullyReturned ? new Date() : null,
            })
            .where(eq(borrows.id, b.id));
          return { id: doc.id, number: doc.number };
        }),
      );

      ctx.defer(() => notifyReturned(pre, challan));
      return challan;
    }),
});
