import { z } from "zod";
import { and, eq, asc, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { items, userDepartments } from "@/db/schema";
import type { Queryable } from "@/db";
import { router, protectedProcedure } from "@/server/trpc/trpc";
import { hasRole } from "@/lib/permissions";
import { ITEM_QR_PREFIX } from "@/lib/item-code";

const itemInput = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(60),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  barcode: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform((v) => v || null),
  description: z.string().max(1000).nullable().optional(),
});


/** Global managers/admins, or anyone who manages at least one department. */
async function assertCanEditCatalog(db: Queryable, u: { id: string; role?: string | null }) {
  if (hasRole(u.role, "manager")) return;
  const [m] = await db
    .select({ id: userDepartments.departmentId })
    .from(userDepartments)
    .where(and(eq(userDepartments.userId, u.id), eq(userDepartments.role, "manager")))
    .limit(1);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Only managers can edit the catalog" });
}

function uniqueViolation(e: unknown): never {
  const err = e as { code?: string; cause?: { code?: string; constraint?: string } };
  if (err?.code === "23505" || err?.cause?.code === "23505") {
    throw new TRPCError({ code: "CONFLICT", message: "SKU or barcode already used by another item" });
  }
  throw e;
}

export const itemsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(items).orderBy(asc(items.name));
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [it] = await ctx.db.select().from(items).where(eq(items.id, input.id));
      if (!it) throw new TRPCError({ code: "NOT_FOUND" });
      return it;
    }),

  /** Scanner lookup: a printed barcode, an item QR label, or a typed SKU. */
  byCode: protectedProcedure
    .input(z.object({ code: z.string().trim().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const code = input.code.startsWith(ITEM_QR_PREFIX)
        ? input.code.slice(ITEM_QR_PREFIX.length)
        : input.code;
      const [it] = await ctx.db
        .select()
        .from(items)
        .where(or(eq(items.barcode, input.code), eq(items.sku, code)))
        .limit(1);
      return it ?? null;
    }),

  create: protectedProcedure.input(itemInput).mutation(async ({ ctx, input }) => {
    await assertCanEditCatalog(ctx.db, ctx.user);
    try {
      const [created] = await ctx.db
        .insert(items)
        .values({ ...input, description: input.description ?? null })
        .returning();
      return created;
    } catch (e) {
      uniqueViolation(e);
    }
  }),

  update: protectedProcedure
    .input(itemInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanEditCatalog(ctx.db, ctx.user);
      const { id, ...rest } = input;
      try {
        const [updated] = await ctx.db
          .update(items)
          .set({ ...rest, description: rest.description ?? null })
          .where(eq(items.id, id))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      } catch (e) {
        uniqueViolation(e);
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanEditCatalog(ctx.db, ctx.user);
      try {
        await ctx.db.delete(items).where(eq(items.id, input.id));
      } catch (e) {
        const err = e as { code?: string; cause?: { code?: string } };
        if (err?.code === "23503" || err?.cause?.code === "23503") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This item has stock or history and can't be deleted",
          });
        }
        throw e;
      }
      return { ok: true as const };
    }),
});
