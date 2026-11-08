import { z } from "zod";
import { eq } from "drizzle-orm";
import { centers } from "@/db/schema";
import {
  router,
  protectedProcedure,
  adminProcedure,
} from "@/server/trpc/trpc";
import { TRPCError } from "@trpc/server";

const upsertInput = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
  address: z.string().max(500).nullable().optional(),
});

export const centersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(centers).orderBy(centers.name);
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [c] = await ctx.db
        .select()
        .from(centers)
        .where(eq(centers.id, input.id));
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      return c;
    }),

  create: adminProcedure
    .input(upsertInput)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(centers)
        .values({
          name: input.name,
          code: input.code,
          address: input.address ?? null,
        })
        .returning();
      return created;
    }),

  update: adminProcedure
    .input(upsertInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(centers)
        .set({
          name: input.name,
          code: input.code,
          address: input.address ?? null,
        })
        .where(eq(centers.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(centers).where(eq(centers.id, input.id));
      return { ok: true as const };
    }),
});
