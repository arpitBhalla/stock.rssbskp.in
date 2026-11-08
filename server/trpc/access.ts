import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { userDepartments, type DeptRole } from "@/db/schema";
import type { Queryable } from "@/db";

type Actor = { id: string; role?: string | null };

export const isAdmin = (u: Actor) => u.role === "admin";

/** The user's role in a department: admins act as managers everywhere. */
export async function deptRole(
  db: Queryable,
  u: Actor,
  departmentId: number,
): Promise<DeptRole | null> {
  if (isAdmin(u)) return "manager";
  const [row] = await db
    .select({ role: userDepartments.role })
    .from(userDepartments)
    .where(
      and(
        eq(userDepartments.userId, u.id),
        eq(userDepartments.departmentId, departmentId),
      ),
    );
  return row?.role ?? null;
}

export async function assertDeptManager(
  db: Queryable,
  u: Actor,
  departmentId: number,
) {
  if ((await deptRole(db, u, departmentId)) !== "manager") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a manager of this department",
    });
  }
}

/** Passes if the user manages at least one of the given departments. */
export async function assertManagerOfAny(
  db: Queryable,
  u: Actor,
  departmentIds: number[],
) {
  if (isAdmin(u)) return;
  const rows = await db
    .select({ id: userDepartments.departmentId })
    .from(userDepartments)
    .where(
      and(
        eq(userDepartments.userId, u.id),
        eq(userDepartments.role, "manager"),
        inArray(userDepartments.departmentId, departmentIds),
      ),
    );
  if (!rows.length) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a manager of this department",
    });
  }
}

/** Department ids the user belongs to; null means all (admin). */
export async function memberDepartmentIds(db: Queryable, u: Actor): Promise<number[] | null> {
  if (isAdmin(u)) return null;
  const rows = await db
    .select({ id: userDepartments.departmentId })
    .from(userDepartments)
    .where(eq(userDepartments.userId, u.id));
  return rows.map((r) => r.id);
}

/**
 * Rahdari, borrows and bill photos are visible to admins and to members of a
 * department on either side. (Stock levels stay visible to everyone so
 * departments can see whom to borrow from.)
 */
export async function canSeeDepartments(db: Queryable, u: Actor, ids: (number | null | undefined)[]) {
  const mine = await memberDepartmentIds(db, u);
  return mine === null || ids.some((id) => id != null && mine.includes(id));
}

export async function assertCanSeeDepartments(db: Queryable, u: Actor, ids: (number | null | undefined)[]) {
  if (!(await canSeeDepartments(db, u, ids))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not one of your departments" });
  }
}

export async function assertDeptMember(
  db: Queryable,
  u: Actor,
  departmentId: number,
) {
  if (!(await deptRole(db, u, departmentId))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this department",
    });
  }
}
