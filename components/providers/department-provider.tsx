"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

export type DepartmentOption = RouterOutputs["departments"]["mine"][number];

type DepartmentContextValue = {
  /** Departments the user works in (all of them for admins). */
  departments: DepartmentOption[];
  current: DepartmentOption | null;
  /** Whether the user can record entries for the current department. */
  canManage: boolean;
  isLoading: boolean;
  select: (id: number) => void;
};

const DepartmentContext = createContext<DepartmentContextValue | null>(null);

// The selected department lives in localStorage so it survives app restarts.
const STORAGE_KEY = "stock.departmentId";
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

const getSnapshot = () => window.localStorage.getItem(STORAGE_KEY);
const getServerSnapshot = () => null;

function select(id: number) {
  window.localStorage.setItem(STORAGE_KEY, String(id));
  listeners.forEach((l) => l());
}

export function DepartmentProvider({ children }: { children: React.ReactNode }) {
  const mine = trpc.departments.mine.useQuery();
  const storedId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const departments = mine.data ?? [];
  const current =
    departments.find((d) => String(d.id) === storedId) ?? departments[0] ?? null;

  return (
    <DepartmentContext.Provider
      value={{
        departments,
        current,
        canManage: current?.role === "manager",
        isLoading: mine.isLoading,
        select,
      }}
    >
      {children}
    </DepartmentContext.Provider>
  );
}

export function useDepartment() {
  const ctx = useContext(DepartmentContext);
  if (!ctx) throw new Error("useDepartment must be used inside DepartmentProvider");
  return ctx;
}
