import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  challanKind,
  challanLines,
  challans,
  departments,
  inventoryTransactions,
} from "@/db/schema";
import {
  router,
  protectedProcedure,
  publicProcedure,
  adminProcedure,
} from "@/server/trpc/trpc";
import { assertCanSeeDepartments, deptRole, isAdmin, memberDepartmentIds } from "@/server/trpc/access";
import { ACKNOWLEDGEABLE, loadChallanDetail } from "@/server/stock/challan-detail";
import { addStock, removeStock } from "@/server/stock/movements";
import { notifyAcknowledged } from "@/server/notify";
import { rateLimit } from "@/lib/rate-limit";

const id = z.number().int().positive();
const token = z.string().min(16).max(64);
const VOIDABLE = ["receipt", "adjustment", "issue"] as const;

export const challansRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        departmentId: id.optional(),
        kind: z.enum(challanKind.enumValues).optional(),
        cursor: id.optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.departmentId) await assertCanSeeDepartments(ctx.db, ctx.user, [input.departmentId]);
      const deptIds = input.departmentId ? [input.departmentId] : await memberDepartmentIds(ctx.db, ctx.user);
      if (deptIds && !deptIds.length) return { rows: [], nextCursor: null };

      const fromDept = alias(departments, "from_dept");
      const toDept = alias(departments, "to_dept");
      const lineCount = ctx.db
        .select({
          challanId: challanLines.challanId,
          n: sql<number>`count(*)::int`.as("n"),
        })
        .from(challanLines)
        .groupBy(challanLines.challanId)
        .as("line_count");

      const rows = await ctx.db
        .select({
          id: challans.id,
          number: challans.number,
          kind: challans.kind,
          status: challans.status,
          issuedAt: challans.issuedAt,
          fromName: fromDept.name,
          toName: toDept.name,
          partyName: challans.partyName,
          totalAmount: challans.totalAmount,
          lineCount: lineCount.n,
        })
        .from(challans)
        .leftJoin(fromDept, eq(fromDept.id, challans.fromDepartmentId))
        .leftJoin(toDept, eq(toDept.id, challans.toDepartmentId))
        .leftJoin(lineCount, eq(lineCount.challanId, challans.id))
        .where(
          and(
            deptIds
              ? or(
                  inArray(challans.fromDepartmentId, deptIds),
                  inArray(challans.toDepartmentId, deptIds),
                )
              : undefined,
            input.kind ? eq(challans.kind, input.kind) : undefined,
            input.cursor ? lt(challans.id, input.cursor) : undefined,
          ),
        )
        .orderBy(desc(challans.id))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      return { rows: page, nextCursor: hasMore ? page[page.length - 1].id : null };
    }),

  byId: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const detail = await loadChallanDetail(ctx.db, eq(challans.id, input.id));
    if (!detail) throw new TRPCError({ code: "NOT_FOUND" });
    await assertCanSeeDepartments(ctx.db, ctx.user, [detail.fromDepartmentId, detail.toDepartmentId]);
    const receiverRole =
      detail.toDepartmentId && (detail.kind === "transfer" || detail.kind === "return")
        ? await deptRole(ctx.db, ctx.user, detail.toDepartmentId)
        : null;
    return {
      ...detail,
      can: {
        acknowledge: detail.status === "issued" && receiverRole !== null,
        void:
          isAdmin(ctx.user) &&
          detail.status !== "void" &&
          (VOIDABLE as readonly string[]).includes(detail.kind),
      },
    };
  }),

  /** In-app "Received" by a member of the receiving department. */
  acknowledge: protectedProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const [c] = await ctx.db.select().from(challans).where(eq(challans.id, input.id));
    if (!c) throw new TRPCError({ code: "NOT_FOUND" });
    if (!c.toDepartmentId || (c.kind !== "transfer" && c.kind !== "return")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This Rahdari can't be acknowledged in the app" });
    }
    if (!(await deptRole(ctx.db, ctx.user, c.toDepartmentId))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the receiving department can confirm" });
    }
    const [updated] = await ctx.db
      .update(challans)
      .set({
        status: "acknowledged",
        acknowledgedBy: ctx.user.id,
        acknowledgedByName: ctx.user.name,
        acknowledgedAt: new Date(),
      })
      .where(and(eq(challans.id, c.id), eq(challans.status, "issued")))
      .returning();
    if (!updated) throw new TRPCError({ code: "BAD_REQUEST", message: "Already acknowledged or void" });
    if (updated.issuedBy !== ctx.user.id) ctx.defer(() => notifyAcknowledged(updated));
    return { ok: true as const };
  }),

  /** Admin-only. Reverses the stock movement and keeps the number (no gaps). */
  void: adminProcedure
    .input(z.object({ id, reason: z.string().trim().min(3).max(500) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [c] = await tx.select().from(challans).where(eq(challans.id, input.id)).for("update");
        if (!c) throw new TRPCError({ code: "NOT_FOUND" });
        if (c.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Already void" });
        if (!(VOIDABLE as readonly string[]).includes(c.kind)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transfers and returns follow the borrow; record a return or adjustment instead",
          });
        }
        const lines = await tx.select().from(challanLines).where(eq(challanLines.challanId, c.id));
        const note = `Void ${c.number}: ${input.reason}`;

        for (const line of lines) {
          const q = Number(line.quantity);
          // Undo the original effect: a receipt added to `to`, an issue removed
          // from `from`, an adjustment applied a signed delta to `from`.
          const deptId = c.kind === "receipt" ? c.toDepartmentId! : c.fromDepartmentId!;
          const delta = c.kind === "issue" ? q : -q;
          if (delta < 0) await removeStock(tx, deptId, line.itemId, -delta);
          else await addStock(tx, deptId, line.itemId, delta);
          await tx.insert(inventoryTransactions).values({
            departmentId: deptId,
            itemId: line.itemId,
            delta: String(delta),
            kind: "adjustment",
            challanId: c.id,
            note,
            performedBy: ctx.user.id,
          });
        }

        await tx
          .update(challans)
          .set({
            status: "void",
            voidedBy: ctx.user.id,
            voidedAt: new Date(),
            voidReason: input.reason,
          })
          .where(eq(challans.id, c.id));
        return { ok: true as const };
      });
    }),

  /** Public verify page behind the QR code. No login. */
  publicByToken: publicProcedure.input(z.object({ token })).query(async ({ ctx, input }) => {
    const d = await loadChallanDetail(ctx.db, eq(challans.publicToken, input.token));
    if (!d) throw new TRPCError({ code: "NOT_FOUND" });
    // Strip internal ids and the receiver's phone from the public view.
    const { issuedBy, billAttachmentId, acknowledgedByPhone, ...visible } = d;
    return visible;
  }),

  /** Anyone at the gate can confirm receipt with their name. Works once. */
  acknowledgeByToken: publicProcedure
    .input(
      z.object({
        token,
        name: z.string().trim().min(2).max(80),
        phone: z
          .string()
          .trim()
          .regex(/^\+?[0-9 -]{6,20}$/, "Enter a valid phone number")
          .optional()
          .or(z.literal("")),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!rateLimit(`ack:${ctx.ip}`, 10, 10 * 60_000)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts, try again later" });
      }
      const [updated] = await ctx.db
        .update(challans)
        .set({
          status: "acknowledged",
          acknowledgedByName: input.name,
          acknowledgedByPhone: input.phone || null,
          acknowledgedAt: new Date(),
        })
        .where(
          and(
            eq(challans.publicToken, input.token),
            eq(challans.status, "issued"),
            inArray(challans.kind, [...ACKNOWLEDGEABLE]),
          ),
        )
        .returning();
      if (!updated) {
        const [exists] = await ctx.db
          .select({ id: challans.id })
          .from(challans)
          .where(eq(challans.publicToken, input.token));
        throw new TRPCError(
          exists
            ? { code: "BAD_REQUEST", message: "Already acknowledged or not acknowledgeable" }
            : { code: "NOT_FOUND" },
        );
      }
      ctx.defer(() => notifyAcknowledged(updated));
      return { ok: true as const };
    }),
});
