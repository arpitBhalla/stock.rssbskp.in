import { and, asc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { challanLines, challans, departments, items, user, userDepartments } from "@/db/schema";
import { auth } from "@/lib/auth";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  // Plain numbers (incl. negative adjustments) stay numeric for spreadsheet sums.
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  // Neutralise text that a spreadsheet would treat as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Rahdari register as CSV, one row per line. ?from=&to=&departmentId= */
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const query = new URL(req.url).searchParams;
  const from = query.get("from");
  const to = query.get("to");
  const deptParam = Number(query.get("departmentId"));
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) {
    return new Response("Bad date", { status: 400 });
  }

  // Non-admins only see their own departments' Rahdari.
  let deptIds: number[] | null = deptParam > 0 ? [deptParam] : null;
  if (session.user.role !== "admin") {
    const mine = (
      await db
        .select({ id: userDepartments.departmentId })
        .from(userDepartments)
        .where(eq(userDepartments.userId, session.user.id))
    ).map((r) => r.id);
    deptIds = deptIds ? deptIds.filter((d) => mine.includes(d)) : mine;
    if (!deptIds.length) deptIds = [-1];
  }

  const fromDept = alias(departments, "from_dept");
  const toDept = alias(departments, "to_dept");
  const issuer = alias(user, "issuer");
  const ist = sql`(${challans.issuedAt} at time zone 'Asia/Kolkata')`;

  const rows = await db
    .select({
      number: challans.number,
      date: sql<string>`to_char(${ist}, 'YYYY-MM-DD HH24:MI')`,
      kind: challans.kind,
      status: challans.status,
      from: fromDept.name,
      to: toDept.name,
      party: challans.partyName,
      partyRef: challans.partyRef,
      item: items.name,
      sku: items.sku,
      qty: challanLines.quantity,
      unit: challanLines.unit,
      rate: challanLines.rate,
      amount: challanLines.amount,
      total: challans.totalAmount,
      issuedBy: issuer.name,
      receivedBy: challans.acknowledgedByName,
      receivedAt: sql<string | null>`to_char(${challans.acknowledgedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')`,
      note: challans.note,
      voidReason: challans.voidReason,
    })
    .from(challans)
    .innerJoin(challanLines, eq(challanLines.challanId, challans.id))
    .innerJoin(items, eq(items.id, challanLines.itemId))
    .innerJoin(issuer, eq(issuer.id, challans.issuedBy))
    .leftJoin(fromDept, eq(fromDept.id, challans.fromDepartmentId))
    .leftJoin(toDept, eq(toDept.id, challans.toDepartmentId))
    .where(
      and(
        from ? gte(sql`${ist}::date`, sql`${from}::date`) : undefined,
        to ? lt(sql`${ist}::date`, sql`${to}::date + 1`) : undefined,
        deptIds
          ? or(inArray(challans.fromDepartmentId, deptIds), inArray(challans.toDepartmentId, deptIds))
          : undefined,
      ),
    )
    .orderBy(asc(challans.issuedAt), asc(challans.id), asc(challanLines.id));

  const header = [
    "Number", "Date", "Kind", "Status", "From", "To", "Vendor / recipient", "Vendor bill no.",
    "Item", "SKU", "Qty", "Unit", "Rate", "Amount", "Invoice total", "Issued by",
    "Received by", "Received at", "Note", "Void reason",
  ];
  const lines = [header, ...rows.map((r) => Object.values(r))].map((cols) => cols.map(csvCell).join(","));
  const name = `rahdari-register${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.csv`;
  // BOM so Excel opens Hindi text as UTF-8.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
