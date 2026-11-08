"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds (dev keeps HMR uncached). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((e) => {
      console.error("[sw] registration failed", e);
    });
  }, []);
  return null;
}
