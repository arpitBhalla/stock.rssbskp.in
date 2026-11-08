import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  numeric,
  pgEnum,
  uniqueIndex,
  index,
  check,
  date,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { user } from "./auth";
import { challans } from "./challans";

export const borrowStatus = pgEnum("borrow_status", [
  "pending",
  "approved",
  "partially_returned",
  "returned",
  "rejected",
  "cancelled",
]);

export const txnKind = pgEnum("txn_kind", [
  "intake",
  "adjustment",
  "borrow_out",
  "borrow_in",
  "return_out",
  "return_in",
  "issue",
]);

export const centers = pgTable("centers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const departments = pgTable(
  "departments",
  {
    id: serial("id").primaryKey(),
    centerId: integer("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("departments_center_code_uq").on(t.centerId, t.code)],
);

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  unit: text("unit").notNull().default("pcs"),
  barcode: text("barcode").unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const departmentInventory = pgTable(
  "department_inventory",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    requiredQty: numeric("required_qty", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("department_inventory_dept_item_uq").on(
      t.departmentId,
      t.itemId,
    ),
    index("department_inventory_dept_idx").on(t.departmentId),
    check("department_inventory_qty_nonneg", sql`${t.quantity} >= 0`),
  ],
);

export const borrows = pgTable(
  "borrows",
  {
    id: serial("id").primaryKey(),
    fromDepartmentId: integer("from_department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    toDepartmentId: integer("to_department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    status: borrowStatus("status").notNull().default("pending"),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    approvedBy: text("approved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    dueDate: date("due_date"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("borrows_status_idx").on(t.status),
    index("borrows_from_dept_idx").on(t.fromDepartmentId),
    index("borrows_to_dept_idx").on(t.toDepartmentId),
  ],
);

export const borrowItems = pgTable(
  "borrow_items",
  {
    id: serial("id").primaryKey(),
    borrowId: integer("borrow_id")
      .notNull()
      .references(() => borrows.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    returnedQty: numeric("returned_qty", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
  },
  (t) => [index("borrow_items_borrow_idx").on(t.borrowId)],
);

export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    delta: numeric("delta", { precision: 14, scale: 3 }).notNull(),
    kind: txnKind("kind").notNull(),
    borrowId: integer("borrow_id").references(() => borrows.id, {
      onDelete: "set null",
    }),
    challanId: integer("challan_id").references(() => challans.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    performedBy: text("performed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inv_txn_dept_item_idx").on(t.departmentId, t.itemId),
    index("inv_txn_borrow_idx").on(t.borrowId),
    index("inv_txn_challan_idx").on(t.challanId),
    index("inv_txn_created_idx").on(sql`${t.createdAt} desc`),
  ],
);

// Relations
export const centersRelations = relations(centers, ({ many }) => ({
  departments: many(departments),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  center: one(centers, {
    fields: [departments.centerId],
    references: [centers.id],
  }),
  inventory: many(departmentInventory),
}));

export const itemsRelations = relations(items, ({ many }) => ({
  inventoryRows: many(departmentInventory),
}));

export const departmentInventoryRelations = relations(
  departmentInventory,
  ({ one }) => ({
    department: one(departments, {
      fields: [departmentInventory.departmentId],
      references: [departments.id],
    }),
    item: one(items, {
      fields: [departmentInventory.itemId],
      references: [items.id],
    }),
  }),
);

export const borrowsRelations = relations(borrows, ({ one, many }) => ({
  fromDepartment: one(departments, {
    fields: [borrows.fromDepartmentId],
    references: [departments.id],
    relationName: "borrows_from",
  }),
  toDepartment: one(departments, {
    fields: [borrows.toDepartmentId],
    references: [departments.id],
    relationName: "borrows_to",
  }),
  requester: one(user, {
    fields: [borrows.requestedBy],
    references: [user.id],
    relationName: "borrows_requester",
  }),
  approver: one(user, {
    fields: [borrows.approvedBy],
    references: [user.id],
    relationName: "borrows_approver",
  }),
  lines: many(borrowItems),
}));

export const borrowItemsRelations = relations(borrowItems, ({ one }) => ({
  borrow: one(borrows, {
    fields: [borrowItems.borrowId],
    references: [borrows.id],
  }),
  item: one(items, {
    fields: [borrowItems.itemId],
    references: [items.id],
  }),
}));

export type Center = typeof centers.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type Item = typeof items.$inferSelect;
export type DepartmentInventoryRow = typeof departmentInventory.$inferSelect;
export type Borrow = typeof borrows.$inferSelect;
export type BorrowItem = typeof borrowItems.$inferSelect;
export type InventoryTxn = typeof inventoryTransactions.$inferSelect;
