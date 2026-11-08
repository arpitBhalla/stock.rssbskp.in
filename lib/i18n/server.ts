import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, makeT, type Locale } from "./index";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : "en";
}

export async function getT() {
  return makeT(await getLocale());
}
