import { eq } from "drizzle-orm";
import { db } from "@/db";
import { challans } from "@/db/schema";
import { auth } from "@/lib/auth";
import { appOrigin } from "@/lib/app-url";
import { getLocale } from "@/lib/i18n/server";
import { pdfFileName, renderChallanPdf } from "@/lib/pdf/challan-pdf";
import { loadChallanDetail } from "@/server/stock/challan-detail";
import { canSeeDepartments } from "@/server/trpc/access";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const detail = await loadChallanDetail(db, eq(challans.id, id));
  if (!detail) return new Response("Not found", { status: 404 });
  if (!(await canSeeDepartments(db, session.user, [detail.fromDepartmentId, detail.toDepartmentId]))) {
    return new Response("Forbidden", { status: 403 });
  }

  const pdf = await renderChallanPdf(detail, { locale: await getLocale(), origin: appOrigin(req) });
  const disposition = new URL(req.url).searchParams.has("download") ? "attachment" : "inline";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="${pdfFileName(detail.number)}"`,
      "cache-control": "private, no-store",
    },
  });
}
