import { db } from "@/db";
import { attachments } from "@/db/schema";
import { auth } from "@/lib/auth";

const MAX_BYTES = 1_500_000;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Upload a (client-compressed) photo of a vendor bill. */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
  if (!TYPES.includes(file.type)) return Response.json({ error: "Only JPEG, PNG or WebP" }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Photo too large" }, { status: 413 });

  const [row] = await db
    .insert(attachments)
    .values({
      contentType: file.type,
      byteSize: file.size,
      data: Buffer.from(await file.arrayBuffer()),
      createdBy: session.user.id,
    })
    .returning({ id: attachments.id });
  return Response.json({ id: row.id });
}
