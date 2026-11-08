import { eq } from "drizzle-orm";
import { challans } from "@/db/schema";
import type { DB } from "@/db";

export type ChallanRef = { id: number; number: string };

async function findByClientMutationId(db: DB, clientMutationId: string) {
  const [row] = await db
    .select({ id: challans.id, number: challans.number })
    .from(challans)
    .where(eq(challans.clientMutationId, clientMutationId));
  return row;
}

function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/**
 * Runs a Rahdari-creating mutation at most once per clientMutationId, so an
 * offline queue can safely replay submissions after a lost response.
 */
export async function idempotent(
  db: DB,
  clientMutationId: string | undefined,
  run: () => Promise<ChallanRef>,
): Promise<ChallanRef> {
  if (clientMutationId) {
    const existing = await findByClientMutationId(db, clientMutationId);
    if (existing) return existing;
  }
  try {
    return await run();
  } catch (e) {
    if (clientMutationId && isUniqueViolation(e)) {
      const existing = await findByClientMutationId(db, clientMutationId);
      if (existing) return existing;
    }
    throw e;
  }
}
