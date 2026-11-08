import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq, inArray, sql } from "drizzle-orm";
import {
  centers,
  challanLines,
  challans,
  challanSeries,
  departments,
  items,
  type ChallanKind,
} from "@/db/schema";
import type { Tx } from "@/db";

export const KIND_CODE: Record<ChallanKind, string> = {
  receipt: "RC",
  transfer: "TR",
  return: "RT",
  adjustment: "AD",
  issue: "IS",
};

/** Indian fiscal year (April–March) for a moment, evaluated in IST. */
export function fiscalYear(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
  }).formatToParts(at);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function formatChallanNumber(
  centerCode: string,
  fy: string,
  kind: ChallanKind,
  n: number,
) {
  return `${centerCode}/${fy}/${KIND_CODE[kind]}-${String(n).padStart(5, "0")}`;
}

/**
 * Claims the next number in the (center, fiscal year, kind) series. The upsert
 * row-locks the counter until the surrounding transaction ends, which keeps
 * numbers gapless and unique under concurrency.
 */
async function claimNumber(
  tx: Tx,
  centerId: number,
  fy: string,
  kind: ChallanKind,
): Promise<number> {
  const [row] = await tx
    .insert(challanSeries)
    .values({ centerId, fiscalYear: fy, kind, nextNo: 2 })
    .onConflictDoUpdate({
      target: [challanSeries.centerId, challanSeries.fiscalYear, challanSeries.kind],
      set: { nextNo: sql`${challanSeries.nextNo} + 1` },
    })
    .returning({ nextNo: challanSeries.nextNo });
  return row.nextNo - 1;
}

export type ChallanLineInput = {
  itemId: number;
  quantity: number;
  rate?: number | null;
};

export type CreateChallanInput = {
  kind: ChallanKind;
  /** The department whose center owns the number series. */
  seriesDepartmentId: number;
  fromDepartmentId?: number | null;
  toDepartmentId?: number | null;
  borrowId?: number | null;
  partyName?: string | null;
  partyRef?: string | null;
  note?: string | null;
  billAttachmentId?: number | null;
  clientMutationId?: string | null;
  issuedBy: string;
  lines: ChallanLineInput[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function createChallan(tx: Tx, input: CreateChallanInput) {
  const [dept] = await tx
    .select({ centerId: departments.centerId, centerCode: centers.code })
    .from(departments)
    .innerJoin(centers, eq(centers.id, departments.centerId))
    .where(eq(departments.id, input.seriesDepartmentId));
  if (!dept) throw new TRPCError({ code: "NOT_FOUND", message: "Department not found" });

  const itemRows = await tx
    .select({ id: items.id, unit: items.unit })
    .from(items)
    .where(inArray(items.id, input.lines.map((l) => l.itemId)));
  const unitOf = new Map(itemRows.map((i) => [i.id, i.unit]));

  const isInvoice = input.kind === "receipt";
  const lines = input.lines.map((l) => {
    const unit = unitOf.get(l.itemId);
    if (!unit) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown item ${l.itemId}` });
    const rate = isInvoice ? round2(l.rate ?? 0) : null;
    return {
      itemId: l.itemId,
      quantity: String(l.quantity),
      unit,
      rate: rate === null ? null : rate.toFixed(2),
      amount: rate === null ? null : round2(rate * l.quantity).toFixed(2),
    };
  });
  const total = isInvoice
    ? round2(lines.reduce((s, l) => s + Number(l.amount), 0)).toFixed(2)
    : null;

  const issuedAt = new Date();
  const fy = fiscalYear(issuedAt);
  const n = await claimNumber(tx, dept.centerId, fy, input.kind);

  const [challan] = await tx
    .insert(challans)
    .values({
      number: formatChallanNumber(dept.centerCode, fy, input.kind, n),
      kind: input.kind,
      centerId: dept.centerId,
      fromDepartmentId: input.fromDepartmentId ?? null,
      toDepartmentId: input.toDepartmentId ?? null,
      borrowId: input.borrowId ?? null,
      partyName: input.partyName || null,
      partyRef: input.partyRef || null,
      totalAmount: total,
      billAttachmentId: input.billAttachmentId ?? null,
      note: input.note || null,
      publicToken: randomBytes(18).toString("base64url"),
      clientMutationId: input.clientMutationId ?? null,
      issuedBy: input.issuedBy,
      issuedAt,
    })
    .returning();

  await tx
    .insert(challanLines)
    .values(lines.map((l) => ({ ...l, challanId: challan.id })));

  return challan;
}
