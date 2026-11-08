import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { departments, user, userDepartments } from "@/db/schema";
import { sendPush } from "@/lib/push";

/** Managers of a department; falls back to admins if it has none. */
async function managersOf(departmentId: number) {
  const rows = await db
    .select({ id: userDepartments.userId })
    .from(userDepartments)
    .where(
      and(
        eq(userDepartments.departmentId, departmentId),
        eq(userDepartments.role, "manager"),
      ),
    );
  if (rows.length) return rows.map((r) => r.id);
  const admins = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "admin"));
  return admins.map((a) => a.id);
}

async function deptName(id: number) {
  const [d] = await db
    .select({ name: departments.name })
    .from(departments)
    .where(eq(departments.id, id));
  return d?.name ?? "";
}

export async function notifyBorrowRequested(b: {
  id: number;
  fromDepartmentId: number;
  toDepartmentId: number;
  lineCount: number;
}) {
  const dept = await deptName(b.toDepartmentId);
  await sendPush(await managersOf(b.fromDepartmentId), (t) => ({
    title: t("push.requested.title"),
    body: t("push.requested.body", { dept, n: b.lineCount }),
    url: `/borrows/${b.id}`,
    tag: `borrow-${b.id}`,
  }));
}

export async function notifyBorrowDecision(
  b: { id: number; fromDepartmentId: number; requestedBy: string },
  decision: "approved" | "rejected",
  challanNumber?: string,
) {
  const dept = await deptName(b.fromDepartmentId);
  await sendPush([b.requestedBy], (t) =>
    decision === "approved"
      ? {
          title: t("push.approved.title"),
          body: t("push.approved.body", { dept, number: challanNumber ?? "" }),
          url: `/borrows/${b.id}`,
          tag: `borrow-${b.id}`,
        }
      : {
          title: t("push.rejected.title"),
          body: t("push.rejected.body", { dept }),
          url: `/borrows/${b.id}`,
          tag: `borrow-${b.id}`,
        },
  );
}

export async function notifyReturned(
  b: { id: number; fromDepartmentId: number; toDepartmentId: number },
  challan: { id: number; number: string },
) {
  const dept = await deptName(b.toDepartmentId);
  await sendPush(await managersOf(b.fromDepartmentId), (t) => ({
    title: t("push.returned.title"),
    body: t("push.returned.body", { dept, number: challan.number }),
    url: `/rahdari/${challan.id}`,
  }));
}

export async function notifyAcknowledged(c: {
  id: number;
  number: string;
  issuedBy: string;
  acknowledgedByName: string | null;
}) {
  await sendPush([c.issuedBy], (t) => ({
    title: t("push.ack.title"),
    body: t("push.ack.body", { number: c.number, name: c.acknowledgedByName ?? "" }),
    url: `/rahdari/${c.id}`,
  }));
}
