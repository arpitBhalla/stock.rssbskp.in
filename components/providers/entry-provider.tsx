"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { QuickActionsSheet } from "@/components/layout/quick-actions-sheet";
import { ReceiveSheet } from "@/components/entry/receive-sheet";
import { RequestSheet } from "@/components/entry/request-sheet";
import { ReturnSheet } from "@/components/entry/return-sheet";
import { IssueSheet } from "@/components/entry/issue-sheet";
import { AdjustSheet } from "@/components/entry/adjust-sheet";
import { ScanSheet } from "@/components/entry/scan-sheet";

export type EntryKind = "receive" | "request" | "return" | "issue" | "adjust" | "scan";
export type EntryPreset = {
  itemId?: number;
  itemName?: string;
  unit?: string;
  borrowId?: number;
  fromDepartmentId?: number;
};

type EntryValue = {
  openMenu: () => void;
  openEntry: (kind: EntryKind, preset?: EntryPreset) => void;
};

const EntryContext = createContext<EntryValue | null>(null);

/**
 * Hosts the ➕ menu and the entry sheets so any screen can open one with a
 * preset (e.g. "Adjust" from an item page). Each opening gets a fresh key so
 * forms start empty; the closed sheet stays mounted for its exit animation.
 */
export function EntryProvider({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<{ kind: EntryKind; preset?: EntryPreset; key: number; open: boolean } | null>(null);

  const openEntry = useCallback((kind: EntryKind, preset?: EntryPreset) => {
    setMenuOpen(false);
    setActive((a) => ({ kind, preset, key: (a?.key ?? 0) + 1, open: true }));
  }, []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const onOpenChange = (open: boolean) => {
    if (!open) setActive((a) => (a ? { ...a, open: false } : a));
  };

  const sheet = active ? { open: active.open, onOpenChange, preset: active.preset } : null;
  const key = active?.key;

  return (
    <EntryContext.Provider value={{ openMenu, openEntry }}>
      {children}
      <QuickActionsSheet open={menuOpen} onOpenChange={setMenuOpen} onPick={openEntry} />
      {sheet && active?.kind === "receive" ? <ReceiveSheet key={key} open={sheet.open} onOpenChange={onOpenChange} /> : null}
      {sheet && active?.kind === "request" ? <RequestSheet key={key} {...sheet} /> : null}
      {sheet && active?.kind === "return" ? <ReturnSheet key={key} {...sheet} /> : null}
      {sheet && active?.kind === "issue" ? <IssueSheet key={key} {...sheet} /> : null}
      {sheet && active?.kind === "adjust" ? <AdjustSheet key={key} {...sheet} /> : null}
      {sheet && active?.kind === "scan" ? <ScanSheet key={key} open={sheet.open} onOpenChange={onOpenChange} /> : null}
    </EntryContext.Provider>
  );
}

export function useEntry() {
  const ctx = useContext(EntryContext);
  if (!ctx) throw new Error("useEntry must be used inside EntryProvider");
  return ctx;
}
