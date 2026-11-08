import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { centers, departments, userDepartments } from "@/db/schema";
import {
  router,
  protectedProcedure,
  adminProcedure,
} from "@/server/trpc/trpc";
import { TRPCError } from "@trpc/server";
import { isAdmin } from "@/server/trpc/access";

const upsertInput = z.object({
  centerId: z.number().int().positive(),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
});

export const departmentsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({ centerId: z.number().int().positive().optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: departments.id,
          name: departments.name,
          code: departments.code,
          centerId: departments.centerId,
          centerName: centers.name,
          centerCode: centers.code,
          createdAt: departments.createdAt,
        })
        .from(departments)
        .innerJoin(centers, eq(centers.id, departments.centerId))
        .where(
          input?.centerId
            ? eq(departments.centerId, input.centerId)
            : undefined,
        )
        .orderBy(asc(centers.name), asc(departments.name));
      return rows;
    }),

  /** Departments the user works in (all for admins), with their role. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const cols = {
      id: departments.id,
      name: departments.name,
      code: departments.code,
      centerId: departments.centerId,
      centerName: centers.name,
      centerCode: centers.code,
    };
    if (isAdmin(ctx.user)) {
      const rows = await ctx.db
        .select(cols)
        .from(departments)
        .innerJoin(centers, eq(centers.id, departments.centerId))
        .orderBy(asc(centers.name), asc(departments.name));
      return rows.map((r) => ({ ...r, role: "manager" as const }));
    }
    return ctx.db
      .select({ ...cols, role: userDepartments.role })
      .from(userDepartments)
      .innerJoin(departments, eq(departments.id, userDepartments.departmentId))
      .innerJoin(centers, eq(centers.id, departments.centerId))
      .where(eq(userDepartments.userId, ctx.user.id))
      .orderBy(asc(centers.name), asc(departments.name));
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [d] = await ctx.db
        .select()
        .from(departments)
        .where(eq(departments.id, input.id));
      if (!d) throw new TRPCError({ code: "NOT_FOUND" });
      return d;
    }),

  create: adminProcedure
    .input(upsertInput)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(departments)
        .values(input)
        .returning();
      return created;
    }),

  update: adminProcedure
    .input(upsertInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [updated] = await ctx.db
        .update(departments)
        .set(rest)
        .where(eq(departments.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(departments).where(eq(departments.id, input.id));
      return { ok: true as const };
    }),
});
