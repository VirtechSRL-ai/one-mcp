import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
// Browser identity projection. SQL migrations own the full schema and constraints.
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
