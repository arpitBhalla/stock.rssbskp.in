import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { user, userDepartments, deptRole } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  router,
  protectedProcedure,
  adminProcedure,
} from "@/server/trpc/trpc";

const ROLE = z.enum(["admin", "manager", "viewer"]);
const memberships = z
  .array(
    z.object({
      departmentId: z.number().int().positive(),
      role: z.enum(deptRole.enumValues),
    }),
  )
  .max(200);

export const usersRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.user;
  }),

  list: adminProcedure.query(async ({ ctx }) => {
    const [users, links] = await Promise.all([
      ctx.db
        .select({
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          banned: user.banned,
          createdAt: user.createdAt,
        })
        .from(user)
        .orderBy(asc(user.name)),
      ctx.db
        .select({
          userId: userDepartments.userId,
          departmentId: userDepartments.departmentId,
          role: userDepartments.role,
        })
        .from(userDepartments),
    ]);
    return users.map((u) => ({
      ...u,
      memberships: links
        .filter((l) => l.userId === u.id)
        .map(({ departmentId, role }) => ({ departmentId, role })),
    }));
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        username: z
          .string()
          .trim()
          .min(3)
          .max(40)
          .regex(/^[a-z0-9_.-]+$/i, "letters/digits/_-. only"),
        password: z.string().min(8).max(200),
        role: ROLE,
        memberships: memberships.default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let userId: string;
      try {
        const result = await auth.api.signUpEmail({
          body: {
            name: input.name,
            username: input.username,
            email: `${input.username.toLowerCase()}@stock.local`,
            password: input.password,
          },
        });
        userId = result.user.id;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to create user";
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
      await ctx.db.update(user).set({ role: input.role }).where(eq(user.id, userId));
      if (input.memberships.length) {
        await ctx.db
          .insert(userDepartments)
          .values(input.memberships.map((m) => ({ ...m, userId })));
      }
      return { id: userId };
    }),

  setRole: adminProcedure
    .input(z.object({ userId: z.string(), role: ROLE }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
      }
      await ctx.db.update(user).set({ role: input.role }).where(eq(user.id, input.userId));
      return { ok: true as const };
    }),

  /** Replaces the user's department memberships. */
  setMemberships: adminProcedure
    .input(z.object({ userId: z.string(), memberships }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx.delete(userDepartments).where(eq(userDepartments.userId, input.userId));
        if (input.memberships.length) {
          await tx
            .insert(userDepartments)
            .values(input.memberships.map((m) => ({ ...m, userId: input.userId })));
        }
      });
      return { ok: true as const };
    }),

  delete: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete yourself" });
      }
      try {
        await ctx.db.delete(user).where(eq(user.id, input.userId));
      } catch (e) {
        const err = e as { code?: string; cause?: { code?: string } };
        if (err?.code === "23503" || err?.cause?.code === "23503") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This user has issued Rahdari or requests; change their role instead",
          });
        }
        throw e;
      }
      return { ok: true as const };
    }),
});
