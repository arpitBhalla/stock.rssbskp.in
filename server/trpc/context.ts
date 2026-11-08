import { headers } from "next/headers";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";

// Work to run after the response is sent (push notifications). Tests swap in
// their own implementation because `after` needs a request scope.
export type Defer = (task: () => Promise<unknown>) => void;

export async function createContext(opts?: { headers?: Headers; defer?: Defer }) {
  const h = opts?.headers ?? (await headers());
  const session = await auth.api.getSession({ headers: h });
  return {
    db,
    session: session?.session ?? null,
    user: session?.user ?? null,
    ip:
      // Last entry is the one added by our own reverse proxy; earlier ones are client-supplied.
      h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
      h.get("x-real-ip") ||
      "unknown",
    defer: opts?.defer ?? ((task: () => Promise<unknown>) => after(task)),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
