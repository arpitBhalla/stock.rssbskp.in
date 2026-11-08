"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import {
  enqueue,
  listQueue,
  markQueuedError,
  removeQueued,
  subscribeQueue,
  type QueuedEntry,
  type QueuedMutation,
} from "@/lib/offline/queue";
import { useT } from "@/components/providers/i18n-provider";
import { useMe } from "@/components/providers/me-provider";

type OfflineValue = {
  online: boolean;
  queue: QueuedMutation[];
  syncing: boolean;
  syncNow: () => Promise<void>;
  discard: (id: string) => Promise<void>;
};

const OfflineContext = createContext<OfflineValue | null>(null);

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** A network failure (no response) as opposed to the server saying no. */
export function isNetworkError(e: unknown) {
  if (e instanceof TRPCClientError) return !e.data && !e.shape;
  return e instanceof TypeError;
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const me = useMe();
  const utils = trpc.useUtils();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [queue, setQueue] = useState<QueuedMutation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    const load = () => void listQueue().then((all) => setQueue(all.filter((m) => m.userId === me.id)));
    load();
    return subscribeQueue(load);
  }, [me.id]);

  const syncNow = useCallback(async () => {
    if (running.current || !navigator.onLine) return;
    running.current = true;
    setSyncing(true);
    let synced = 0;
    const failed: string[] = [];
    try {
      for (const m of await listQueue()) {
        if (m.error || m.userId !== me.id) continue;
        try {
          const c = utils.client;
          if (m.path === "inventory.bulkIntake") await c.inventory.bulkIntake.mutate(m.input);
          else if (m.path === "inventory.issue") await c.inventory.issue.mutate(m.input);
          else if (m.path === "inventory.adjust") await c.inventory.adjust.mutate(m.input);
          else await c.borrows.recordReturn.mutate(m.input);
          await removeQueued(m.id);
          synced += 1;
        } catch (e) {
          if (isNetworkError(e)) break; // still offline; try again later
          const message = e instanceof Error ? e.message : String(e);
          await markQueuedError(m, message);
          failed.push(message);
        }
      }
    } finally {
      running.current = false;
      setSyncing(false);
    }
    if (synced) {
      toast.success(t("toast.synced", { n: synced }));
      void utils.invalidate();
    }
    if (failed.length) toast.error(t("toast.syncFailed", { n: failed.length, error: failed[0] }));
  }, [t, utils, me.id]);

  useEffect(() => {
    if (online) void syncNow();
  }, [online, syncNow]);

  const discard = useCallback((id: string) => removeQueued(id), []);

  return (
    <OfflineContext.Provider value={{ online, queue, syncing, syncNow, discard }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used inside OfflineProvider");
  return ctx;
}

type EntryResult = { queued: true } | { queued: false; challan: { id: number; number: string } };

/**
 * Submits an offline-capable entry. Online, it runs the mutation; offline (or
 * if the request never reaches the server) it queues the same input, keyed by
 * its clientMutationId, for replay.
 */
export function useEntrySubmit() {
  const { online } = useOffline();
  const me = useMe();
  return useCallback(
    async (
      entry: QueuedEntry & { label: string },
      run: () => Promise<{ id: number; number: string }>,
    ): Promise<EntryResult> => {
      const id = entry.input.clientMutationId;
      if (!id) throw new Error("clientMutationId required");
      if (!online) {
        await enqueue({ ...entry, id, userId: me.id });
        return { queued: true };
      }
      try {
        return { queued: false, challan: await run() };
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        await enqueue({ ...entry, id, userId: me.id });
        return { queued: true };
      }
    },
    [online, me.id],
  );
}
