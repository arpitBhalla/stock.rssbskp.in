import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  user,
  centers,
  departments,
  items,
  departmentInventory,
  inventoryTransactions,
  userDepartments,
} from "@/db/schema";
import { appRouter } from "@/server/trpc/routers/_app";
import type { Context } from "@/server/trpc/context";

// Sample data for local development only. Logins (username / password):
//   admin / admin12345      — admin, sees everything
//   langar / langar12345    — manager of Langar
//   tent / tent12345        — manager of Tent
//   sevadar / sevadar12345  — view-only member of Langar

async function makeUser(name: string, username: string, password: string, role: "admin" | "viewer") {
  const { user: created } = await auth.api.signUpEmail({
    body: { name, email: `${username}@stock.local`, password, username },
  });
  const [row] = await db.update(user).set({ role }).where(eq(user.id, created.id)).returning();
  return row;
}

function as(u: typeof user.$inferSelect) {
  return appRouter.createCaller({
    db,
    user: u,
    session: { id: "seed", userId: u.id },
    ip: "seed",
    defer: () => {},
  } as unknown as Context);
}

async function main() {
  const [existing] = await db.select().from(centers).where(eq(centers.code, "SKP"));
  if (existing) {
    console.log("already seeded — skipping");
    process.exit(0);
  }

  console.log("→ users…");
  const admin = await makeUser("Admin", "admin", "admin12345", "admin");
  const langar = await makeUser("Ramesh (Langar)", "langar", "langar12345", "viewer");
  const tent = await makeUser("Suresh (Tent)", "tent", "tent12345", "viewer");
  const sevadar = await makeUser("Meena", "sevadar", "sevadar12345", "viewer");

  console.log("→ center, departments, items, opening stock…");
  const [center] = await db.insert(centers).values({ name: "SKP Centre", code: "SKP" }).returning();
  const depts = await db
    .insert(departments)
    .values([
      { centerId: center.id, name: "Langar", code: "LNG" },
      { centerId: center.id, name: "Tent", code: "TNT" },
      { centerId: center.id, name: "Sound", code: "SND" },
    ])
    .returning();
  const dept = Object.fromEntries(depts.map((d) => [d.code, d.id]));

  await db.insert(userDepartments).values([
    { userId: langar.id, departmentId: dept.LNG, role: "manager" },
    { userId: tent.id, departmentId: dept.TNT, role: "manager" },
    { userId: sevadar.id, departmentId: dept.LNG, role: "viewer" },
  ]);

  const catalog = await db
    .insert(items)
    .values([
      { name: "Steel glass", sku: "GLS-STL", unit: "pcs", barcode: "8901030865278" },
      { name: "Steel plate", sku: "PLT-STL", unit: "pcs" },
      { name: "Plastic chair", sku: "CHR-PLS", unit: "pcs" },
      { name: "Durrie 6×9 ft", sku: "DUR-69", unit: "pcs" },
      { name: "Tarpaulin 18×24 ft", sku: "TRP-1824", unit: "pcs" },
      { name: "Water jug 5 L", sku: "JUG-5L", unit: "pcs" },
      { name: "Microphone (wired)", sku: "MIC-W", unit: "pcs" },
    ])
    .returning();
  const item = Object.fromEntries(catalog.map((i) => [i.sku, i.id]));

  // [dept, sku, on hand, required] — a few rows are deliberately below required.
  const opening: [string, string, number, number][] = [
    ["LNG", "GLS-STL", 120, 300],
    ["LNG", "PLT-STL", 450, 400],
    ["LNG", "JUG-5L", 18, 25],
    ["TNT", "CHR-PLS", 260, 200],
    ["TNT", "DUR-69", 75, 100],
    ["TNT", "TRP-1824", 30, 20],
    ["SND", "MIC-W", 6, 8],
  ];
  await db.insert(departmentInventory).values(
    opening.map(([d, sku, qty, req]) => ({
      departmentId: dept[d],
      itemId: item[sku],
      quantity: String(qty),
      requiredQty: String(req),
    })),
  );
  await db.insert(inventoryTransactions).values(
    opening.map(([d, sku, qty]) => ({
      departmentId: dept[d],
      itemId: item[sku],
      delta: String(qty),
      kind: "intake" as const,
      note: "Opening stock",
      performedBy: admin.id,
    })),
  );

  console.log("→ sample Rahdari…");
  await as(langar).inventory.bulkIntake({
    departmentId: dept.LNG,
    partyName: "Sharma Steel Traders",
    partyRef: "B-1182",
    lines: [
      { itemId: item["GLS-STL"], quantity: 100, rate: 38 },
      { itemId: item["JUG-5L"], quantity: 6, rate: 145 },
    ],
  });

  const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const chairs = await as(langar).borrows.request({
    fromDepartmentId: dept.TNT,
    toDepartmentId: dept.LNG,
    dueDate: due,
    note: "Sunday satsang seating",
    lines: [
      { itemId: item["CHR-PLS"], quantity: 40 },
      { itemId: item["DUR-69"], quantity: 10 },
    ],
  });
  await as(tent).borrows.approve({ id: chairs.id });
  const lines = (await as(langar).borrows.byId({ id: chairs.id })).lines;
  await as(langar).borrows.recordReturn({
    id: chairs.id,
    lines: [{ borrowItemId: lines.find((l) => l.itemId === item["CHR-PLS"])!.id, quantity: 15 }],
  });

  await as(langar).inventory.issue({
    departmentId: dept.LNG,
    recipient: "Sunday satsang langar",
    lines: [{ itemId: item["PLT-STL"], quantity: 20 }],
  });

  // Left pending so Tent's Home shows a request to approve.
  await as(langar).borrows.request({
    fromDepartmentId: dept.TNT,
    toDepartmentId: dept.LNG,
    lines: [{ itemId: item["TRP-1824"], quantity: 5 }],
  });

  console.log("  ✓ seeded SKP Centre: 3 departments, 7 items, 4 users, sample receipts/transfers/returns");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
