import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  numeric,
  primaryKey,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./auth";
import { borrows, centers, departments, items } from "./inventory";

// A challan is the "Rahdari" shown in the UI: the numbered document that goes
// with every stock movement. Receipts double as invoices (rate/amount/total).
export const challanKind = pgEnum("challan_kind", [
  "receipt",
  "transfer",
  "return",
  "adjustment",
  "issue",
]);

export const challanStatus = pgEnum("challan_status", [
  "issued",
  "acknowledged",
  "void",
]);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Photos of vendor bills. Stored in Postgres so the app needs no object
// storage; the client compresses images to well under 1 MB before upload.
export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  data: bytea("data").notNull(),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const challans = pgTable(
  "challans",
  {
    id: serial("id").primaryKey(),
    number: text("number").notNull().unique(),
    kind: challanKind("kind").notNull(),
    status: challanStatus("status").notNull().default("issued"),
    centerId: integer("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "restrict" }),
    fromDepartmentId: integer("from_department_id").references(
      () => departments.id,
      { onDelete: "restrict" },
    ),
    toDepartmentId: integer("to_department_id").references(
      () => departments.id,
      { onDelete: "restrict" },
    ),
    borrowId: integer("borrow_id").references(() => borrows.id, {
      onDelete: "set null",
    }),
    // Vendor/donor for receipts, recipient for issues.
    partyName: text("party_name"),
    // Vendor's own bill number on receipts.
    partyRef: text("party_ref"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
    billAttachmentId: integer("bill_attachment_id").references(
      () => attachments.id,
      { onDelete: "set null" },
    ),
    note: text("note"),
    publicToken: text("public_token").notNull().unique(),
    // Set by offline clients so a replayed submission returns the same Rahdari.
    clientMutationId: text("client_mutation_id").unique(),
    issuedBy: text("issued_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    acknowledgedBy: text("acknowledged_by").references(() => user.id, {
      onDelete: "set null",
    }),
    acknowledgedByName: text("acknowledged_by_name"),
    acknowledgedByPhone: text("acknowledged_by_phone"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    voidedBy: text("voided_by").references(() => user.id, {
      onDelete: "set null",
    }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
  },
  (t) => [
    index("challans_from_dept_idx").on(t.fromDepartmentId),
    index("challans_to_dept_idx").on(t.toDepartmentId),
    index("challans_borrow_idx").on(t.borrowId),
    index("challans_issued_at_idx").on(t.issuedAt.desc()),
  ],
);

export const challanLines = pgTable(
  "challan_lines",
  {
    id: serial("id").primaryKey(),
    challanId: integer("challan_id")
      .notNull()
      .references(() => challans.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    // Signed for adjustments, positive otherwise.
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unit: text("unit").notNull(),
    rate: numeric("rate", { precision: 14, scale: 2 }),
    amount: numeric("amount", { precision: 14, scale: 2 }),
  },
  (t) => [index("challan_lines_challan_idx").on(t.challanId)],
);

// Gapless numbering: one counter per center, fiscal year and kind. The counter
// row is incremented inside the same transaction as the stock movement, so a
// rollback also rolls the number back.
export const challanSeries = pgTable(
  "challan_series",
  {
    centerId: integer("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "cascade" }),
    fiscalYear: text("fiscal_year").notNull(),
    kind: challanKind("kind").notNull(),
    nextNo: integer("next_no").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.centerId, t.fiscalYear, t.kind] })],
);

export const challansRelations = relations(challans, ({ one, many }) => ({
  center: one(centers, {
    fields: [challans.centerId],
    references: [centers.id],
  }),
  fromDepartment: one(departments, {
    fields: [challans.fromDepartmentId],
    references: [departments.id],
    relationName: "challans_from",
  }),
  toDepartment: one(departments, {
    fields: [challans.toDepartmentId],
    references: [departments.id],
    relationName: "challans_to",
  }),
  lines: many(challanLines),
}));

export const challanLinesRelations = relations(challanLines, ({ one }) => ({
  challan: one(challans, {
    fields: [challanLines.challanId],
    references: [challans.id],
  }),
  item: one(items, {
    fields: [challanLines.itemId],
    references: [items.id],
  }),
}));

export type Challan = typeof challans.$inferSelect;
export type ChallanLine = typeof challanLines.$inferSelect;
export type ChallanKind = (typeof challanKind.enumValues)[number];
