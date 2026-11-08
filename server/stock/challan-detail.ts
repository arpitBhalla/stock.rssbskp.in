import { asc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  borrows,
  centers,
  challanLines,
  challans,
  departments,
  items,
  user,
} from "@/db/schema";
import type { Queryable } from "@/db";

// Kinds whose goods go to someone who can confirm receipt.
export const ACKNOWLEDGEABLE = ["transfer", "return", "issue"] as const;

/** Everything needed to show or print one Rahdari. */
export async function loadChallanDetail(db: Queryable, where: SQL) {
  const fromDept = alias(departments, "from_dept");
  const toDept = alias(departments, "to_dept");
  const issuer = alias(user, "issuer");
  const acker = alias(user, "acker");

  const [row] = await db
    .select({
      challan: challans,
      centerName: centers.name,
      centerCode: centers.code,
      centerAddress: centers.address,
      fromName: fromDept.name,
      toName: toDept.name,
      issuedByName: issuer.name,
      acknowledgedByUserName: acker.name,
      borrowStatus: borrows.status,
    })
    .from(challans)
    .innerJoin(centers, eq(centers.id, challans.centerId))
    .leftJoin(fromDept, eq(fromDept.id, challans.fromDepartmentId))
    .leftJoin(toDept, eq(toDept.id, challans.toDepartmentId))
    .innerJoin(issuer, eq(issuer.id, challans.issuedBy))
    .leftJoin(acker, eq(acker.id, challans.acknowledgedBy))
    .leftJoin(borrows, eq(borrows.id, challans.borrowId))
    .where(where);
  if (!row) return null;

  const lines = await db
    .select({
      id: challanLines.id,
      itemId: challanLines.itemId,
      itemName: items.name,
      itemSku: items.sku,
      quantity: challanLines.quantity,
      unit: challanLines.unit,
      rate: challanLines.rate,
      amount: challanLines.amount,
    })
    .from(challanLines)
    .innerJoin(items, eq(items.id, challanLines.itemId))
    .where(eq(challanLines.challanId, row.challan.id))
    .orderBy(asc(challanLines.id));

  const c = row.challan;
  return {
    id: c.id,
    number: c.number,
    kind: c.kind,
    status: c.status,
    center: { name: row.centerName, code: row.centerCode, address: row.centerAddress },
    fromDepartmentId: c.fromDepartmentId,
    toDepartmentId: c.toDepartmentId,
    fromName: row.fromName,
    toName: row.toName,
    borrowId: c.borrowId,
    borrowStatus: row.borrowStatus,
    partyName: c.partyName,
    partyRef: c.partyRef,
    totalAmount: c.totalAmount,
    billAttachmentId: c.billAttachmentId,
    note: c.note,
    publicToken: c.publicToken,
    issuedBy: c.issuedBy,
    issuedByName: row.issuedByName,
    issuedAt: c.issuedAt,
    acknowledgedByName: c.acknowledgedByName ?? row.acknowledgedByUserName,
    acknowledgedByPhone: c.acknowledgedByPhone,
    acknowledgedAt: c.acknowledgedAt,
    voidedAt: c.voidedAt,
    voidReason: c.voidReason,
    acknowledgeable: (ACKNOWLEDGEABLE as readonly string[]).includes(c.kind),
    lines,
  };
}

export type ChallanDetail = NonNullable<Awaited<ReturnType<typeof loadChallanDetail>>>;
