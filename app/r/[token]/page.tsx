import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { challans } from "@/db/schema";
import { getT } from "@/lib/i18n/server";
import { loadChallanDetail, type ChallanDetail } from "@/server/stock/challan-detail";
import { RahdariView } from "@/components/app/rahdari-view";
import { AckForm, LanguageToggle } from "./ack-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The receiver's phone and internal ids never leave the server.
function publicView(d: ChallanDetail) {
  const { issuedBy, billAttachmentId, acknowledgedByPhone, ...visible } = d;
  return visible;
}

/** Public page behind the Rahdari QR code. No login. */
export default async function PublicRahdariPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getT();
  const d = token.length >= 16 && token.length <= 64 ? await loadChallanDetail(db, eq(challans.publicToken, token)) : null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-primary">RSSB · Stock</p>
        <LanguageToggle />
      </div>
      {!d ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">{t("public.notFound")}</p>
      ) : (
        <>
          <RahdariView d={publicView(d)} />
          {d.status === "void" ? (
            <p className="rounded-xl bg-destructive/10 p-4 text-center text-destructive">{t("public.void")}</p>
          ) : d.acknowledgeable && d.status === "issued" ? (
            <AckForm token={token} />
          ) : null}
          <a
            href={`/r/${token}/pdf`}
            className="flex h-12 items-center justify-center rounded-xl border bg-card font-medium"
          >
            {t("rahdari.downloadPdf")}
          </a>
        </>
      )}
    </div>
  );
}
