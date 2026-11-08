import Link from "next/link";
import { CloudOff } from "lucide-react";
import { getT } from "@/lib/i18n/server";

// Precached by the service worker; shown for pages never opened before.
export default async function OfflinePage() {
  const t = await getT();
  return (
    <div className="grid min-h-svh place-items-center px-6 text-center">
      <div className="max-w-xs space-y-4">
        <CloudOff className="mx-auto size-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{t("offline.title")}</h1>
        <p className="text-muted-foreground">{t("offline.body")}</p>
        <Link href="/" className="inline-flex h-11 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground">
          {t("offline.home")}
        </Link>
      </div>
    </div>
  );
}
