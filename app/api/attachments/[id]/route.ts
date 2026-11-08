import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, challans } from "@/db/schema";
import { canSeeDepartments } from "@/server/trpc/access";
import { auth } from "@/lib/auth";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id));
  if (!row) return new Response("Not found", { status: 404 });
  const [doc] = await db
    .select({ from: challans.fromDepartmentId, to: challans.toDepartmentId })
    .from(challans)
    .where(eq(challans.billAttachmentId, id));
  const allowed = doc
    ? await canSeeDepartments(db, session.user, [doc.from, doc.to])
    : row.createdBy === session.user.id || session.user.role === "admin";
  if (!allowed) return new Response("Forbidden", { status: 403 });

  return new Response(new Uint8Array(row.data), {
    headers: {
      "content-type": row.contentType,
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
