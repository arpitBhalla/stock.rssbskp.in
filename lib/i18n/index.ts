import { en, type MessageKey } from "./en";
import { hi } from "./hi";

export type { MessageKey };
export type Locale = "en" | "hi";
export const LOCALES: Locale[] = ["en", "hi"];
export const LOCALE_COOKIE = "locale";

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, hi };

export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "hi";
}

export function translate(locale: Locale, key: MessageKey, vars?: Vars) {
  const msg = dictionaries[locale][key] ?? en[key];
  if (!vars) return msg;
  return msg.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

export const makeT =
  (locale: Locale): Translate =>
  (key, vars) =>
    translate(locale, key, vars);

/** "1 item" / "3 items". */
export function itemsCount(t: Translate, n: number | string) {
  return t(Number(n) === 1 ? "common.itemCount" : "common.itemsCount", { n: formatQty(n) });
}

/** Number formatting shared by UI and PDF (Indian digit grouping). */
export function formatQty(n: number | string) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(
    Number(n),
  );
}

export function formatMoney(n: number | string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(n));
}

export function formatDate(d: Date | string, locale: Locale, withTime = false) {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(d));
}
