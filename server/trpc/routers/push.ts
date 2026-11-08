import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema";
import { router, protectedProcedure, publicProcedure } from "@/server/trpc/trpc";
import { vapidPublicKey } from "@/lib/push";

export const pushRouter = router({
  publicKey: publicProcedure.query(() => vapidPublicKey),

  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.url().max(2000),
        keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
        locale: z.enum(["en", "hi"]).default("en"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(pushSubscriptions)
        .values({
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          locale: input.locale,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            userId: ctx.user.id,
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            locale: input.locale,
          },
        });
      return { ok: true as const };
    }),

  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, input.endpoint),
            eq(pushSubscriptions.userId, ctx.user.id),
          ),
        );
      return { ok: true as const };
    }),
});
