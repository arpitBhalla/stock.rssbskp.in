import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { departments } from "./inventory";

export const deptRole = pgEnum("dept_role", ["manager", "viewer"]);

// Which departments a (non-admin) user works in. Admins see and manage all.
export const userDepartments = pgTable(
  "user_departments",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    role: deptRole("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.departmentId] }),
    index("user_departments_dept_idx").on(t.departmentId),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    // Language the notification text is sent in ("en" | "hi").
    locale: text("locale").notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

export type DeptRole = (typeof deptRole.enumValues)[number];
