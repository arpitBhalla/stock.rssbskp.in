import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/routers/_app";
import { createContext } from "@/server/trpc/context";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ headers: req.headers }),
    onError({ error, path }) {
      if (process.env.NODE_ENV === "development") {
        console.error(`[tRPC] ${path ?? "<no-path>"} →`, error.message);
      }
    },
  });

export { handler as GET, handler as POST };
