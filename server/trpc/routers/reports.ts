import { z } from "zod";
import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  borrowItems,
  borrows,
  centers,
  departmentInventory,
  departments,
  items,
} from "@/db/schema";
import { router, protectedProcedure } from "@/server/trpc/trpc";
import { memberDepartmentIds } from "@/server/trpc/access";

export const reportsRouter = router({
  /** Every department's stock, for the stock-by-department report. */
  stockByDepartment: protectedProcedure
    .input(z.object({ centerId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          centerCode: centers.code,
          departmentId: departments.id,
          departmentName: departments.name,
          itemId: items.id,
          itemName: items.name,
          itemSku: items.sku,
          unit: items.unit,
          quantity: departmentInventory.quantity,
          requiredQty: departmentInventory.requiredQty,
        })
        .from(departmentInventory)
        .innerJoin(departments, eq(departments.id, departmentInventory.departmentId))
        .innerJoin(centers, eq(centers.id, departments.centerId))
        .innerJoin(items, eq(items.id, departmentInventory.itemId))
        .where(
          and(
            input?.centerId ? eq(departments.centerId, input.centerId) : undefined,
            or(gt(departmentInventory.quantity, "0"), gt(departmentInventory.requiredQty, "0")),
          ),
        )
        .orderBy(asc(centers.code), asc(departments.name), asc(items.name));
    }),

  /** Approved borrows with items still out, oldest due first. */
  outstandingBorrows: protectedProcedure.query(async ({ ctx }) => {
    const mine = await memberDepartmentIds(ctx.db, ctx.user);
    if (mine && !mine.length) return [];
    const fromDept = alias(departments, "from_dept");
    const toDept = alias(departments, "to_dept");
    return ctx.db
      .select({
        id: borrows.id,
        status: borrows.status,
        fromName: fromDept.name,
        toName: toDept.name,
        approvedAt: borrows.approvedAt,
        dueDate: borrows.dueDate,
        overdue: sql<boolean>`coalesce(${borrows.dueDate} < (now() at time zone 'Asia/Kolkata')::date, false)`,
        outstandingQty: sql<string>`sum(${borrowItems.quantity} - ${borrowItems.returnedQty})`,
        lineCount: sql<number>`count(*) filter (where ${borrowItems.quantity} > ${borrowItems.returnedQty})::int`,
      })
      .from(borrows)
      .innerJoin(fromDept, eq(fromDept.id, borrows.fromDepartmentId))
      .innerJoin(toDept, eq(toDept.id, borrows.toDepartmentId))
      .innerJoin(borrowItems, eq(borrowItems.borrowId, borrows.id))
      .where(
        and(
          inArray(borrows.status, ["approved", "partially_returned"]),
          mine ? or(inArray(borrows.fromDepartmentId, mine), inArray(borrows.toDepartmentId, mine)) : undefined,
        ),
      )
      .groupBy(borrows.id, fromDept.name, toDept.name)
      .orderBy(sql`${borrows.dueDate} asc nulls last`, asc(borrows.approvedAt));
  }),
});
