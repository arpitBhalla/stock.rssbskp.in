import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { hasRole } from "@/lib/permissions";
import type { Role } from "@/db/schema/auth";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: { ...ctx, user: ctx.user, session: ctx.session },
  });
});

export function roleProcedure(min: Role) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!hasRole(ctx.user.role, min)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Requires ${min} role or higher`,
      });
    }
    return next({ ctx });
  });
}

export const managerProcedure = roleProcedure("manager");
export const adminProcedure = roleProcedure("admin");
