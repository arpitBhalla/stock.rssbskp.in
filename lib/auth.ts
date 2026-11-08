import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username, admin } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  // Accounts are created by admins (users.create) via auth.api, which this
  // doesn't affect; it only closes the public HTTP sign-up route.
  disabledPaths: ["/sign-up/email"],
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    username(),
    admin({
      defaultRole: "viewer",
      adminRoles: ["admin"],
    }),
  ],
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "viewer", input: false },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
