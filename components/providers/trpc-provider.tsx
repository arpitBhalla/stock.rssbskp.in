"use client";

import { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { httpBatchLink } from "@trpc/client";
import { del, get, set } from "idb-keyval";
import superjson from "superjson";
import { trpc } from "@/lib/trpc/client";

const WEEK = 7 * 24 * 60 * 60 * 1000;
export const QUERY_CACHE_KEY = "stock-query-cache";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100";
}

// Query results are persisted to IndexedDB so screens still show the last
// known data with no signal (storerooms). Cleared on sign-out.
const persister = createAsyncStoragePersister({
  key: QUERY_CACHE_KEY,
  storage:
    typeof window === "undefined"
      ? undefined
      : {
          getItem: (k) => get<string>(k).then((v) => v ?? null),
          setItem: (k, v) => set(k, v),
          removeItem: (k) => del(k),
        },
  throttleTime: 2000,
});

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: WEEK,
            refetchOnWindowFocus: true,
            networkMode: "offlineFirst",
            retry: (count, err) => count < 2 && !(err as { data?: unknown }).data,
          },
          // Fail fast offline instead of pausing; offline-capable entries
          // go through the offline queue instead.
          mutations: { networkMode: "always" },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: WEEK,
          buster: "v1",
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.state.status === "success",
          },
        }}
      >
        {children}
      </PersistQueryClientProvider>
    </trpc.Provider>
  );
}
