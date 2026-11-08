import { eq } from "drizzle-orm";
import { db } from "@/db";
import { challans } from "@/db/schema";
import { appOrigin } from "@/lib/app-url";
import { getLocale } from "@/lib/i18n/server";
import { pdfFileName, renderChallanPdf } from "@/lib/pdf/challan-pdf";
import { loadChallanDetail } from "@/server/stock/challan-detail";

// Public PDF for whoever holds the QR/share link. No login.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (token.length < 16 || token.length > 64) return new Response("Not found", { status: 404 });
  const detail = await loadChallanDetail(db, eq(challans.publicToken, token));
  if (!detail) return new Response("Not found", { status: 404 });

  const pdf = await renderChallanPdf(detail, { locale: await getLocale(), origin: appOrigin(req) });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${pdfFileName(detail.number)}"`,
      "cache-control": "private, no-store",
    },
  });
}
