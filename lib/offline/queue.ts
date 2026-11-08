import { createStore, del, entries, set } from "idb-keyval";
import type { RouterInputs } from "@/lib/trpc/types";

// Entries that may be recorded without signal. Each carries a
// clientMutationId so the server applies it at most once.
export type QueuedEntry =
  | { path: "inventory.bulkIntake"; input: RouterInputs["inventory"]["bulkIntake"] }
  | { path: "inventory.issue"; input: RouterInputs["inventory"]["issue"] }
  | { path: "inventory.adjust"; input: RouterInputs["inventory"]["adjust"] }
  | { path: "borrows.recordReturn"; input: RouterInputs["borrows"]["recordReturn"] };

export type QueuedMutation = QueuedEntry & {
  id: string;
  /** Only replayed while this user is signed in (shared phones). */
  userId: string;
  label: string;
  createdAt: number;
  /** Set when the server rejected it (e.g. not enough stock); kept for review. */
  error?: string;
};

const store = typeof indexedDB === "undefined" ? undefined : createStore("stock-offline", "queue");
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeQueue(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function listQueue(): Promise<QueuedMutation[]> {
  if (!store) return [];
  const all = await entries<string, QueuedMutation>(store);
  return all.map(([, v]) => v).sort((a, b) => a.createdAt - b.createdAt);
}

export async function enqueue(entry: QueuedEntry & { id: string; userId: string; label: string }) {
  if (!store) throw new Error("Offline storage unavailable");
  await set(entry.id, { ...entry, createdAt: Date.now() }, store);
  emit();
}

export async function removeQueued(id: string) {
  if (!store) return;
  await del(id, store);
  emit();
}

export async function markQueuedError(m: QueuedMutation, error: string) {
  if (!store) return;
  await set(m.id, { ...m, error }, store);
  emit();
}
