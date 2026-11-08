import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  centers,
  departmentInventory,
  departments,
  items,
  user,
  userDepartments,
  type DeptRole,
} from "@/db/schema";
import { appRouter } from "@/server/trpc/routers/_app";
import type { Context } from "@/server/trpc/context";

const deferred: Promise<unknown>[] = [];

/** Waits for notification work scheduled with ctx.defer. */
export async function flushDeferred() {
  await Promise.allSettled(deferred.splice(0));
}

export async function resetDb() {
  await flushDeferred();
  await db.execute(
    sql`truncate "user", centers, items, attachments, challan_series restart identity cascade`,
  );
}

type TestUser = typeof user.$inferSelect;

export async function makeUser(
  name: string,
  role: "admin" | "manager" | "viewer" = "viewer",
  memberships: { departmentId: number; role: DeptRole }[] = [],
): Promise<TestUser> {
  const [u] = await db
    .insert(user)
    .values({ id: randomUUID(), name, email: `${name.toLowerCase()}@test.local`, role })
    .returning();
  if (memberships.length) {
    await db.insert(userDepartments).values(memberships.map((m) => ({ ...m, userId: u.id })));
  }
  return u;
}

export function callerFor(u: TestUser | null, ip = "127.0.0.1") {
  const ctx = {
    db,
    user: u,
    session: u ? { id: "s", userId: u.id } : null,
    ip,
    defer: (task: () => Promise<unknown>) => {
      deferred.push(task());
    },
  } as unknown as Context;
  return appRouter.createCaller(ctx);
}

/** Center SKP with Langar/Tent departments and a few stocked items. */
export async function fixture() {
  const [center] = await db.insert(centers).values({ name: "SKP Centre", code: "SKP" }).returning();
  const [lng, tnt] = await db
    .insert(departments)
    .values([
      { centerId: center.id, name: "Langar", code: "LNG" },
      { centerId: center.id, name: "Tent", code: "TNT" },
    ])
    .returning();
  const [glass, chair] = await db
    .insert(items)
    .values([
      { name: "Steel glass", sku: "GLS", unit: "pcs", barcode: "8901234567890" },
      { name: "Plastic chair", sku: "CHR", unit: "pcs" },
    ])
    .returning();
  await db.insert(departmentInventory).values([
    { departmentId: lng.id, itemId: glass.id, quantity: "100" },
    { departmentId: tnt.id, itemId: chair.id, quantity: "50" },
  ]);

  const admin = await makeUser("Admin", "admin");
  const lngManager = await makeUser("Lng", "viewer", [{ departmentId: lng.id, role: "manager" }]);
  const tntManager = await makeUser("Tnt", "viewer", [{ departmentId: tnt.id, role: "manager" }]);
  const tntViewer = await makeUser("TntViewer", "viewer", [{ departmentId: tnt.id, role: "viewer" }]);

  return { center, lng, tnt, glass, chair, admin, lngManager, tntManager, tntViewer };
}

export async function qtyOf(departmentId: number, itemId: number) {
  const rows = await db.execute<{ quantity: string }>(
    sql`select quantity from department_inventory where department_id = ${departmentId} and item_id = ${itemId}`,
  );
  return Number(rows.rows[0]?.quantity ?? 0);
}
