"use client";

import { createContext, useContext } from "react";

export type Me = { id: string; name: string; username: string | null; role: string };

const MeContext = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function useMe() {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used inside MeProvider");
  return me;
}
