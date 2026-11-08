"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, makeT, type Locale, type Translate } from "@/lib/i18n";

type I18nValue = { locale: Locale; t: Translate; setLocale: (l: Locale) => void };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: makeT(locale),
      setLocale(next) {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      },
    }),
    [locale, router],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

export const useT = () => useI18n().t;
